# Chamada de vídeo 1-1 (WebRTC) — Design

**Data:** 2026-04-26
**Status:** Aprovado para implementação
**Sub-projeto:** 5 (Chat) — extensão pós-MVP

---

## Objetivo

Permitir que dois usuários em DM façam uma chamada de vídeo (com áudio) usando WebRTC peer-to-peer. Sinalização pelo Socket.io que já existe. STUN público do Google. Sem TURN, sem grupo, sem push notification — fase 1 enxuta para validar a feature.

---

## Decisões tomadas

| Decisão | Escolha |
|---------|---------|
| Topologia | 1-1 apenas (DM) |
| Tipos de chamada | Apenas vídeo (mic + cam por padrão; user pode mutar cada um durante a chamada) |
| Notificação | Apenas in-app (modal global). Sem push web. |
| UI ativa | Modal fullscreen com vídeo remoto grande + PiP local |
| Histórico | Salva mensagem no chat com `call_metadata` (jsonb) |
| Stack WebRTC | Nativo (`RTCPeerConnection`), sem libs |
| STUN | `stun:stun.l.google.com:19302` (público gratuito) |
| TURN | Não nesta fase (chamadas falham em redes restritivas — aceito) |
| Timeout de toque | 30 segundos |
| Som de toque | Sim, ringtone curto em loop |

Não-objetivos (fora de escopo desta fase):
- TURN próprio (sub-projeto futuro)
- Chamada em grupo (sub-projeto futuro, exige SFU)
- Screen share / virtual background
- Recording da chamada
- Push notification (web push) para chamada recebida
- Rediscagem clicando no histórico

---

## Estados da chamada

```
idle ──invite──> calling (caller) | ringing (callee)
                       │                  │
                       │              accept ──┐
                       │              reject ──┼──> idle
                       │              timeout ─┘
                       │
                  accepted ──> connecting ──ICE ok──> active ──hangup──> ended ──> idle
                                                                  │
                                                          peer-gone / cancel /
                                                              error / timeout
```

Status final salvo no `call_metadata.status`:
- `completed` — chamada teve `active` e foi encerrada por um dos lados
- `missed` — callee não atendeu em 30s
- `rejected` — callee clicou Recusar
- `cancelled` — caller cancelou antes do callee atender
- `failed` — erro técnico (peer-gone, ICE failure, etc)

---

## Schema do banco

Migration `0011_video_calls.sql`:

```sql
ALTER TABLE "messages" ADD COLUMN "call_metadata" jsonb;
```

Estrutura do JSON:

```ts
type CallMetadata = {
  status: 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'
  durationSec: number
  startedAt: string  // ISO
  endedAt: string    // ISO
  initiatorId: string
}
```

`schema.ts` ganha `callMetadata: jsonb('call_metadata').$type<CallMetadata>()`.

Mensagens com `call_metadata` não têm `content` regular nem attachments. Frontend e backend tratam `type: 'call'` como categoria à parte.

**Quem persiste:** sempre o **caller**. Single source of truth, evita duplicidade. Mesmo se o callee encerra, ele só emite `call:end`; o caller que recebe o evento dispara o `POST /chat/conversations/:id/messages`.

---

## Arquitetura geral

Tudo construído sobre o que já existe — não há serviço novo, nem mudança de transport.

| Camada | Mudança |
|--------|---------|
| DB | 1 coluna em `messages` (jsonb) |
| Backend service | `MessagesService.sendMessage` aceita `callMetadata` |
| Backend gateway | `chat.gateway.ts` ganha handlers para 6 eventos `call:*` |
| Backend controller | `enrichMessages` deriva `type: 'call'` e propaga `callMetadata` |
| Tipos compartilhados | `Message.type` ganha `'call'` + tipo `CallMetadata` |
| Frontend store | `useCall` (Pinia) gerencia estado da chamada ativa |
| Frontend UI | 4 componentes novos (CallButton, IncomingCallModal, CallScreen, CallSystemMessage) |

---

## Eventos de sinalização Socket.io

Convenção: `callId` é gerado pelo caller (uuid v4) e referenciado em todos os eventos. Servidor mantém `Map<callId, CallSession>` em memória apenas durante a chamada.

```ts
type CallSession = {
  callId: string
  initiatorId: string
  calleeId: string
  conversationId: string
  startedAt: Date
}
```

### Cliente → servidor

| Evento | Payload | Quem pode emitir |
|--------|---------|------------------|
| `call:invite` | `{ conversationId, callId }` | Iniciante (caller) |
| `call:accept` | `{ callId }` | Apenas callee |
| `call:reject` | `{ callId }` | Apenas callee |
| `call:cancel` | `{ callId }` | Apenas caller |
| `call:end` | `{ callId, durationSec }` | Caller ou callee (após active) |
| `call:signal` | `{ callId, type: 'offer'\|'answer'\|'ice', payload }` | Caller ou callee |

### Servidor → cliente

| Evento | Payload | Quem recebe |
|--------|---------|-------------|
| `call:incoming` | `{ callId, conversationId, fromUserId, fromName, fromAvatar }` | Callee |
| `call:accepted` | `{ callId }` | Caller |
| `call:rejected` | `{ callId }` | Caller |
| `call:cancelled` | `{ callId }` | Callee |
| `call:ended` | `{ callId, durationSec }` | Outro lado |
| `call:signal` | `{ callId, type, payload }` | Outro lado |
| `call:peer-gone` | `{ callId }` | Lado que ainda está |
| `call:failed` | `{ callId, code: 'BLOCKED'\|'NOT_FOUND'\|'PEER_OFFLINE' }` | Caller (apenas em invite reprovado) |

### Validações no servidor

- **`call:invite`**: caller é membro da conversation, conversation é do tipo `dm`, callee é o outro membro, não há bloqueio em qualquer direção, callee tem ao menos 1 socket conectado. Se falhar, emite `call:failed` ao caller. Se passar, cria sessão e emite `call:incoming` ao callee.
- **`call:accept` / `call:reject`**: validar que `socket.userId === sessao.calleeId`. Caso contrário ignora.
- **`call:cancel`**: validar que `socket.userId === sessao.initiatorId`.
- **`call:signal`**: validar que socket é caller ou callee da sessão. Forward "puro" para o outro lado, sem inspecionar payload.
- **`call:end`**: forward + remove sessão.
- **`disconnect`**: para cada sessão envolvendo este socket, emitir `call:peer-gone` ao outro peer e remover sessão.

Sessão expira sozinha após 30 minutos sem evento (limpeza opcional, evita leak).

---

## Fluxo da chamada

### Caller

```
1. Click no botão de chamada na DM
2. useCall.invite(conversationId, peerInfo):
   - callId = crypto.randomUUID()
   - localStream = await getUserMedia({ video: true, audio: true })
   - state = 'calling'
   - socket.emit('call:invite', { conversationId, callId })
   - Inicia timer de 30s. Se expirar antes de aceito → cancel + missed.
3. Recebe 'call:accepted':
   - state = 'connecting'
   - pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
   - localStream.getTracks().forEach(t => pc.addTrack(t, localStream))
   - pc.onicecandidate = e => e.candidate && socket.emit('call:signal', { callId, type:'ice', payload: e.candidate })
   - pc.ontrack = e => remoteStream = e.streams[0]
   - pc.onconnectionstatechange = ... (active quando 'connected')
   - offer = await pc.createOffer()
   - await pc.setLocalDescription(offer)
   - socket.emit('call:signal', { callId, type:'offer', payload: offer })
4. Recebe 'call:signal' type='answer' → pc.setRemoteDescription
5. Recebe 'call:signal' type='ice' → pc.addIceCandidate
6. pc.connectionState === 'connected' → state = 'active', startedAt = new Date()
7. Click hangup OU recebe 'call:ended':
   - durationSec = state==='active' ? (now - startedAt)/1000 : 0
   - status = computeStatus()  // ver tabela abaixo
   - socket.emit('call:end', { callId, durationSec })  // se foi o caller que clicou
   - cleanup: pc.close(), tracks.stop(), reset state
   - chatService.sendCallMessage(conversationId, callMetadata) — sempre, depois de qualquer término
8. Recebe 'call:rejected' / 'call:cancelled' / 'call:peer-gone' / 'call:failed' → mesmo que step 7 com status apropriado
```

**Tabela de cálculo de `status`** (no caller, no momento de persistir):

| Como terminou | status |
|---------------|--------|
| Recebeu `call:rejected` | `rejected` |
| Recebeu `call:peer-gone` antes de active | `failed` |
| Recebeu `call:peer-gone` depois de active | `completed` (com a duração até o evento) |
| Caller cancelou antes do accept | `cancelled` |
| Timeout de 30s no caller | `missed` |
| `call:end` recebido após active | `completed` |
| `pc.connectionState === 'failed'` antes de chegar em active | `failed` |

### Callee

```
1. Recebe 'call:incoming' { callId, fromUserId, fromName, fromAvatar }:
   - useCall.callId = callId, peer = { userId, name, avatar }
   - state = 'ringing'
   - IncomingCallModal aparece + ringtone começa
   - Timer de 30s para auto-dispensar. Não emite nada se expirar — caller já cancela por seu próprio timer.
2a. Click Atender → useCall.accept():
    - localStream = await getUserMedia(...)
    - socket.emit('call:accept', { callId })
    - state = 'connecting'
    - Cria RTCPeerConnection (mesma config), adiciona tracks, listeners idênticos ao caller
2b. Click Recusar → useCall.reject():
    - socket.emit('call:reject', { callId })
    - state = 'idle', cleanup
2c. 30s sem ação → IncomingCallModal some, state = 'idle' (sem emitir nada)
3. Recebe 'call:signal' type='offer':
   - pc.setRemoteDescription(offer)
   - answer = await pc.createAnswer()
   - pc.setLocalDescription(answer)
   - socket.emit('call:signal', { callId, type:'answer', payload: answer })
4. Recebe 'call:signal' type='ice' → pc.addIceCandidate
5. Connected → state = 'active'
6. Click hangup → socket.emit('call:end', { callId, durationSec }) — caller persiste mensagem.
   Cleanup: pc.close(), tracks.stop(), reset.
7. Recebe 'call:peer-gone' / 'call:cancelled' → cleanup. Não persiste mensagem (caller é responsável).
```

### Caso de borda — caller fecha browser durante `calling`

- Servidor detecta `disconnect` no socket do caller.
- Emite `call:peer-gone` ao callee.
- Remove sessão.
- Callee descarta state, ringtone para. **Mensagem não é persistida** (caller sumiu antes de poder gravar).

### Caso de borda — peer-gone durante `active`

- Quem ainda está, persiste mensagem com `status: 'completed'` e duração até o momento. (No fluxo do caller — se for o callee que ainda está, não persiste; aceito como limite desta fase.)

### Caso de borda — duas chamadas concorrentes

- Se o callee já está em outra chamada (`useCall.state !== 'idle'` no client), o socket emite no recebimento de `call:incoming` um `call:reject` automático com motivo `BUSY`. Caller vê `rejected`.
- Servidor não rastreia "ocupado". Confiamos no client.

---

## Componentes frontend

### `composables/useCall.ts` (Pinia store)

Estado global, único. No máximo uma chamada por vez.

```ts
type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'active' | 'ended'

export const useCall = defineStore('call', () => {
  const state = ref<CallState>('idle')
  const callId = ref<string | null>(null)
  const conversationId = ref<string | null>(null)
  const peer = ref<{ userId: string; displayName: string; avatarUrl: string | null } | null>(null)
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const micMuted = ref(false)
  const camMuted = ref(false)
  const startedAt = ref<Date | null>(null)
  const errorMessage = ref<string | null>(null)
  // internos
  let pc: RTCPeerConnection | null = null
  let inviteTimeoutId: number | null = null

  async function invite(conversationId, peer) { ... }
  async function accept() { ... }
  function reject() { ... }
  function cancel() { ... }
  function hangup() { ... }
  function toggleMic() { ... }
  function toggleCam() { ... }
  // ...listeners socket inicializados em authInit
})
```

Composable é o único que toca em `RTCPeerConnection` e `getUserMedia`. Componentes consomem só estado reativo.

### `components/CallButton.vue`

Pequeno botão `Phone` (Lucide) que aparece no header da DM. Click chama `call.invite(...)`. Disabled se `state !== 'idle'` ou se DM bloqueada.

### `components/IncomingCallModal.vue`

Renderizado em `App.vue` no nível root. Aparece quando `call.state === 'ringing'`. Layout:
- Avatar grande do peer (108px), nome, "Chamada de vídeo recebida"
- Dois botões grandes circulares: vermelho (`PhoneOff` — Recusar) e verde (`PhoneCall` — Atender)
- Toca som de ringtone em loop (`<audio>` com `loop` autoplay; ringtone arquivo em `public/sounds/ringtone.ogg`)
- z-index alto para sobrepor qualquer conteúdo
- Esc fecha = recusar

### `components/CallScreen.vue`

Renderizado em `App.vue` quando `call.state` é `calling | connecting | active`. Layout fullscreen preto:
- `<video>` cover do remoto. Se remoto ainda não chegou, mostra avatar + status texto centralizado (`Chamando…`, `Conectando…`).
- `<video>` PiP do local 160×120 absoluto canto inferior direito, mirror (`scaleX(-1)`), muted.
- Header semitransparente: avatar peer + nome + status (`Chamando…` / `Conectando…` / `00:34`).
- Footer com 3 botões circulares (mute mic, mute cam, hangup vermelho).
- Quando `camMuted`, esconde o `<video>` local e mostra avatar dentro do PiP.
- Quando o remoto está com `cam` desligado, mostra avatar grande no centro em vez do `<video>` cover.

### `components/CallSystemMessage.vue`

Substitui o bubble padrão quando `message.type === 'call'`. Cartão centralizado:
- Ícone (`Phone` verde se `completed`, `PhoneOff` vermelho se `missed/rejected/cancelled/failed`)
- Texto: "Chamada de vídeo · 02:34" / "Chamada perdida" / "Chamada recusada" / "Chamada cancelada" / "Falha na chamada"
- Hora (`timeAgo(message.createdAt)`)
- Não clicável (sem rediscagem nesta fase)

### Som de ringtone

Arquivo em `public/sounds/ringtone.ogg` (~3s, em loop). Tamanho-alvo <50KB. Não há player visual — som só por `<audio>` programático no `IncomingCallModal`.

---

## Mudanças no backend

### Migration + schema

`0011_video_calls.sql`: adiciona `call_metadata jsonb` em `messages`.

`schema.ts`: `messages` ganha `callMetadata: jsonb('call_metadata').$type<CallMetadata>()`.

### Contratos

`messages.repository.contract.ts` ganha:

```ts
export type CallMetadata = {
  status: 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'
  durationSec: number
  startedAt: string
  endedAt: string
  initiatorId: string
}

// Message ganha:
callMetadata: CallMetadata | null

// IMessagesRepository.createMessage ganha:
createMessage(data: {
  conversationId: string
  userId: string
  content?: string
  replyToId?: string
  callMetadata?: CallMetadata
}): Promise<Message>
```

### Repositório

`messages.repository.ts → createMessage`: aceita `callMetadata`, persiste no insert. `mapMessage` propaga.

### Service

`MessagesService.sendMessage` ganha branch:
- Se `data.callMetadata` presente, pula validação `EMPTY_MESSAGE` e cria mensagem só com metadata, sem attachments.
- Mantém checks de membership e bloqueio.

### Controller

`chat.controller.sendMessage`: schema do body Zod aceita `callMetadata` opcional. Repassa.

`chat.controller.enrichMessages`:
- Se `msg.callMetadata` existe → `type: 'call'`, inclui campo `callMetadata` no payload.
- `deriveMessageType` ganha branch para `call`.

### Gateway (a maior mudança)

`chat.gateway.ts` ganha:

```ts
// Mapa de sessões em memória
private callSessions = new Map<string, CallSession>()

// Em onConnection, registrar handlers:
socket.on('call:invite', async (data, ack) => { ... })
socket.on('call:accept', async (data) => { ... })
socket.on('call:reject', async (data) => { ... })
socket.on('call:cancel', async (data) => { ... })
socket.on('call:end', async (data) => { ... })
socket.on('call:signal', (data) => { ... })

// Em disconnect, varrer callSessions e emitir call:peer-gone
```

Helpers necessários (alguns já existem):
- `getUserSockets(userId)`: array de socket ids do usuário (já existe via mapa interno).
- `emitToUser(userId, event, payload)`: emit para todos sockets do usuário.

Bloqueio: usar `friendsService.isBlockedEitherDirection(callerId, calleeId)` em `call:invite`.

### Erros / `chat.errors.ts`

Strings novas que podem aparecer no `errorMessage` do cliente: `BLOCKED`, `NOT_FOUND`, `PEER_OFFLINE`, `BUSY`. (Não precisam mapeamento HTTP — só vêm em `call:failed` socket.)

---

## Mudanças no frontend

### `types.ts`

```ts
export type CallStatus = 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'

export interface CallMetadata {
  status: CallStatus
  durationSec: number
  startedAt: string
  endedAt: string
  initiatorId: string
}

// MessageType expande:
export type MessageType = 'text' | 'image' | 'audio' | 'file' | 'call'

// Em Message:
type: MessageType
callMetadata?: CallMetadata

// Em LastMessage:
type: MessageType
```

### Service

`chatService.ts` ganha:

```ts
export async function sendCallMessage(
  conversationId: string,
  callMetadata: CallMetadata,
): Promise<Message>
```

POST em `/chat/conversations/:id/messages` com body `{ callMetadata }`.

### Store

`composables/useCall.ts` (descrito antes). Inicializa listeners de socket no `authInit` (igual já é feito para `useChat`). Apenas uma instância da chamada por vez. Usa `useChat()` ou socket direto para acessar o socket compartilhado — preferência: socket direto via `useSocket()` se já existe, senão expor `chat.socket`.

### Integração

- `App.vue` (ou layout root) renderiza `<IncomingCallModal />` e `<CallScreen />` no topo.
- `MessageBubble.vue` ganha branch para `type === 'call'` → `<CallSystemMessage>`.
- `ConversationItem.vue` ganha branch para `type === 'call'` no preview → `📞 Chamada`.
- `MessageArea` (header da DM) ganha o botão `<CallButton>` ao lado dos outros (menu ⋮).

---

## Comportamento herdado / não muda

| Comportamento | Como já é |
|--------------|-----------|
| Bloqueio | `friendsService.isBlockedEitherDirection` no gateway antes de aceitar invite |
| Histórico aparecer no perfil/feed | Mensagens de chamada são tipo de mensagem do chat — fora do feed |
| Notificações in-app | Já existe módulo `notifications` mas não vai criar registro pra chamada nesta fase (apenas in-app modal) |

---

## Critérios de aceitação

- [ ] Migration `0011` aplica sem erro em banco com dados existentes.
- [ ] `MessagesService.sendMessage` aceita `callMetadata` e cria mensagem sem content.
- [ ] Caller em uma DM clica botão de ligar, callee em qualquer rota recebe modal de chamada com toque.
- [ ] Aceitar → ambos veem fullscreen com vídeos. Conexão estabelece em rede aberta.
- [ ] Mute mic / mute cam funcionam isolados (toggle de track).
- [ ] Encerrar de qualquer lado: outro lado vê fim, chamada vai pro histórico do chat (com `completed` + duração).
- [ ] Recusar: vai pro histórico como `rejected`.
- [ ] Cancelar antes do callee atender: histórico `cancelled`.
- [ ] Não atender em 30s: histórico `missed`.
- [ ] Caller fecha browser durante calling: callee vê toque desaparecer; sem mensagem no histórico (caller sumiu antes de poder gravar).
- [ ] Bloqueio em qualquer direção: caller recebe `call:failed` com `BLOCKED`, sem chegar a tocar no callee.
- [ ] Tentativa de chamada quando peer offline: caller recebe `call:failed` com `PEER_OFFLINE`.
- [ ] Lista de conversas mostra `📞 Chamada` no preview da `lastMessage` quando última mensagem é call.
- [ ] Reabrir DM mostra cartão de chamada na conversa, com status e duração corretos.

---

## Estimativa de impacto

- 1 migration (`0011`).
- ~6 arquivos backend modificados (schema, contrato, repo, service, controller, gateway). Gateway é o maior — ~200 linhas novas.
- ~7 arquivos frontend criados/modificados (types, service, useCall store, 4 componentes Vue, App.vue, MessageBubble, ConversationItem, MessageArea/ChatHeader).
- 1 asset novo: `public/sounds/ringtone.ogg`.
- Sem dependências novas (`RTCPeerConnection` é nativo).
