# Chamada de vídeo 1-1 (WebRTC) — Plano de Implementação

> **Spec:** `docs/superpowers/specs/2026-04-26-video-call-1to1-design.md`
> **Execução:** Inline nesta sessão (sem subagents) por preferência do usuário.

**Goal:** Permitir que dois usuários em DM façam uma chamada de vídeo 1-1 via WebRTC, com sinalização pelo Socket.io existente, modal global de chamada recebida, fullscreen com vídeo durante a chamada e histórico no chat.

**Architecture:** Reaproveita Socket.io para sinalização (sem REST nova). Estado da chamada vive em `Map<callId, CallSession>` em memória no gateway. Mensagem de chamada é persistida na tabela `messages` com coluna nova `call_metadata jsonb`. Frontend tem store global `useCall` (Pinia) gerenciando RTCPeerConnection e tracks, com 4 componentes Vue novos.

**Tech Stack:** Node + Fastify + Socket.io + Drizzle (existente). Frontend Vue 3 + Pinia + APIs nativas `RTCPeerConnection`, `getUserMedia`. STUN público `stun:stun.l.google.com:19302`. Sem libs novas.

---

## Mapa de arquivos

### Backend (`/home/dev/workspace_ssh/geek-social-api/`)

| Caminho | Ação |
|---------|------|
| `src/shared/infra/database/migrations/0011_video_calls.sql` | Criar |
| `src/shared/infra/database/migrations/meta/_journal.json` | Modificar (entry 11) |
| `src/shared/infra/database/schema.ts` | Modificar (`messages.callMetadata`) |
| `src/shared/contracts/messages.repository.contract.ts` | Modificar (Message + createMessage) |
| `src/modules/chat/messages.repository.ts` | Modificar (insert + map) |
| `src/modules/chat/messages.service.ts` | Modificar (sendMessage aceita callMetadata) |
| `src/modules/chat/chat.schema.ts` | Modificar (Zod do body) |
| `src/modules/chat/chat.controller.ts` | Modificar (sendMessage handler + enrichMessages) |
| `src/modules/chat/chat.gateway.ts` | Modificar (handlers `call:*` + injeção friendsRepo) |
| `src/app.ts` | Modificar (passar friendsRepo no construtor do gateway) |
| `tests/modules/chat/messages.service.test.ts` | Modificar (testes p/ callMetadata) |

### Frontend (`/home/dev/workspace_ssh/geek-social-frontend/`)

| Caminho | Ação |
|---------|------|
| `public/sounds/ringtone.ogg` | Criar (download dl) |
| `src/modules/chat/types.ts` | Modificar |
| `src/modules/chat/services/chatService.ts` | Modificar (sendCallMessage) |
| `src/modules/chat/composables/useCall.ts` | Criar (store Pinia) |
| `src/modules/chat/components/CallButton.vue` | Criar |
| `src/modules/chat/components/IncomingCallModal.vue` | Criar |
| `src/modules/chat/components/CallScreen.vue` | Criar |
| `src/modules/chat/components/CallSystemMessage.vue` | Criar |
| `src/modules/chat/components/MessageBubble.vue` | Modificar (branch type=call) |
| `src/modules/chat/components/ConversationItem.vue` | Modificar (preview Chamada) |
| `src/modules/chat/views/ChatView.vue` | Modificar (CallButton no header) |
| `src/App.vue` | Modificar (mount IncomingCallModal + CallScreen) |

---

## Convenções da execução

- **TDD apenas no service** (caminho que afeta business logic). Repositório, controller, gateway e frontend sem testes (segue convenção do projeto).
- **Um commit por Task**, mensagem em português.
- Reiniciar backend após mudanças. Frontend tem HMR.
- TypeScript 0 erros é critério de "passa".
- Apps já estão de pé (`localhost:3003` e `localhost:5173`).

---

## Task 1: Migration + schema

**Files:**
- Create: `src/shared/infra/database/migrations/0011_video_calls.sql`
- Modify: `src/shared/infra/database/migrations/meta/_journal.json`
- Modify: `src/shared/infra/database/schema.ts` (table `messages`)

- [ ] **Step 1.1: Criar migration SQL**

Conteúdo de `0011_video_calls.sql`:

```sql
ALTER TABLE "messages" ADD COLUMN "call_metadata" jsonb;
```

- [ ] **Step 1.2: Adicionar entry no `_journal.json`**

Acrescentar ao array `entries` (depois da entrada 10):

```json
{
  "idx": 11,
  "version": "7",
  "when": 1777000008000,
  "tag": "0011_video_calls",
  "breakpoints": true
}
```

- [ ] **Step 1.3: Atualizar `schema.ts`**

Localizar `export const messages = pgTable('messages', {...})`. Adicionar antes do `})` final:

```ts
  callMetadata: jsonb('call_metadata').$type<{
    status: 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'
    durationSec: number
    startedAt: string
    endedAt: string
    initiatorId: string
  }>(),
```

(O import de `jsonb` já existe no topo do arquivo.)

- [ ] **Step 1.4: Reiniciar backend e verificar**

```bash
pkill -f "tsx watch src/server.ts" 2>/dev/null; sleep 1
cd /home/dev/workspace_ssh/geek-social-api && npm run dev
```

Em outro terminal:

```bash
docker exec dev-postgres psql -U dev -d geek_social -c "\\d messages"
```

Esperado: linha `call_metadata | jsonb`.

- [ ] **Step 1.5: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 1.6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add src/shared/infra/database/migrations/0011_video_calls.sql \
        src/shared/infra/database/migrations/meta/_journal.json \
        src/shared/infra/database/schema.ts
git commit -m "feat(chat): adiciona coluna call_metadata em messages"
```

---

## Task 2: Contrato + repositório

**Files:**
- Modify: `src/shared/contracts/messages.repository.contract.ts`
- Modify: `src/modules/chat/messages.repository.ts`

- [ ] **Step 2.1: Adicionar `CallMetadata` e atualizar `Message` no contrato**

No topo do arquivo (após `MessageReaction`), adicionar:

```ts
export type CallMetadata = {
  status: 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'
  durationSec: number
  startedAt: string
  endedAt: string
  initiatorId: string
}
```

Em `Message`, adicionar campo:

```ts
export type Message = {
  id: string
  conversationId: string
  userId: string
  content: string | null
  replyToId: string | null
  callMetadata: CallMetadata | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2.2: Atualizar assinatura de `createMessage`**

```ts
createMessage(data: {
  conversationId: string
  userId: string
  content?: string
  replyToId?: string
  callMetadata?: CallMetadata
}): Promise<Message>
```

- [ ] **Step 2.3: Atualizar `messages.repository.ts → createMessage`**

Localizar `createMessage` (linha ~12). Substituir por:

```ts
async createMessage(data: {
  conversationId: string; userId: string; content?: string; replyToId?: string
  callMetadata?: CallMetadata
}): Promise<Message> {
  const [row] = await this.db.insert(messages).values({
    conversationId: data.conversationId,
    userId: data.userId,
    content: data.content ?? null,
    replyToId: data.replyToId ?? null,
    callMetadata: data.callMetadata ?? null,
  }).returning()
  return this.mapMessage(row)
}
```

Adicionar import no topo se necessário:

```ts
import type {
  IMessagesRepository, Message, MessageAttachment,
  MessageWithAttachments, MessageCursor, CallMetadata,
} from '../../shared/contracts/messages.repository.contract.js'
```

- [ ] **Step 2.4: Atualizar `mapMessage`**

Localizar `private mapMessage(row: any): Message` (linha ~154). Substituir por:

```ts
private mapMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userId: row.userId,
    content: row.content,
    replyToId: row.replyToId ?? null,
    callMetadata: (row.callMetadata as CallMetadata | null) ?? null,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
```

- [ ] **Step 2.5: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 2.6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add src/shared/contracts/messages.repository.contract.ts src/modules/chat/messages.repository.ts
git commit -m "feat(chat): persiste call_metadata em mensagens"
```

---

## Task 3: Service aceita callMetadata (TDD)

**Files:**
- Modify: `tests/modules/chat/messages.service.test.ts` (testes novos)
- Modify: `src/modules/chat/messages.service.ts` (`sendMessage`)

- [ ] **Step 3.1: Escrever testes (FAIL primeiro)**

Adicionar dentro do `describe('sendMessage', () => { ... })`:

```ts
it('deve criar mensagem de chamada apenas com callMetadata (sem content/anexos)', async () => {
  vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
  vi.mocked(repo.createMessage).mockResolvedValue(makeMessage({
    content: null,
    callMetadata: {
      status: 'completed',
      durationSec: 154,
      startedAt: '2026-04-26T15:00:00.000Z',
      endedAt: '2026-04-26T15:02:34.000Z',
      initiatorId: 'user-1',
    },
  }))
  vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments({
    content: null,
    callMetadata: {
      status: 'completed',
      durationSec: 154,
      startedAt: '2026-04-26T15:00:00.000Z',
      endedAt: '2026-04-26T15:02:34.000Z',
      initiatorId: 'user-1',
    },
  }))

  const result = await service.sendMessage('conv-1', 'user-1', {
    callMetadata: {
      status: 'completed',
      durationSec: 154,
      startedAt: '2026-04-26T15:00:00.000Z',
      endedAt: '2026-04-26T15:02:34.000Z',
      initiatorId: 'user-1',
    },
  })

  expect(repo.createMessage).toHaveBeenCalledWith({
    conversationId: 'conv-1',
    userId: 'user-1',
    content: undefined,
    callMetadata: {
      status: 'completed',
      durationSec: 154,
      startedAt: '2026-04-26T15:00:00.000Z',
      endedAt: '2026-04-26T15:02:34.000Z',
      initiatorId: 'user-1',
    },
  })
  expect(result.callMetadata?.status).toBe('completed')
})

it('mensagem com callMetadata não dispara EMPTY_MESSAGE mesmo sem content', async () => {
  vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
  vi.mocked(repo.createMessage).mockResolvedValue(makeMessage({ content: null }))
  vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments({ content: null }))

  await expect(
    service.sendMessage('conv-1', 'user-1', {
      callMetadata: {
        status: 'missed',
        durationSec: 0,
        startedAt: '2026-04-26T15:00:00.000Z',
        endedAt: '2026-04-26T15:00:30.000Z',
        initiatorId: 'user-1',
      },
    }),
  ).resolves.toBeDefined()
})
```

Atualizar `makeMessage` e `makeMessageWithAttachments` helpers (no topo do arquivo) para incluir `callMetadata: null`:

```ts
function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    userId: 'user-1',
    content: 'Olá!',
    replyToId: null,
    callMetadata: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt: new Date('2026-01-01T12:00:00Z'),
    ...overrides,
  }
}
```

(O `replyToId: null` também passa a ser explícito.)

Atualizar import no topo:

```ts
import type { IMessagesRepository, Message, MessageAttachment, MessageWithAttachments, CallMetadata } from '../../../src/shared/contracts/messages.repository.contract.js'
```

(Mesmo que `CallMetadata` não seja usado diretamente, importar pode ajudar; se Vitest reclamar de import sem uso, remover.)

- [ ] **Step 3.2: Rodar testes — FAIL**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run --project unit tests/modules/chat/messages.service.test.ts
```

Esperado: testes novos falham porque `sendMessage` não conhece `callMetadata`.

- [ ] **Step 3.3: Implementar branch no service**

Localizar `MessagesService.sendMessage` em `src/modules/chat/messages.service.ts`. Substituir o método inteiro por:

```ts
async sendMessage(
  conversationId: string,
  userId: string,
  data: { content?: string; attachmentIds?: string[]; replyToId?: string; callMetadata?: CallMetadata },
): Promise<MessageWithAttachments> {
  const member = await this.conversationsRepo.findMember(conversationId, userId)
  if (!member) throw new ChatError('NOT_FOUND')
  if (!member.permissions.can_send_messages) throw new ChatError('FORBIDDEN')

  // DM: bloqueio em qualquer direção impede envio (lado do servidor como salvaguarda)
  const conversation = await this.conversationsRepo.findById(conversationId)
  if (conversation?.type === 'dm') {
    const allMembers = await this.conversationsRepo.findMembers(conversationId)
    const other = allMembers.find(m => m.userId !== userId)
    if (other) {
      const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, other.userId)
      if (blocked) throw new ChatError('BLOCKED')
    }
  }

  const hasAttachments = data.attachmentIds && data.attachmentIds.length > 0
  const isCall = !!data.callMetadata
  if (!data.content && !hasAttachments && !isCall) throw new ChatError('EMPTY_MESSAGE')
  if (hasAttachments && !member.permissions.can_send_files) throw new ChatError('FORBIDDEN')

  if (hasAttachments) {
    const attachments = await this.repo.findAttachmentsByUploader(userId, data.attachmentIds!)
    if (attachments.length !== data.attachmentIds!.length) throw new ChatError('ATTACHMENT_NOT_FOUND')
  }

  const message = await this.repo.createMessage({
    conversationId, userId,
    content: data.content,
    replyToId: data.replyToId,
    callMetadata: data.callMetadata,
  })

  if (hasAttachments) {
    await this.repo.linkAttachments(message.id, data.attachmentIds!)
  }

  return (await this.repo.findMessageById(message.id))!
}
```

Garantir import no topo:

```ts
import type { IMessagesRepository, MessageWithAttachments, MessageCursor, CallMetadata } from '../../shared/contracts/messages.repository.contract.js'
```

- [ ] **Step 3.4: Rodar testes — PASS**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run --project unit tests/modules/chat/messages.service.test.ts
```

Esperado: todos passing.

- [ ] **Step 3.5: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 3.6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add tests/modules/chat/messages.service.test.ts src/modules/chat/messages.service.ts
git commit -m "feat(chat): sendMessage aceita callMetadata"
```

---

## Task 4: Controller — schema + enrichMessages

**Files:**
- Modify: `src/modules/chat/chat.schema.ts` (adicionar callMetadata Zod)
- Modify: `src/modules/chat/chat.controller.ts` (sendMessage handler + enrichMessages + deriveMessageType)

- [ ] **Step 4.1: Localizar schema atual de sendMessage**

```bash
grep -n "sendMessage\|callMetadata\|attachmentIds" /home/dev/workspace_ssh/geek-social-api/src/modules/chat/chat.schema.ts
```

Anotar onde está o schema de `sendMessage` (se existir). Se não houver schema dedicado, o handler está parsing inline.

- [ ] **Step 4.2: Atualizar schema do body de sendMessage**

Em `chat.schema.ts`, ao final do arquivo, adicionar (ou substituir o existente):

```ts
import { z } from 'zod'

export const callMetadataSchema = z.object({
  status: z.enum(['completed', 'missed', 'rejected', 'cancelled', 'failed']),
  durationSec: z.number().int().min(0),
  startedAt: z.string(),
  endedAt: z.string(),
  initiatorId: z.string().uuid(),
})

export const sendMessageBodySchema = z.object({
  content: z.string().optional(),
  attachmentIds: z.array(z.string().uuid()).optional(),
  replyToId: z.string().uuid().optional(),
  callMetadata: callMetadataSchema.optional(),
})
```

(Se já existir `sendMessageBodySchema` no arquivo, substituir mantendo as chaves novas. Se o `import { z }` já existe, não duplicar.)

- [ ] **Step 4.3: Atualizar `sendMessage` no controller**

Localizar o handler `async sendMessage(...)` no `chat.controller.ts`. Garantir que ele faz:

```ts
const body = sendMessageBodySchema.parse(req.body)
// ...
const raw = await this.messagesService.sendMessage(req.params.id, userId, {
  content: body.content,
  attachmentIds: body.attachmentIds,
  replyToId: body.replyToId,
  callMetadata: body.callMetadata,
})
```

Garantir import:

```ts
import { sendMessageBodySchema } from './chat.schema.js'
```

(Se já tinha um schema antigo importado, substituir o nome. Olhe o handler atual antes de editar.)

- [ ] **Step 4.4: Atualizar `enrichMessages` para tipo `call`**

Localizar `deriveMessageType` em `chat.controller.ts` (criada na fase de áudio). Substituir por:

```ts
function deriveMessageType(msg: { attachments: Array<{ mimeType: string }>; callMetadata?: unknown | null }): 'text' | 'image' | 'audio' | 'file' | 'call' {
  if (msg.callMetadata) return 'call'
  if (msg.attachments.length === 0) return 'text'
  const first = msg.attachments[0].mimeType
  if (first.startsWith('image/')) return 'image'
  if (first.startsWith('audio/')) return 'audio'
  return 'file'
}
```

Localizar a chamada `deriveMessageType(msg.attachments)` dentro do `enrichMessages.return msgs.map(...)`. Trocar para passar a mensagem inteira:

```ts
type: deriveMessageType(msg),
```

E também na construção do `replyTo`, trocar `deriveMessageType(replied.attachments)` por `deriveMessageType(replied)`.

Adicionar campo `callMetadata` no objeto retornado pela mensagem:

```ts
return {
  id: msg.id,
  conversationId: msg.conversationId,
  // ...campos existentes
  type: deriveMessageType(msg),
  callMetadata: msg.callMetadata ?? null,
  attachments: msg.attachments.map(a => ({ ... })),
  // ...
}
```

(Se o `msg` recebido em `enrichMessages` é tipado como `MessageWithAttachments`, deve ter `callMetadata` automaticamente após Task 2.)

- [ ] **Step 4.5: Atualizar derivação no `lastMessage` em `conversations.repository.ts`**

Localizar `deriveLastMessageType` em `src/modules/chat/conversations.repository.ts`. Substituir por:

```ts
private async deriveLastMessageType(messageId: string): Promise<'text' | 'image' | 'audio' | 'file' | 'call'> {
  const [msg] = await this.db
    .select({ callMetadata: messages.callMetadata })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
  if (msg?.callMetadata) return 'call'

  const atts = await this.db
    .select({ mimeType: messageAttachments.mimeType })
    .from(messageAttachments)
    .where(eq(messageAttachments.messageId, messageId))
    .limit(1)
  if (atts.length === 0) return 'text'
  const m = atts[0].mimeType
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('audio/')) return 'audio'
  return 'file'
}
```

Atualizar o tipo em `LastMessageInfo` (`src/shared/contracts/conversations.repository.contract.ts`):

```ts
export type LastMessageInfo = {
  id: string
  content: string | null
  senderId: string
  createdAt: Date
  type: 'text' | 'image' | 'audio' | 'file' | 'call'
}
```

- [ ] **Step 4.6: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4.7: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add src/modules/chat/chat.schema.ts \
        src/modules/chat/chat.controller.ts \
        src/modules/chat/conversations.repository.ts \
        src/shared/contracts/conversations.repository.contract.ts
git commit -m "feat(chat): controller deriva type=call e propaga callMetadata"
```

---

## Task 5: Gateway — handlers de signaling

**Files:**
- Modify: `src/modules/chat/chat.gateway.ts`
- Modify: `src/app.ts` (passar `friendsRepo` no construtor)

- [ ] **Step 5.1: Inspecionar app.ts para entender DI atual**

```bash
grep -n "ChatGateway\|friendsRepo\|new ChatGateway" /home/dev/workspace_ssh/geek-social-api/src/app.ts
```

Anotar:
- A linha onde `chatGateway = new ChatGateway(...)` é construído.
- Que `friendsRepository` já existe na seção friends do app.ts.

- [ ] **Step 5.2: Adicionar `friendsRepo` no construtor do gateway**

Em `chat.gateway.ts`, atualizar o constructor da classe:

```ts
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'

// ...

constructor(
  httpServer: HttpServer,
  private readonly conversationsService: ConversationsService,
  private readonly messagesService: MessagesService,
  private readonly presenceService: PresenceService,
  private readonly pushService: PushService,
  private readonly friendsRepo: IFriendsRepository,
  private readonly jwtVerify: JwtVerifyFn,
) {
  this.io = new SocketIOServer(httpServer, {
    cors: { origin: env.FRONTEND_URL, credentials: true },
  })
  this.setup()
}
```

- [ ] **Step 5.3: Atualizar `app.ts` para passar `friendsRepo`**

Em `app.ts`, na linha que instancia `ChatGateway`, adicionar `friendsRepository` antes do `jwtVerify`:

```ts
const chatGateway = new ChatGateway(
  httpServer,
  conversationsService,
  messagesService,
  presenceService,
  pushService,
  friendsRepository,   // <-- novo
  jwtVerify,
)
```

(Verificar o nome real da variável — pode ser `friendsRepo` ou similar; usar a que existe.)

- [ ] **Step 5.4: Adicionar tipo CallSession e estado no gateway**

No topo de `chat.gateway.ts`, após os imports:

```ts
type CallSession = {
  callId: string
  initiatorId: string
  calleeId: string
  conversationId: string
  startedAt: Date
}
```

Como property da classe (ao lado de `private io`):

```ts
private callSessions = new Map<string, CallSession>()
```

- [ ] **Step 5.5: Adicionar handlers `call:*` no `setup()`**

Dentro do `this.io.on('connection', async (socket) => { ... })`, depois do bloco `typing:stop` e antes do `disconnect`, inserir:

```ts
// ──────── WebRTC signaling ────────
socket.on('call:invite', async (data: { conversationId: string; callId: string }) => {
  try {
    if (!data?.callId || !data?.conversationId) return
    if (this.callSessions.has(data.callId)) return

    const conv = await this.conversationsService.getConversationById(data.conversationId, userId).catch(() => null)
    if (!conv || conv.type !== 'dm') {
      socket.emit('call:failed', { callId: data.callId, code: 'NOT_FOUND' })
      return
    }
    const peer = conv.participants.find(p => p.userId !== userId)
    if (!peer) {
      socket.emit('call:failed', { callId: data.callId, code: 'NOT_FOUND' })
      return
    }
    const isBlocked = await this.friendsRepo.isBlockedEitherDirection(userId, peer.userId)
    if (isBlocked) {
      socket.emit('call:failed', { callId: data.callId, code: 'BLOCKED' })
      return
    }
    if (!this.presenceService.isOnline(peer.userId)) {
      socket.emit('call:failed', { callId: data.callId, code: 'PEER_OFFLINE' })
      return
    }

    this.callSessions.set(data.callId, {
      callId: data.callId,
      initiatorId: userId,
      calleeId: peer.userId,
      conversationId: data.conversationId,
      startedAt: new Date(),
    })

    this.io.to(`user:${peer.userId}`).emit('call:incoming', {
      callId: data.callId,
      conversationId: data.conversationId,
      fromUserId: userId,
      fromName: (peer as any).fromName ?? null,
      fromAvatar: (peer as any).fromAvatar ?? null,
    })
  } catch {
    socket.emit('call:failed', { callId: data?.callId, code: 'NOT_FOUND' })
  }
})

socket.on('call:accept', (data: { callId: string }) => {
  const session = this.callSessions.get(data?.callId)
  if (!session) return
  if (session.calleeId !== userId) return
  this.io.to(`user:${session.initiatorId}`).emit('call:accepted', { callId: session.callId })
})

socket.on('call:reject', (data: { callId: string }) => {
  const session = this.callSessions.get(data?.callId)
  if (!session) return
  if (session.calleeId !== userId) return
  this.io.to(`user:${session.initiatorId}`).emit('call:rejected', { callId: session.callId })
  this.callSessions.delete(session.callId)
})

socket.on('call:cancel', (data: { callId: string }) => {
  const session = this.callSessions.get(data?.callId)
  if (!session) return
  if (session.initiatorId !== userId) return
  this.io.to(`user:${session.calleeId}`).emit('call:cancelled', { callId: session.callId })
  this.callSessions.delete(session.callId)
})

socket.on('call:end', (data: { callId: string; durationSec?: number }) => {
  const session = this.callSessions.get(data?.callId)
  if (!session) return
  if (session.initiatorId !== userId && session.calleeId !== userId) return
  const otherId = session.initiatorId === userId ? session.calleeId : session.initiatorId
  this.io.to(`user:${otherId}`).emit('call:ended', { callId: session.callId, durationSec: data.durationSec ?? 0 })
  this.callSessions.delete(session.callId)
})

socket.on('call:signal', (data: { callId: string; type: 'offer' | 'answer' | 'ice'; payload: unknown }) => {
  const session = this.callSessions.get(data?.callId)
  if (!session) return
  if (session.initiatorId !== userId && session.calleeId !== userId) return
  const otherId = session.initiatorId === userId ? session.calleeId : session.initiatorId
  this.io.to(`user:${otherId}`).emit('call:signal', {
    callId: session.callId,
    type: data.type,
    payload: data.payload,
  })
})
```

- [ ] **Step 5.6: Atualizar handler `disconnect` para emitir `call:peer-gone`**

Substituir o `socket.on('disconnect', ...)` existente por:

```ts
socket.on('disconnect', async () => {
  // Notificar peer das chamadas em andamento envolvendo este usuário
  for (const [callId, session] of this.callSessions.entries()) {
    if (session.initiatorId !== userId && session.calleeId !== userId) continue
    const otherId = session.initiatorId === userId ? session.calleeId : session.initiatorId
    if (this.presenceService.isOnline(otherId)) {
      this.io.to(`user:${otherId}`).emit('call:peer-gone', { callId })
    }
    this.callSessions.delete(callId)
  }

  const isNowOffline = this.presenceService.userDisconnected(userId, socket.id)
  if (isNowOffline) {
    const lastSeenAt = await this.presenceService.persistLastSeen(userId)
    this.io.to('presence').emit('presence:update', { userId, isOnline: false, lastSeenAt })
  }
})
```

- [ ] **Step 5.7: Verificar/expor `getConversationById` no `conversationsService`**

```bash
grep -n "getConversationById\|findConversationWithMeta" /home/dev/workspace_ssh/geek-social-api/src/modules/chat/conversations.service.ts
```

Se não houver `getConversationById(conversationId, userId)` que retorne `Conversation` com `participants`, use `findConversationWithMeta(conversationId, userId)`. Trocar a chamada do step 5.5:

```ts
const conv = await this.conversationsService.findConversationWithMeta(data.conversationId, userId).catch(() => null)
```

(Verificar nome real do método; pode estar em `conversationsRepo` se não exposto pelo service. Se for o caso, injetar `conversationsRepo` no gateway também ou expor um método novo no service. Solução pragmática: adicionar método público `getConversationWithMeta` em `conversationsService` que delega ao repo.)

- [ ] **Step 5.8: Sender info do `call:incoming`**

O `call:incoming` precisa de `fromName` e `fromAvatar` do caller (não do peer). Ajustar no step 5.5:

```ts
// Antes de emitir call:incoming, buscar dados do caller
const callerUser = await (this.conversationsService as any).getCallerInfo?.(userId)
  ?? null

// ou melhor: buscar via usersRepository se acessível
```

Solução mais simples: injetar `UsersRepository` também no gateway. Em `chat.gateway.ts`:

```ts
import type { UsersRepository } from '../users/users.repository.js'

constructor(
  // ...
  private readonly usersRepository: UsersRepository,
  // ...
)
```

E em `app.ts`, passar `usersRepository`:

```ts
const chatGateway = new ChatGateway(
  httpServer,
  conversationsService,
  messagesService,
  presenceService,
  pushService,
  friendsRepository,
  usersRepository,
  jwtVerify,
)
```

Refazer o trecho do `call:invite` no step 5.5, no momento de emitir `call:incoming`:

```ts
const callerInfo = await this.usersRepository.findById(userId)
this.io.to(`user:${peer.userId}`).emit('call:incoming', {
  callId: data.callId,
  conversationId: data.conversationId,
  fromUserId: userId,
  fromName: callerInfo?.displayName ?? 'Usuário',
  fromAvatar: callerInfo?.avatarUrl ?? null,
})
```

- [ ] **Step 5.9: Reiniciar backend e validar TS**

```bash
pkill -f "tsx watch src/server.ts" 2>/dev/null; sleep 1
cd /home/dev/workspace_ssh/geek-social-api && npm run dev
```

Em outro terminal:

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros e backend sobe.

- [ ] **Step 5.10: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add src/modules/chat/chat.gateway.ts src/app.ts src/modules/chat/conversations.service.ts
git commit -m "feat(chat): handlers de signaling WebRTC para chamadas 1-1"
```

---

## Task 6: Tipos no frontend

**Files:**
- Modify: `src/modules/chat/types.ts`

- [ ] **Step 6.1: Adicionar `CallStatus`, `CallMetadata`, `MessageType`**

No topo do arquivo (após `ConversationType`), adicionar:

```ts
export type CallStatus = 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'

export interface CallMetadata {
  status: CallStatus
  durationSec: number
  startedAt: string
  endedAt: string
  initiatorId: string
}

export type MessageType = 'text' | 'image' | 'audio' | 'file' | 'call'
```

- [ ] **Step 6.2: Atualizar `LastMessage.type`**

```ts
export interface LastMessage {
  id: string
  content: string
  senderId: string
  createdAt: string
  type: MessageType
}
```

- [ ] **Step 6.3: Atualizar `Message.type` e adicionar `callMetadata`**

```ts
export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  content: string
  type: MessageType
  attachments: MessageAttachment[]
  replyTo: MessageReply | null
  reactions: MessageReaction[]
  callMetadata?: CallMetadata
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
}
```

- [ ] **Step 6.4: Atualizar `SendMessagePayload`**

```ts
export interface SendMessagePayload {
  content?: string
  type?: MessageType
  replyToId?: string
  attachmentIds?: string[]
  callMetadata?: CallMetadata
}
```

- [ ] **Step 6.5: Atualizar `MessageReply.type`**

```ts
export interface MessageReply {
  id: string
  senderId: string
  senderName: string
  content: string
  type?: MessageType
}
```

- [ ] **Step 6.6: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 6.7: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/types.ts
git commit -m "feat(chat): tipos de chamada (CallStatus/CallMetadata)"
```

---

## Task 7: Service `sendCallMessage`

**Files:**
- Modify: `src/modules/chat/services/chatService.ts`

- [ ] **Step 7.1: Adicionar função `sendCallMessage`**

Após `sendMessage`, adicionar:

```ts
export async function sendCallMessage(
  conversationId: string,
  callMetadata: CallMetadata,
): Promise<Message> {
  const { data } = await api.post<Message>(
    `/chat/conversations/${conversationId}/messages`,
    { callMetadata },
  )
  return data
}
```

Garantir import:

```ts
import type {
  Conversation,
  Message,
  MessageAttachment,
  CallMetadata,
  PaginatedMessages,
  SendMessagePayload,
  CreateGroupPayload,
  DmRequest,
} from '../types'
```

- [ ] **Step 7.2: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 7.3: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/services/chatService.ts
git commit -m "feat(chat): chatService.sendCallMessage"
```

---

## Task 8: Asset de ringtone

**Files:**
- Create: `public/sounds/ringtone.ogg`

- [ ] **Step 8.1: Criar diretório**

```bash
mkdir -p /home/dev/workspace_ssh/geek-social-frontend/public/sounds
```

- [ ] **Step 8.2: Baixar/gerar ringtone**

Usar um arquivo permitido pelo dev. Se não houver fonte preferida, gerar um beep simples com `ffmpeg`:

```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=0.4" \
       -f lavfi -i "sine=frequency=550:duration=0.4" \
       -filter_complex "[0][1]concat=n=2:v=0:a=1,aloop=loop=-1:size=88200[out]" \
       -map "[out]" -t 3 -c:a libvorbis \
       /home/dev/workspace_ssh/geek-social-frontend/public/sounds/ringtone.ogg
```

(Se `ffmpeg` não estiver disponível, salvar um arquivo qualquer pequeno em `public/sounds/ringtone.ogg` — pode ser placeholder de 1s feito com `ffmpeg -f lavfi -i sine=frequency=440:duration=1 -c:a libvorbis ringtone.ogg`. Importante apenas existir um arquivo válido.)

- [ ] **Step 8.3: Verificar arquivo**

```bash
ls -la /home/dev/workspace_ssh/geek-social-frontend/public/sounds/ringtone.ogg
```

Esperado: arquivo existe, <50KB.

- [ ] **Step 8.4: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add public/sounds/ringtone.ogg
git commit -m "feat(chat): asset de ringtone para chamadas recebidas"
```

---

## Task 9: Store `useCall` (Pinia)

**Files:**
- Create: `src/modules/chat/composables/useCall.ts`

- [ ] **Step 9.1: Criar arquivo com store completa**

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getSocket } from '@/shared/socket/socket'
import { sendCallMessage } from '../services/chatService'
import type { CallMetadata, CallStatus } from '../types'

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'active' | 'ended'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
]

const RING_TIMEOUT_MS = 30_000

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
  const isInitiator = ref(false)

  let pc: RTCPeerConnection | null = null
  let inviteTimeoutId: number | null = null
  let pendingIce: RTCIceCandidateInit[] = []
  let remoteDescSet = false

  function ensureSocket() {
    const s = getSocket()
    if (!s) throw new Error('SOCKET_NOT_CONNECTED')
    return s
  }

  function buildPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    conn.onicecandidate = (e) => {
      if (e.candidate && callId.value) {
        ensureSocket().emit('call:signal', {
          callId: callId.value,
          type: 'ice',
          payload: e.candidate.toJSON(),
        })
      }
    }
    conn.ontrack = (e) => {
      remoteStream.value = e.streams[0] ?? new MediaStream([e.track])
    }
    conn.onconnectionstatechange = () => {
      if (!conn) return
      if (conn.connectionState === 'connected' && state.value === 'connecting') {
        state.value = 'active'
        startedAt.value = new Date()
      }
      if (conn.connectionState === 'failed') {
        finalize('failed')
      }
    }
    return conn
  }

  async function getMedia(): Promise<MediaStream> {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  }

  async function invite(convId: string, peerInfo: { userId: string; displayName: string; avatarUrl: string | null }) {
    if (state.value !== 'idle') return
    errorMessage.value = null
    try {
      localStream.value = await getMedia()
    } catch {
      errorMessage.value = 'Permissão de câmera/microfone negada.'
      return
    }
    callId.value = crypto.randomUUID()
    conversationId.value = convId
    peer.value = peerInfo
    isInitiator.value = true
    state.value = 'calling'
    ensureSocket().emit('call:invite', { conversationId: convId, callId: callId.value })

    inviteTimeoutId = window.setTimeout(() => {
      if (state.value === 'calling') {
        ensureSocket().emit('call:cancel', { callId: callId.value })
        finalize('missed')
      }
    }, RING_TIMEOUT_MS)
  }

  async function accept() {
    if (state.value !== 'ringing' || !callId.value) return
    try {
      localStream.value = await getMedia()
    } catch {
      reject()
      return
    }
    isInitiator.value = false
    state.value = 'connecting'
    pc = buildPeerConnection()
    for (const t of localStream.value.getTracks()) pc.addTrack(t, localStream.value)
    ensureSocket().emit('call:accept', { callId: callId.value })
  }

  function reject() {
    if (state.value !== 'ringing' || !callId.value) return
    ensureSocket().emit('call:reject', { callId: callId.value })
    finalize('rejected', /*persist*/ false)
  }

  function cancel() {
    if (state.value !== 'calling' || !callId.value) return
    ensureSocket().emit('call:cancel', { callId: callId.value })
    finalize('cancelled')
  }

  function hangup() {
    if (state.value !== 'active' && state.value !== 'connecting') return
    if (callId.value) {
      const dur = startedAt.value ? Math.floor((Date.now() - startedAt.value.getTime()) / 1000) : 0
      ensureSocket().emit('call:end', { callId: callId.value, durationSec: dur })
    }
    finalize(startedAt.value ? 'completed' : 'cancelled')
  }

  function toggleMic() {
    if (!localStream.value) return
    micMuted.value = !micMuted.value
    for (const t of localStream.value.getAudioTracks()) t.enabled = !micMuted.value
  }

  function toggleCam() {
    if (!localStream.value) return
    camMuted.value = !camMuted.value
    for (const t of localStream.value.getVideoTracks()) t.enabled = !camMuted.value
  }

  async function finalize(status: CallStatus, persist = true) {
    if (inviteTimeoutId !== null) {
      clearTimeout(inviteTimeoutId)
      inviteTimeoutId = null
    }
    const endedAt = new Date()
    const duration = startedAt.value ? Math.floor((endedAt.getTime() - startedAt.value.getTime()) / 1000) : 0
    const initiatorId = isInitiator.value
      ? // self é initiator
        await getSelfId()
      : peer.value?.userId ?? ''

    if (persist && isInitiator.value && conversationId.value) {
      try {
        await sendCallMessage(conversationId.value, {
          status,
          durationSec: duration,
          startedAt: (startedAt.value ?? endedAt).toISOString(),
          endedAt: endedAt.toISOString(),
          initiatorId,
        })
      } catch (e) {
        console.error('Failed to persist call message', e)
      }
    }

    cleanup()
  }

  function cleanup() {
    if (pc) {
      try { pc.close() } catch { /* ignore */ }
      pc = null
    }
    if (localStream.value) {
      for (const t of localStream.value.getTracks()) t.stop()
    }
    localStream.value = null
    remoteStream.value = null
    callId.value = null
    conversationId.value = null
    peer.value = null
    startedAt.value = null
    micMuted.value = false
    camMuted.value = false
    isInitiator.value = false
    pendingIce = []
    remoteDescSet = false
    state.value = 'idle'
  }

  async function getSelfId(): Promise<string> {
    // Carrega via auth store quando registrado em authInit; fallback vazio.
    try {
      const { useAuthStore } = await import('@/shared/auth/authStore')
      return useAuthStore().user?.id ?? ''
    } catch {
      return ''
    }
  }

  // ── socket listeners ────────────────────────────────
  function initSocketListeners() {
    const s = ensureSocket()

    s.on('call:incoming', async (data: { callId: string; conversationId: string; fromUserId: string; fromName: string; fromAvatar: string | null }) => {
      if (state.value !== 'idle') {
        // Auto-rejeitar se já em chamada (BUSY)
        s.emit('call:reject', { callId: data.callId })
        return
      }
      callId.value = data.callId
      conversationId.value = data.conversationId
      peer.value = { userId: data.fromUserId, displayName: data.fromName, avatarUrl: data.fromAvatar }
      isInitiator.value = false
      state.value = 'ringing'
      // Auto-dispense após 30s
      inviteTimeoutId = window.setTimeout(() => {
        if (state.value === 'ringing') {
          cleanup()
        }
      }, RING_TIMEOUT_MS)
    })

    s.on('call:accepted', async (data: { callId: string }) => {
      if (callId.value !== data.callId) return
      if (inviteTimeoutId !== null) { clearTimeout(inviteTimeoutId); inviteTimeoutId = null }
      state.value = 'connecting'
      pc = buildPeerConnection()
      if (localStream.value) {
        for (const t of localStream.value.getTracks()) pc.addTrack(t, localStream.value)
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      s.emit('call:signal', { callId: data.callId, type: 'offer', payload: offer })
    })

    s.on('call:rejected', (data: { callId: string }) => {
      if (callId.value !== data.callId) return
      finalize('rejected')
    })

    s.on('call:cancelled', (data: { callId: string }) => {
      if (callId.value !== data.callId) return
      finalize('cancelled', false)
    })

    s.on('call:ended', (data: { callId: string; durationSec: number }) => {
      if (callId.value !== data.callId) return
      finalize(startedAt.value ? 'completed' : 'cancelled')
    })

    s.on('call:peer-gone', (data: { callId: string }) => {
      if (callId.value !== data.callId) return
      finalize(startedAt.value ? 'completed' : 'failed')
    })

    s.on('call:failed', (data: { callId: string; code: string }) => {
      if (callId.value !== data.callId) return
      errorMessage.value = `Falha: ${data.code}`
      finalize('failed', false)
    })

    s.on('call:signal', async (data: { callId: string; type: 'offer' | 'answer' | 'ice'; payload: any }) => {
      if (callId.value !== data.callId || !pc) return
      if (data.type === 'offer') {
        await pc.setRemoteDescription(data.payload)
        remoteDescSet = true
        for (const c of pendingIce) await pc.addIceCandidate(c).catch(() => {})
        pendingIce = []
        const ans = await pc.createAnswer()
        await pc.setLocalDescription(ans)
        s.emit('call:signal', { callId: data.callId, type: 'answer', payload: ans })
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription(data.payload)
        remoteDescSet = true
        for (const c of pendingIce) await pc.addIceCandidate(c).catch(() => {})
        pendingIce = []
      } else if (data.type === 'ice') {
        if (remoteDescSet) {
          await pc.addIceCandidate(data.payload).catch(() => {})
        } else {
          pendingIce.push(data.payload)
        }
      }
    })
  }

  return {
    state, callId, peer, localStream, remoteStream, micMuted, camMuted,
    startedAt, errorMessage, isInitiator,
    invite, accept, reject, cancel, hangup, toggleMic, toggleCam,
    initSocketListeners,
  }
})
```

- [ ] **Step 9.2: Inicializar listeners no `authInit`**

Localizar onde `useChat` é inicializado em authInit ou App.vue:

```bash
grep -rn "useChat\(\)\.init\|chat.init\|authInit" /home/dev/workspace_ssh/geek-social-frontend/src --include="*.ts" --include="*.vue" | head -10
```

No mesmo lugar (ou em `main.ts` após `connectSocket`), invocar:

```ts
import { useCall } from '@/modules/chat/composables/useCall'

// Após connectSocket(token):
const call = useCall()
call.initSocketListeners()
```

(Garantir que isso roda **depois** do socket conectar. Se `useChat` faz isso em `authInit`, anexar a mesma chamada lá.)

- [ ] **Step 9.3: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 9.4: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/composables/useCall.ts
git commit -m "feat(chat): store useCall com gerenciamento de RTCPeerConnection"
```

---

## Task 10: `CallButton` (header da DM)

**Files:**
- Create: `src/modules/chat/components/CallButton.vue`
- Modify: `src/modules/chat/views/ChatView.vue` (adicionar antes do menu ⋮)

- [ ] **Step 10.1: Criar `CallButton.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { Phone } from 'lucide-vue-next'
import { useCall } from '../composables/useCall'
import type { Conversation } from '../types'

const props = defineProps<{ conversation: Conversation }>()
const call = useCall()

const otherParticipant = computed(() => {
  if (props.conversation.type !== 'dm') return null
  return props.conversation.participants.find(p => p.userId !== call.peer?.userId) ?? props.conversation.participants[0] ?? null
})

const isBlocked = computed(
  () => props.conversation.isBlockedByMe === true || props.conversation.isBlockedByOther === true,
)

const disabled = computed(() => isBlocked.value || call.state !== 'idle')

async function startCall() {
  if (disabled.value) return
  // pega o outro participante (não eu)
  const me = (await import('@/shared/auth/authStore')).useAuthStore().user?.id
  const other = props.conversation.participants.find(p => p.userId !== me)
  if (!other) return
  await call.invite(props.conversation.id, {
    userId: other.userId,
    displayName: other.displayName,
    avatarUrl: other.avatarUrl,
  })
}
</script>

<template>
  <button
    v-if="conversation.type === 'dm'"
    :disabled="disabled"
    @click="startCall"
    title="Iniciar chamada de vídeo"
    class="flex h-8 w-8 items-center justify-center rounded-lg text-(--color-text-secondary) hover:text-(--color-accent-amber) hover:bg-(--color-bg-elevated) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <Phone :size="18" />
  </button>
</template>
```

- [ ] **Step 10.2: Inserir `<CallButton>` no header da DM em `ChatView.vue`**

Localizar o bloco `<!-- Menu ⋮ (apenas DM) -->` (linha ~202). **Antes** desse bloco, adicionar:

```vue
<CallButton :conversation="activeConversation" />
```

E adicionar o import no `<script setup>`:

```ts
import CallButton from '../components/CallButton.vue'
```

- [ ] **Step 10.3: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 10.4: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/components/CallButton.vue src/modules/chat/views/ChatView.vue
git commit -m "feat(chat): botão de chamada no header da DM"
```

---

## Task 11: `IncomingCallModal`

**Files:**
- Create: `src/modules/chat/components/IncomingCallModal.vue`

- [ ] **Step 11.1: Criar componente**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Phone, PhoneOff } from 'lucide-vue-next'
import { useCall } from '../composables/useCall'

const call = useCall()
const audioRef = ref<HTMLAudioElement | null>(null)

const visible = computed(() => call.state === 'ringing')

watch(visible, (v) => {
  const a = audioRef.value
  if (!a) return
  if (v) {
    a.currentTime = 0
    void a.play().catch(() => { /* autoplay bloqueado, ignora */ })
  } else {
    a.pause()
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur"
    >
      <div class="bg-(--color-bg-surface) rounded-3xl p-8 flex flex-col items-center gap-6 min-w-[320px] shadow-2xl">
        <div class="flex flex-col items-center gap-3">
          <div class="relative">
            <img
              v-if="call.peer?.avatarUrl"
              :src="call.peer.avatarUrl"
              :alt="call.peer.displayName"
              class="w-28 h-28 rounded-full object-cover"
            />
            <div
              v-else
              class="w-28 h-28 rounded-full bg-slate-600 flex items-center justify-center text-3xl font-semibold text-slate-200"
            >
              {{ call.peer?.displayName.charAt(0).toUpperCase() ?? '?' }}
            </div>
            <span class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-(--color-accent-amber) flex items-center justify-center">
              <Phone class="w-4 h-4 text-black" />
            </span>
          </div>
          <p class="text-lg font-semibold text-(--color-text-primary)">
            {{ call.peer?.displayName ?? 'Usuário' }}
          </p>
          <p class="text-sm text-(--color-text-muted)">Chamada de vídeo recebida</p>
        </div>

        <div class="flex items-center gap-8">
          <button
            @click="call.reject()"
            title="Recusar"
            class="w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center"
          >
            <PhoneOff :size="22" />
          </button>
          <button
            @click="call.accept()"
            title="Atender"
            class="w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 text-white flex items-center justify-center"
          >
            <Phone :size="22" />
          </button>
        </div>
      </div>
      <audio
        ref="audioRef"
        src="/sounds/ringtone.ogg"
        loop
        preload="auto"
        class="hidden"
      ></audio>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 11.2: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 11.3: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/components/IncomingCallModal.vue
git commit -m "feat(chat): IncomingCallModal global para chamadas recebidas"
```

---

## Task 12: `CallScreen` (fullscreen)

**Files:**
- Create: `src/modules/chat/components/CallScreen.vue`

- [ ] **Step 12.1: Criar componente**

```vue
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-vue-next'
import { useCall } from '../composables/useCall'

const call = useCall()

const visible = computed(() => ['calling', 'connecting', 'active'].includes(call.state))
const localVideoRef = ref<HTMLVideoElement | null>(null)
const remoteVideoRef = ref<HTMLVideoElement | null>(null)

watch(() => call.localStream, (stream) => {
  if (localVideoRef.value && stream) {
    localVideoRef.value.srcObject = stream
  }
}, { immediate: true })

watch(() => call.remoteStream, (stream) => {
  if (remoteVideoRef.value && stream) {
    remoteVideoRef.value.srcObject = stream
  }
}, { immediate: true })

const elapsed = ref(0)
let timerId: ReturnType<typeof setInterval> | null = null

watch(() => call.state, (s) => {
  if (s === 'active' && !timerId) {
    timerId = setInterval(() => {
      const start = call.startedAt
      if (start) elapsed.value = Math.floor((Date.now() - start.getTime()) / 1000)
    }, 1000)
  } else if (s !== 'active' && timerId) {
    clearInterval(timerId)
    timerId = null
    elapsed.value = 0
  }
})

onUnmounted(() => { if (timerId) clearInterval(timerId) })

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const statusText = computed(() => {
  if (call.state === 'calling') return 'Chamando…'
  if (call.state === 'connecting') return 'Conectando…'
  if (call.state === 'active') return fmt(elapsed.value)
  return ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-[90] bg-black flex flex-col"
    >
      <!-- Header -->
      <div class="absolute top-0 left-0 right-0 p-4 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent z-10">
        <img
          v-if="call.peer?.avatarUrl"
          :src="call.peer.avatarUrl"
          :alt="call.peer.displayName"
          class="w-10 h-10 rounded-full object-cover"
        />
        <div
          v-else
          class="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200"
        >
          {{ call.peer?.displayName.charAt(0).toUpperCase() ?? '?' }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-semibold truncate">{{ call.peer?.displayName ?? 'Usuário' }}</p>
          <p class="text-white/70 text-sm font-mono">{{ statusText }}</p>
        </div>
      </div>

      <!-- Remote video (cover) -->
      <div class="flex-1 flex items-center justify-center bg-black">
        <video
          v-show="call.remoteStream"
          ref="remoteVideoRef"
          autoplay
          playsinline
          class="w-full h-full object-cover"
        ></video>
        <div
          v-show="!call.remoteStream"
          class="flex flex-col items-center gap-4 text-white/70"
        >
          <img
            v-if="call.peer?.avatarUrl"
            :src="call.peer.avatarUrl"
            :alt="call.peer.displayName"
            class="w-32 h-32 rounded-full object-cover"
          />
          <div
            v-else
            class="w-32 h-32 rounded-full bg-slate-600 flex items-center justify-center text-4xl font-semibold text-slate-200"
          >
            {{ call.peer?.displayName.charAt(0).toUpperCase() ?? '?' }}
          </div>
          <p class="text-lg">{{ statusText }}</p>
        </div>
      </div>

      <!-- Local video PiP -->
      <div class="absolute bottom-24 right-4 w-32 h-44 rounded-xl overflow-hidden bg-slate-800 border border-white/20 shadow-xl">
        <video
          v-show="call.localStream && !call.camMuted"
          ref="localVideoRef"
          autoplay
          playsinline
          muted
          class="w-full h-full object-cover scale-x-[-1]"
        ></video>
        <div
          v-show="!call.localStream || call.camMuted"
          class="w-full h-full flex items-center justify-center text-white/60"
        >
          <VideoOff :size="20" />
        </div>
      </div>

      <!-- Controls -->
      <div class="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
        <button
          @click="call.toggleMic()"
          :title="call.micMuted ? 'Ativar microfone' : 'Mutar microfone'"
          :class="[
            'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
            call.micMuted ? 'bg-red-500/80 hover:bg-red-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white',
          ]"
        >
          <Mic v-if="!call.micMuted" :size="22" />
          <MicOff v-else :size="22" />
        </button>
        <button
          @click="call.hangup()"
          title="Encerrar"
          class="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center"
        >
          <PhoneOff :size="26" />
        </button>
        <button
          @click="call.toggleCam()"
          :title="call.camMuted ? 'Ativar câmera' : 'Desligar câmera'"
          :class="[
            'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
            call.camMuted ? 'bg-red-500/80 hover:bg-red-500 text-white' : 'bg-white/20 hover:bg-white/30 text-white',
          ]"
        >
          <Video v-if="!call.camMuted" :size="22" />
          <VideoOff v-else :size="22" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 12.2: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 12.3: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/components/CallScreen.vue
git commit -m "feat(chat): CallScreen fullscreen com vídeos e controles"
```

---

## Task 13: `CallSystemMessage` + integração nos bubbles

**Files:**
- Create: `src/modules/chat/components/CallSystemMessage.vue`
- Modify: `src/modules/chat/components/MessageBubble.vue`
- Modify: `src/modules/chat/components/ConversationItem.vue`

- [ ] **Step 13.1: Criar `CallSystemMessage.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { Phone, PhoneOff, PhoneMissed } from 'lucide-vue-next'
import type { CallMetadata } from '../types'

const props = defineProps<{
  metadata: CallMetadata
  isOwn: boolean
}>()

const label = computed(() => {
  switch (props.metadata.status) {
    case 'completed': {
      const d = props.metadata.durationSec
      const m = Math.floor(d / 60)
      const s = d % 60
      return `Chamada de vídeo · ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    case 'missed':
      return props.isOwn ? 'Chamada não atendida' : 'Chamada perdida'
    case 'rejected':
      return props.isOwn ? 'Chamada recusada' : 'Você recusou'
    case 'cancelled':
      return props.isOwn ? 'Chamada cancelada' : 'Chamada cancelada'
    case 'failed':
      return 'Falha na chamada'
  }
})

const Icon = computed(() => {
  if (props.metadata.status === 'completed') return Phone
  if (props.metadata.status === 'missed') return PhoneMissed
  return PhoneOff
})

const iconColor = computed(() => {
  if (props.metadata.status === 'completed') return 'text-green-400'
  if (props.metadata.status === 'missed') return 'text-red-400'
  return 'text-(--color-text-muted)'
})
</script>

<template>
  <div class="flex justify-center my-2">
    <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--color-bg-elevated) border border-white/5 text-xs">
      <component :is="Icon" :class="['w-3.5 h-3.5', iconColor]" />
      <span class="text-(--color-text-secondary)">{{ label }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 13.2: Atualizar `MessageBubble.vue` para renderizar chamada**

Localizar o bloco que verifica `isDeleted` (linha ~120) ou no início do template do bubble. Adicionar um branch antes do bubble normal:

```vue
<!-- Chamada (system message) -->
<CallSystemMessage
  v-if="message.type === 'call' && message.callMetadata"
  :metadata="message.callMetadata"
  :is-own="isOwn"
/>

<!-- Resto do bubble (template existente) -->
<template v-else>
  <!-- ... avatar, bubble, etc ... -->
</template>
```

A maneira mais limpa: envelopar o `<div ... group>` raiz do template existente em um `<template>` condicional, mas como Vue não permite v-if em raiz com siblings facilmente, o pattern é: criar um root `<div>` que faz o switch:

```vue
<template>
  <CallSystemMessage
    v-if="message.type === 'call' && message.callMetadata"
    :metadata="message.callMetadata"
    :is-own="isOwn"
  />
  <div
    v-else
    :class="[
      'flex items-end gap-2 group',
      isOwn ? 'flex-row-reverse' : 'flex-row',
    ]"
  >
    <!-- ... resto inalterado ... -->
  </div>

  <!-- Image lightbox Teleport igual antes, fora do v-if -->
  <Teleport to="body">
    <!-- ... -->
  </Teleport>
</template>
```

Importar:

```ts
import CallSystemMessage from './CallSystemMessage.vue'
```

- [ ] **Step 13.3: Atualizar `ConversationItem.vue` preview**

Em `lastMessagePreview` (linha ~70), adicionar branch:

```ts
const lastMessagePreview = computed(() => {
  const msg = props.conversation.lastMessage
  if (!msg) return 'Sem mensagens ainda'
  if (msg.type === 'call') return '📞 Chamada'
  if (msg.type === 'audio') return '🎤 Mensagem de voz'
  if (msg.type === 'image') return '📷 Imagem'
  if (msg.type === 'file') return '📎 Arquivo'
  const content = msg.content ?? ''
  return content.length > 50 ? content.slice(0, 50) + '…' : content
})
```

- [ ] **Step 13.4: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 13.5: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/components/CallSystemMessage.vue \
        src/modules/chat/components/MessageBubble.vue \
        src/modules/chat/components/ConversationItem.vue
git commit -m "feat(chat): renderiza chamada no histórico (system message + preview)"
```

---

## Task 14: Mount global em `App.vue`

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 14.1: Adicionar `IncomingCallModal` e `CallScreen` no template**

Substituir o template atual por:

```vue
<template>
  <div class="flex h-screen overflow-hidden bg-(--color-bg-base)">
    <!-- Sidebar: oculta nas rotas públicas -->
    <AppSidebar v-if="showSidebar" />

    <!-- Conteúdo principal -->
    <main
      class="flex-1 min-h-0"
      :class="isFullHeight ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'"
    >
      <RouterView />
    </main>

    <!-- Globais de chamada (acima de qualquer rota) -->
    <IncomingCallModal />
    <CallScreen />
  </div>
</template>
```

E os imports no `<script setup>`:

```ts
import IncomingCallModal from '@/modules/chat/components/IncomingCallModal.vue'
import CallScreen from '@/modules/chat/components/CallScreen.vue'
```

- [ ] **Step 14.2: TypeScript check**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 14.3: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/App.vue
git commit -m "feat(chat): monta IncomingCallModal e CallScreen no nível App"
```

---

## Task 15: Smoke test ponta-a-ponta

- [ ] **Step 15.1: Garantir backend rodando**

```bash
ss -tlnp 2>/dev/null | grep ':3003'
```

Se não estiver, reiniciar:

```bash
cd /home/dev/workspace_ssh/geek-social-api && npm run dev
```

(Frontend tem HMR — não precisa restart.)

- [ ] **Step 15.2: TypeScript check final**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
cd /home/dev/workspace_ssh/geek-social-frontend && ./node_modules/.bin/vue-tsc --noEmit
```

Esperado: 0 erros nos dois.

- [ ] **Step 15.3: Rodar suite de testes do backend**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run --project unit
```

Esperado: testes da messages.service incluindo os novos passing.

- [ ] **Step 15.4: Cenários a verificar manualmente**

Em `localhost:5173`, autenticado em **dois browsers/perfis diferentes** ao mesmo tempo (User A e User B amigos):

1. **Iniciar chamada**: A abre DM com B, clica botão `📞`. Browser pede permissão de cam/mic. Aceita. UI vai pra "Chamando…".
2. **Receber chamada**: B vê modal global de chamada com nome + avatar de A, ringtone toca.
3. **Recusar**: B clica vermelho. Modal some. A vê fim. Histórico mostra "Chamada recusada".
4. **Atender**: B clica verde, browser pede permissão. Cai em fullscreen. ICE estabelece. Cada um vê o outro.
5. **Mute mic / mute cam**: ambos os botões togglam ícone e o outro lado para de receber audio/video correspondente.
6. **Encerrar**: A ou B clica vermelho. Os dois saem do fullscreen. Histórico mostra "Chamada de vídeo · MM:SS" no chat com duração correta.
7. **Cancelar mid-ring**: A liga, antes de B atender A clica "Cancelar" (no fullscreen "Chamando…"). B vê toque desaparecer. Histórico em A: "Chamada cancelada".
8. **Não atender (timeout)**: A liga, B nem clica. Após 30s, A vê encerrar automático. Histórico: "Chamada não atendida".
9. **Bloqueio**: A bloqueia B (no perfil ou menu). A clica chamar — recebe falha (errorMessage popup ou só silencioso). B não vê toque.
10. **Peer offline**: A com backend rodando, B com browser fechado. A liga — `call:failed` com `PEER_OFFLINE`.
11. **Lista de conversas**: após qualquer chamada, voltar pra lista — preview da DM mostra "📞 Chamada".
12. **Reabrir DM**: histórico mostra cartão central de chamada com status correto.
13. **Regressão**: enviar mensagem de texto/imagem/áudio normal — continua funcionando.

- [ ] **Step 15.5: Anotar pendências menores**

Falhas que não bloqueiem podem virar follow-up:
- Sem TURN: chamadas falham em redes restritivas — esperado para fase 1.
- Sem som de ringback no caller (apenas tela "Chamando…") — aceito.
- Auto-rejeitar quando já em outra chamada (BUSY) — implementado mas não testável sem 3 perfis simultâneos.

---

## Notas de execução

- **Permissão de cam/mic**: o browser só pede uma vez por origem. Se o user negar, a chamada falha graciosamente. Em desenvolvimento via `localhost`, navegador permite WebRTC sem HTTPS. Em produção precisa HTTPS — mas isso não afeta esta fase.
- **STUN só**: chamada exige que pelo menos um lado tenha conectividade direta após NAT traversal. Se ambos atrás de NAT simétrico ou CGNAT, falha. Aceito; sub-projeto B (TURN) resolve depois.
- **Reentrância**: se o user clicar no botão de chamar várias vezes rápido, `useCall` checa `state.value !== 'idle'` e ignora.
- **Recarregar página durante chamada**: socket cai, `disconnect` no servidor emite `peer-gone`, ambos os lados limpam. A página recarregada perde a chamada por design — sem reconnection lógica.
- **Caso `app.ts` ainda não tem `friendsRepository` exposto antes do gateway**: confirmar com `grep` antes de editar; se não houver, mover a instanciação do gateway para depois.
