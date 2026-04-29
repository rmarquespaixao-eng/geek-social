# Áudio no chat — Design

**Data:** 2026-04-26
**Status:** Aprovado para implementação
**Sub-projeto:** 5 (Chat) — extensão pós-MVP

---

## Objetivo

Permitir envio de mensagens de áudio (voice notes) em conversas do chat. UX inspirada em apps modernos: gravar pelo browser, ouvir antes de enviar, ver waveform na mensagem entregue.

---

## Decisões tomadas

| Decisão | Escolha |
|---------|---------|
| Origem do áudio | Gravação inline pelo browser (sem upload de arquivo pré-existente) |
| Modo de gravação | Tap-to-start / tap-to-stop com preview antes de enviar |
| Visual da mensagem | Waveform estático (peaks gerados no frontend antes do upload) |
| Limite de duração | 3 minutos (180 segundos) |
| Formato do arquivo | Nativo do `MediaRecorder` (webm/opus, mp4/aac no Safari) — sem reencode |
| Indicador na gravação | Timer simples + bolinha pulsando (sem waveform ao vivo) |
| Filename | Backend gera: `audio-YYYYMMDD-HHmmss-{8 chars uuid}.{ext}` |

Não-objetivos (fora de escopo):
- Transcrição automática (speech-to-text)
- Upload de arquivo de áudio existente
- Hold-to-record / gestos
- Permissão separada `can_send_voice` (reusa `can_send_files`)
- Push notifications específicas para áudio (vai pelo path de notificação genérica)

---

## Arquitetura

Reaproveita 100% da infra de attachments existente. Áudio é um `message_attachment` como qualquer outro arquivo, distinguido pelo `mime_type`. Sem rota nova no backend, sem dependência de sistema (sem ffmpeg, sem audiowaveform).

Mudanças por camada:

| Camada | Mudança |
|--------|---------|
| DB | 2 colunas novas em `message_attachments` |
| Backend | Validações condicionais por mime em `uploadAttachment`; geração de filename para áudio |
| Tipos compartilhados | `AttachmentType` ganha `'audio'`; `MessageAttachment` ganha `durationMs` e `waveformPeaks` opcionais |
| Frontend | Composable de gravação, componente de gravação inline, componente de player, integração com `MessageArea` e `MessageBubble` |

---

## Mudanças no schema

Migration `0010_audio_attachments.sql`:

```sql
ALTER TABLE "message_attachments"
  ADD COLUMN "duration_ms" integer,
  ADD COLUMN "waveform_peaks" jsonb;
```

- Ambas nullable. Só populadas quando `mime_type LIKE 'audio/%'`.
- `duration_ms`: inteiro em milissegundos (evita float; precisão suficiente).
- `waveform_peaks`: array JSON de 64 floats `[0..1]`. Tamanho fixo. ~512 bytes serializado.

Atualizar `schema.ts` (Drizzle) com os campos novos.

---

## Fluxo de envio (frontend)

```
1. User clica no ícone de microfone (MessageArea)
2. useAudioRecorder.start():
   - getUserMedia({ audio: true })
   - MediaRecorder.start()
   - Timer roda (atualizando elapsedMs a cada 100ms)
3. UI substitui input por AudioRecorderBar em modo "recording":
   [● 00:32 / 03:00]                [Cancelar] [Parar]
4. Aos 180s OU clique em Parar:
   - MediaRecorder.stop()
   - Blob final em mãos
   - Decode: AudioContext.decodeAudioData(buffer)
   - Peaks: 64 buckets, RMS por bucket, normalizado [0..1]
   - durationMs: AudioBuffer.duration * 1000 | 0
5. AudioRecorderBar entra em modo "preview":
   [▶  ▁▂▅▇▅▂▁  00:32]              [Descartar] [Enviar]
6. Click em Enviar:
   a. POST /chat/attachments (multipart):
      - file: Blob
      - filename: "voice.webm" (ignorado pelo backend)
      - durationMs: "32450"
      - waveformPeaks: "[0.1,0.4,...]" (64 valores)
   b. Backend devolve attachment.id
   c. POST /chat/conversations/:id/messages
      { attachmentIds: [id], replyToId? }
   d. Mensagem entra no fluxo socket normal (message:new)
   e. UI volta a "idle"
7. Click em Descartar / Cancelar:
   - useAudioRecorder.discard() (libera tracks, blob, audio context)
   - UI volta a "idle"
```

Limites:
- Duração: timer do recorder força stop aos 180.000ms.
- Tamanho: 6 MB (margem grande sobre 3min em opus 32kbps ≈ 720KB; protege contra blob corrompido).

Tratamento de erro:
- Permissão negada (`NotAllowedError`) → toast "Permissão de microfone negada".
- Sem dispositivo (`NotFoundError`) → toast "Nenhum microfone disponível".
- `MediaRecorder` não suportado → botão de microfone não aparece (feature detection).

---

## Componentes frontend

### `composables/useAudioRecorder.ts`

Encapsula `MediaRecorder` + `AudioContext`. Estados:

```
type RecorderState = 'idle' | 'requesting' | 'recording' | 'preview' | 'uploading' | 'error'
```

API:

```ts
const {
  state,         // Ref<RecorderState>
  elapsedMs,     // Ref<number> — só durante recording
  recordedBlob,  // Ref<Blob | null>
  durationMs,    // Ref<number | null>
  peaks,         // Ref<number[] | null>
  errorCode,     // Ref<string | null>
  start,         // () => Promise<void>
  stop,          // () => Promise<void>
  discard,       // () => void
} = useAudioRecorder({ maxMs: 180_000, peakBuckets: 64 })
```

Comportamento:
- `start()`: pede permissão; se OK, inicia gravação e timer; se falhar, seta `state='error'` + `errorCode`.
- `stop()`: para o recorder, decodifica blob, calcula peaks, transita para `preview`.
- `discard()`: libera tracks, blob, AudioContext; volta a `idle`.

Geração de peaks (algoritmo):
```
1. Decode blob → AudioBuffer
2. channelData = AudioBuffer.getChannelData(0) (mono ou primeiro canal)
3. bucketSize = floor(channelData.length / 64)
4. Para cada bucket: RMS = sqrt(mean(samples²))
5. Normaliza: peaks[i] = bucket_rms / max(all_rms)
   (se max=0, peaks vira array de zeros)
```

### `components/AudioRecorderBar.vue`

Substitui o input do `MessageArea` quando `recorder.state !== 'idle'`. Dois modos:

**Modo recording:**
```
[● 00:32]                              [Cancelar] [Parar]
```
- Bolinha vermelha pulsando (CSS animation)
- Timer ao vivo formatado `mm:ss`
- Botão "Cancelar" → `discard()`
- Botão "Parar" → `stop()` (transita para preview)

**Modo preview:**
```
[▶/⏸  ▁▂▅▇▅▂▁▁▂  00:32]              [Descartar] [Enviar]
```
- Play/pause com `<audio>` interno apontando para `URL.createObjectURL(blob)`
- Mini-waveform SVG renderizando os peaks
- Duração formatada
- Botão "Descartar" → `discard()`
- Botão "Enviar" → emite evento `send` com `{ blob, durationMs, peaks }`

### `components/AudioPlayer.vue`

Renderizado dentro de `MessageBubble` quando attachment tem `mimeType.startsWith('audio/')`. Layout:

```
[▶/⏸]  ▁▂▅▇▅▇▅▂▁▂▅▇▅▂▁  00:00 / 00:32
       └─ progresso amber sobreposto
```

- Botão play/pause (Lucide icons `Play` / `Pause`)
- Waveform: SVG com 64 `<rect>`, alturas baseadas em `peaks`. Cor cinza pra "não tocado", âmbar (`#f59e0b`) sobreposto pra parte tocada.
- Tempo: `currentTime / duration`
- Click na waveform faz seek (`audio.currentTime = (clickX/totalWidth) * duration`)
- `<audio>` element interno apontando pra `attachment.url` (S3)
- `preload="metadata"` para não baixar até o user dar play

### Integração

**`MessageArea.vue`:**
- Adiciona botão `Mic` (Lucide) ao lado do botão de anexo.
- Click → `recorder.start()`.
- Quando `recorder.state !== 'idle'`, substitui o input/anexar/enviar pelo `<AudioRecorderBar>`.
- No `send` do AudioRecorderBar, faz upload + envia mensagem (mesma rotina dos uploads de imagem, com campos extras).

**`MessageBubble.vue`:**
- Branch novo: `if (attachments[0]?.type === 'audio')` → renderiza `<AudioPlayer :attachment="...">`.
- Reply quote para áudio: `🎤 Mensagem de voz (00:32)`.

**`ConversationItem.vue`:**
- `lastMessage.type === 'audio'` → texto `🎤 Mensagem de voz` em vez do `content`.

---

## Mudanças no backend

### `messages.service.ts → uploadAttachment`

Assinatura nova:

```ts
async uploadAttachment(
  userId: string,
  conversationId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  sizeBytes: number,
  audioMeta?: { durationMs: number; waveformPeaks: number[] },
): Promise<MessageAttachment>
```

Lógica:
1. Verifica membership e `can_send_files` (já existe).
2. Verifica `sizeBytes <= 6 * 1024 * 1024` → senão `ATTACHMENT_TOO_LARGE`.
3. Se `mimeType.startsWith('image/')`: pipeline Sharp atual (resize/webp).
4. Se `mimeType.startsWith('audio/')`:
   - Mime na allowlist `audio/webm | audio/ogg | audio/mp4 | audio/mpeg | audio/aac`. Caso contrário, `UNSUPPORTED_AUDIO_FORMAT`.
   - `audioMeta` obrigatório → senão `AUDIO_METADATA_REQUIRED`.
   - `0 < durationMs <= 180_000` → senão `AUDIO_TOO_LONG`.
   - `waveformPeaks.length === 64` e cada item `>= 0 && <= 1` → senão `INVALID_WAVEFORM`.
   - Filename gerado: `audio-${YYYYMMDD}-${HHmmss}-${uuid8}.${ext}` (UTC, ext do mime).
   - Key S3: `chat/audio/${randomUUID()}.${ext}`.
   - Upload direto do buffer original (sem reencode).
   - Persiste com `durationMs` e `waveformPeaks`.
5. Outros mimes (não-imagem, não-áudio): comportamento atual (filename original, key `chat/attachments/...`).

### `messages.repository.ts → createAttachment`

Assinatura ganha `durationMs?: number | null` e `waveformPeaks?: number[] | null`. INSERT inclui as colunas novas.

### `chat.controller.ts → uploadAttachment`

Rota existente: `POST /conversations/:id/attachments`. Hoje usa `req.file()` (single file). Vai trocar para `req.parts()` (iterator de partes multipart) para extrair o arquivo + campos `durationMs` e `waveformPeaks`. Se mime é `audio/*`, repassa `audioMeta` ao service.

### `chat.errors.ts`

A classe atual `ChatError` aceita qualquer code string. Nada a adicionar — basta usar os codes novos:
- `AUDIO_TOO_LONG` (400)
- `AUDIO_METADATA_REQUIRED` (400)
- `UNSUPPORTED_AUDIO_FORMAT` (400)
- `INVALID_WAVEFORM` (400)
- `ATTACHMENT_TOO_LARGE` (413)

(O mapeamento code → status HTTP fica em `handleChatError`, que precisa receber as entradas novas.)

### `enrichMessage` (controller)

Já devolve `attachments` com todos os campos do row. Garantir que `durationMs` e `waveformPeaks` apareçam no objeto serializado. O `type` da mensagem é derivado do mime do primeiro attachment:

```ts
function deriveMessageType(attachments) {
  if (attachments.length === 0) return 'text'
  const first = attachments[0].mimeType
  if (first.startsWith('image/')) return 'image'
  if (first.startsWith('audio/')) return 'audio'
  return 'file'
}
```

Mesma derivação no `findUserConversations` para popular `lastMessage.type`.

---

## Mudanças nos tipos compartilhados (frontend)

`src/modules/chat/types.ts`:

```ts
export type AttachmentType = 'image' | 'audio' | 'file'

export interface MessageAttachment {
  id: string
  url: string
  type: AttachmentType
  name: string
  size: number
  durationMs?: number
  waveformPeaks?: number[]
}

export interface LastMessage {
  // ...
  type: 'text' | 'image' | 'audio' | 'file'
}

export interface Message {
  // ...
  type: 'text' | 'image' | 'audio' | 'file'
}
```

---

## Comportamento herdado (não precisa código novo)

| Comportamento | Como já funciona |
|--------------|------------------|
| Bloqueio | `MessagesService.sendMessage` checa `isBlockedEitherDirection`. Áudio passa pelo mesmo fluxo. |
| Reply | Funciona; preview do quote mostra "🎤 Mensagem de voz (mm:ss)". |
| Reações em áudio | Mesma rota e gateway. |
| Soft delete | `deleted_at` na message. Frontend já oculta. |
| Sanitização para bloqueado | Sender já mascarado pelo código existente. |
| Permissão | `can_send_files` cobre áudio. Sem nova permission. |
| Notificação | `notifications` já dispara em mensagem nova; nada específico de áudio. |

---

## Critérios de aceitação

- [ ] Migration `0010` aplica sem erro em banco com dados existentes.
- [ ] Não-imagens não-áudios continuam funcionando como antes (regression).
- [ ] Imagens continuam passando pelo Sharp e gerando webp.
- [ ] Gravação no Chrome/Firefox: webm/opus, peaks corretos, player funciona.
- [ ] Gravação no Safari (se disponível): mp4/aac, peaks corretos, player funciona.
- [ ] Limite de 3min: timer para automático aos 180s; backend rejeita 181s.
- [ ] Limite de 6MB: backend rejeita blob maior.
- [ ] Permissão negada: toast amigável, UI volta a idle.
- [ ] Áudio aparece como "🎤 Mensagem de voz" no preview da lista de conversas.
- [ ] Reply, reação, deleção funcionam em áudio.
- [ ] Mensagem de áudio respeita bloqueio (não chega via socket pro bloqueado).
- [ ] Botão de microfone só aparece se `MediaRecorder` está disponível.

---

## Estimativa de impacto

- 1 migration nova (0010).
- ~8 arquivos novos no frontend (composable, 2 componentes, ícones).
- ~5 arquivos modificados no frontend (`MessageArea`, `MessageBubble`, `ConversationItem`, `chat.service`, `types.ts`).
- ~5 arquivos modificados no backend (`messages.service`, `messages.repository`, `chat.routes`, `chat.errors`, `chat.controller` para enrich).
- Sem dependências novas em ambos os lados.
