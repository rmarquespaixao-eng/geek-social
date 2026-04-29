# Áudio no chat — Plano de Implementação

> **Spec:** `docs/superpowers/specs/2026-04-26-chat-audio-design.md`
> **Execução:** Inline nesta sessão (sem subagents) por preferência do usuário.

**Goal:** Permitir gravar e enviar mensagens de áudio (voice notes) inline no chat, com waveform estático e player no recipiente.

**Architecture:** Reaproveita a infra de `message_attachments` adicionando duas colunas (`duration_ms`, `waveform_peaks`). Backend valida tamanho e formato de áudio sem reencode. Frontend grava com `MediaRecorder`, gera peaks com `AudioContext` antes do upload e renderiza waveform SVG no `MessageBubble`.

**Tech Stack:** Backend Node + Fastify + Drizzle ORM + S3 (existente). Frontend Vue 3 + TypeScript + Tailwind v4 + APIs nativas `MediaRecorder` e `AudioContext` (sem libs novas).

---

## Mapa de arquivos

### Backend (`/home/dev/workspace_ssh/geek-social-api/`)

| Caminho | Ação |
|---------|------|
| `src/shared/infra/database/migrations/0010_audio_attachments.sql` | Criar |
| `src/shared/infra/database/migrations/meta/_journal.json` | Modificar (adicionar entry 0010) |
| `src/shared/infra/database/schema.ts` | Modificar (`messageAttachments`) |
| `src/shared/contracts/messages.repository.contract.ts` | Modificar (`MessageAttachment`, `createAttachment`) |
| `src/modules/chat/messages.repository.ts` | Modificar (`mapAttachment`, `createAttachment`) |
| `src/modules/chat/messages.service.ts` | Modificar (`uploadAttachment`) |
| `src/modules/chat/chat.controller.ts` | Modificar (`uploadAttachment`, `handleChatError`, `enrichMessages`) |
| `src/modules/chat/conversations.repository.ts` | Modificar (`lastMessage.type` derivado) |
| `tests/modules/chat/messages.service.test.ts` | Modificar (testes novos para áudio) |

### Frontend (`/home/dev/workspace_ssh/geek-social-frontend/`)

| Caminho | Ação |
|---------|------|
| `src/modules/chat/types.ts` | Modificar (tipos) |
| `src/modules/chat/services/chatService.ts` | Modificar (`uploadAttachment`) |
| `src/modules/chat/composables/useAudioRecorder.ts` | Criar |
| `src/modules/chat/components/AudioRecorderBar.vue` | Criar |
| `src/modules/chat/components/AudioPlayer.vue` | Criar |
| `src/modules/chat/components/MessageArea.vue` | Modificar |
| `src/modules/chat/components/MessageBubble.vue` | Modificar |
| `src/modules/chat/components/ConversationItem.vue` | Modificar |

---

## Convenções desta sessão

- **TDD apenas no service** (`MessagesService.uploadAttachment`). Repositório, controller e frontend sem testes (segue convenção do projeto).
- **Um commit por Task** após verificar a Task inteira (não commit por step). Mensagem em português.
- Após mudanças no backend, reiniciar o processo (kill + `npm run dev`). Frontend tem HMR e raramente precisa restart.
- TypeScript 0 erros é critério de "passa". Para o frontend rodar `npx vue-tsc --noEmit` ao final.

---

## Task 1: Migration + schema

**Files:**
- Create: `src/shared/infra/database/migrations/0010_audio_attachments.sql`
- Modify: `src/shared/infra/database/migrations/meta/_journal.json`
- Modify: `src/shared/infra/database/schema.ts:223-232` (add 2 columns)

- [ ] **Step 1.1: Verificar versão atual do journal**

```bash
cat /home/dev/workspace_ssh/geek-social-api/src/shared/infra/database/migrations/meta/_journal.json
```

Anotar último idx (deve ser 9, com tag `0009_*`).

- [ ] **Step 1.2: Criar migration SQL**

Conteúdo de `0010_audio_attachments.sql`:

```sql
ALTER TABLE "message_attachments" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD COLUMN "waveform_peaks" jsonb;
```

- [ ] **Step 1.3: Adicionar entry no `_journal.json`**

Acrescentar ao array `entries` (depois da entrada 9):

```json
{
  "idx": 10,
  "version": "7",
  "when": 1745700000000,
  "tag": "0010_audio_attachments",
  "breakpoints": true
}
```

(O `when` pode ser `Date.now()` no momento da criação.)

- [ ] **Step 1.4: Atualizar `schema.ts`**

Em `messageAttachments` (linhas ~223-232), depois de `displayOrder`:

```ts
export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  durationMs: integer('duration_ms'),
  waveformPeaks: jsonb('waveform_peaks').$type<number[]>(),
})
```

(Garantir que `jsonb` está importado de `drizzle-orm/pg-core` — já deve estar.)

- [ ] **Step 1.5: Reiniciar backend e verificar migration aplicou**

```bash
# matar processo atual e reiniciar
pkill -f "tsx watch src/server.ts" 2>/dev/null; sleep 1
cd /home/dev/workspace_ssh/geek-social-api && npm run dev
```

Em outro terminal:

```bash
docker exec dev-postgres psql -U dev -d geek_social -c "\\d message_attachments"
```

Esperado: vê as colunas `duration_ms integer` e `waveform_peaks jsonb`.

- [ ] **Step 1.6: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 1.7: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add src/shared/infra/database/migrations/0010_audio_attachments.sql \
        src/shared/infra/database/migrations/meta/_journal.json \
        src/shared/infra/database/schema.ts
git commit -m "feat(chat): adiciona colunas duration_ms e waveform_peaks em message_attachments"
```

---

## Task 2: Atualizar contrato e repositório

**Files:**
- Modify: `src/shared/contracts/messages.repository.contract.ts`
- Modify: `src/modules/chat/messages.repository.ts`

- [ ] **Step 2.1: Atualizar `MessageAttachment` no contrato**

Em `messages.repository.contract.ts:18-27`, substituir o tipo:

```ts
export type MessageAttachment = {
  id: string
  messageId: string | null
  uploadedBy: string
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
  displayOrder: number
  durationMs: number | null
  waveformPeaks: number[] | null
}
```

- [ ] **Step 2.2: Atualizar assinatura de `createAttachment` no contrato**

Mesmo arquivo, `IMessagesRepository.createAttachment`:

```ts
createAttachment(data: {
  uploadedBy: string
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
  displayOrder: number
  durationMs?: number | null
  waveformPeaks?: number[] | null
}): Promise<MessageAttachment>
```

- [ ] **Step 2.3: Atualizar `mapAttachment` no repositório**

Em `messages.repository.ts`, localizar a função `mapAttachment` (busque com `grep -n mapAttachment src/modules/chat/messages.repository.ts`). Garantir que ela inclui as duas colunas:

```ts
private mapAttachment(row: typeof messageAttachments.$inferSelect): MessageAttachment {
  return {
    id: row.id,
    messageId: row.messageId,
    uploadedBy: row.uploadedBy,
    url: row.url,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    displayOrder: row.displayOrder,
    durationMs: row.durationMs ?? null,
    waveformPeaks: (row.waveformPeaks as number[] | null) ?? null,
  }
}
```

- [ ] **Step 2.4: Atualizar `createAttachment` no repositório**

Localizar `createAttachment` no mesmo arquivo. Adicionar os campos novos no `insert`:

```ts
async createAttachment(data: {
  uploadedBy: string
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
  displayOrder: number
  durationMs?: number | null
  waveformPeaks?: number[] | null
}): Promise<MessageAttachment> {
  const [row] = await this.db.insert(messageAttachments).values({
    uploadedBy: data.uploadedBy,
    url: data.url,
    filename: data.filename,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    displayOrder: data.displayOrder,
    durationMs: data.durationMs ?? null,
    waveformPeaks: data.waveformPeaks ?? null,
  }).returning()
  return this.mapAttachment(row)
}
```

- [ ] **Step 2.5: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 2.6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add src/shared/contracts/messages.repository.contract.ts src/modules/chat/messages.repository.ts
git commit -m "feat(chat): persiste duration_ms e waveform_peaks em attachments"
```

---

## Task 3: Validações de áudio em `MessagesService.uploadAttachment` (TDD)

**Files:**
- Test: `tests/modules/chat/messages.service.test.ts` (modificar describe `uploadAttachment`)
- Modify: `src/modules/chat/messages.service.ts:84-122` (uploadAttachment)

### Step 3.1: Adicionar mocks de helper na suite

Em `tests/modules/chat/messages.service.test.ts`, dentro do `describe('uploadAttachment', () => { ... })`, garantir que existe um helper `makeAttachment` retornando o tipo novo. Buscar o helper existente e atualizá-lo:

```ts
function makeAttachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'att-1',
    messageId: null,
    uploadedBy: 'user-1',
    url: 'https://s3/x.webp',
    filename: 'x.webp',
    mimeType: 'image/webp',
    sizeBytes: 50000,
    displayOrder: 0,
    durationMs: null,
    waveformPeaks: null,
    ...overrides,
  }
}
```

### Step 3.2: Escrever testes novos (FAIL primeiro)

Adicionar dentro do `describe('uploadAttachment', () => { ... })`:

```ts
it('rejeita arquivo maior que 6MB com ATTACHMENT_TOO_LARGE', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  const big = Buffer.alloc(6 * 1024 * 1024 + 1)
  await expect(
    service.uploadAttachment('conv-1', 'user-1', big, 'audio/webm', 'a.webm', big.length, {
      durationMs: 5000, waveformPeaks: new Array(64).fill(0.1),
    }),
  ).rejects.toThrow('ATTACHMENT_TOO_LARGE')
})

it('rejeita áudio sem audioMeta com AUDIO_METADATA_REQUIRED', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  await expect(
    service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000),
  ).rejects.toThrow('AUDIO_METADATA_REQUIRED')
})

it('rejeita áudio com mime fora da allowlist com UNSUPPORTED_AUDIO_FORMAT', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  await expect(
    service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/flac', 'a.flac', 1000, {
      durationMs: 5000, waveformPeaks: new Array(64).fill(0.1),
    }),
  ).rejects.toThrow('UNSUPPORTED_AUDIO_FORMAT')
})

it('rejeita áudio com duração maior que 180.000ms com AUDIO_TOO_LONG', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  await expect(
    service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000, {
      durationMs: 180_001, waveformPeaks: new Array(64).fill(0.1),
    }),
  ).rejects.toThrow('AUDIO_TOO_LONG')
})

it('rejeita áudio com duração 0 com AUDIO_TOO_LONG', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  await expect(
    service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000, {
      durationMs: 0, waveformPeaks: new Array(64).fill(0.1),
    }),
  ).rejects.toThrow('AUDIO_TOO_LONG')
})

it('rejeita waveform com tamanho diferente de 64 com INVALID_WAVEFORM', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  await expect(
    service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000, {
      durationMs: 5000, waveformPeaks: new Array(32).fill(0.1),
    }),
  ).rejects.toThrow('INVALID_WAVEFORM')
})

it('rejeita waveform com valores fora de [0,1] com INVALID_WAVEFORM', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  const peaks = new Array(64).fill(0.1)
  peaks[10] = 1.5
  await expect(
    service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000, {
      durationMs: 5000, waveformPeaks: peaks,
    }),
  ).rejects.toThrow('INVALID_WAVEFORM')
})

it('aceita áudio válido, gera filename audio-YYYYMMDD-HHmmss-XXXXXXXX e persiste metadata', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  storage.upload = vi.fn().mockResolvedValue('https://s3/audio.webm')
  msgRepo.createAttachment = vi.fn().mockResolvedValue(
    makeAttachment({ mimeType: 'audio/webm', durationMs: 32450, waveformPeaks: new Array(64).fill(0.5) })
  )
  const peaks = new Array(64).fill(0.5)

  await service.uploadAttachment(
    'conv-1', 'user-1', Buffer.from('audio-bytes'), 'audio/webm', 'voice.webm', 11, {
      durationMs: 32450, waveformPeaks: peaks,
    },
  )

  expect(storage.upload).toHaveBeenCalledTimes(1)
  const createCall = (msgRepo.createAttachment as any).mock.calls[0][0]
  expect(createCall.filename).toMatch(/^audio-\d{8}-\d{6}-[a-f0-9]{8}\.webm$/)
  expect(createCall.mimeType).toBe('audio/webm')
  expect(createCall.durationMs).toBe(32450)
  expect(createCall.waveformPeaks).toEqual(peaks)
})

it('imagem grande (>6MB) é rejeitada antes do Sharp', async () => {
  convRepo.findMember = vi.fn().mockResolvedValue(makeMember())
  const big = Buffer.alloc(6 * 1024 * 1024 + 1)
  await expect(
    service.uploadAttachment('conv-1', 'user-1', big, 'image/png', 'big.png', big.length),
  ).rejects.toThrow('ATTACHMENT_TOO_LARGE')
})
```

### Step 3.3: Rodar testes — esperar FAIL

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run --project unit tests/modules/chat/messages.service.test.ts
```

Esperado: vários testes novos falhando ("does not throw" ou similar).

### Step 3.4: Implementar validações no service

Substituir o método `uploadAttachment` em `src/modules/chat/messages.service.ts` (linhas ~84-122) por:

```ts
async uploadAttachment(
  conversationId: string,
  userId: string,
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
  sizeBytes: number,
  audioMeta?: { durationMs: number; waveformPeaks: number[] },
) {
  const member = await this.conversationsRepo.findMember(conversationId, userId)
  if (!member) throw new ChatError('NOT_FOUND')
  if (!member.permissions.can_send_files) throw new ChatError('FORBIDDEN')

  const MAX_BYTES = 6 * 1024 * 1024
  if (sizeBytes > MAX_BYTES) throw new ChatError('ATTACHMENT_TOO_LARGE')

  const isImage = mimeType.startsWith('image/')
  const isAudio = mimeType.startsWith('audio/')

  let uploadBuffer = fileBuffer
  let uploadMimeType = mimeType
  let ext = filename.split('.').pop() ?? 'bin'
  let outputFilename = filename

  if (isImage) {
    uploadBuffer = await sharp(fileBuffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    uploadMimeType = 'image/webp'
    ext = 'webp'
    outputFilename = filename.replace(/\.[^.]+$/, '.webp')
  } else if (isAudio) {
    const ALLOWED_AUDIO = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac'])
    if (!ALLOWED_AUDIO.has(mimeType)) throw new ChatError('UNSUPPORTED_AUDIO_FORMAT')
    if (!audioMeta) throw new ChatError('AUDIO_METADATA_REQUIRED')
    if (!Number.isInteger(audioMeta.durationMs) || audioMeta.durationMs <= 0 || audioMeta.durationMs > 180_000) {
      throw new ChatError('AUDIO_TOO_LONG')
    }
    if (!Array.isArray(audioMeta.waveformPeaks) || audioMeta.waveformPeaks.length !== 64) {
      throw new ChatError('INVALID_WAVEFORM')
    }
    for (const p of audioMeta.waveformPeaks) {
      if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) {
        throw new ChatError('INVALID_WAVEFORM')
      }
    }
    const extByMime: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/aac': 'aac',
    }
    ext = extByMime[mimeType]
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp =
      `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
      `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
    const short = randomUUID().replace(/-/g, '').slice(0, 8)
    outputFilename = `audio-${stamp}-${short}.${ext}`
  }

  const subfolder = isAudio ? 'audio' : 'attachments'
  const key = `chat/${subfolder}/${randomUUID()}.${ext}`
  const url = await this.storageService.upload(key, uploadBuffer, uploadMimeType)

  return this.repo.createAttachment({
    uploadedBy: userId,
    url,
    filename: outputFilename,
    mimeType: uploadMimeType,
    sizeBytes: uploadBuffer.length,
    displayOrder: 0,
    durationMs: isAudio ? audioMeta!.durationMs : null,
    waveformPeaks: isAudio ? audioMeta!.waveformPeaks : null,
  })
}
```

### Step 3.5: Rodar testes — todos devem passar

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run --project unit tests/modules/chat/messages.service.test.ts
```

Esperado: PASS em todos.

### Step 3.6: TypeScript check

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

### Step 3.7: Commit

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add tests/modules/chat/messages.service.test.ts src/modules/chat/messages.service.ts
git commit -m "feat(chat): valida áudios em uploadAttachment (mime, duração, waveform, tamanho)"
```

---

## Task 4: Controller — multipart com fields + mapeamento de erros + type derivado

**Files:**
- Modify: `src/modules/chat/chat.controller.ts:320-331` (uploadAttachment handler)
- Modify: `src/modules/chat/chat.controller.ts` (handleChatError function — buscar com grep)
- Modify: `src/modules/chat/chat.controller.ts` (enrichMessages — adicionar `type` derivado)
- Modify: `src/modules/chat/conversations.repository.ts:164,221` (lastMessage type derivado)

### Step 4.1: Inspecionar `handleChatError` para entender mapeamento atual

```bash
grep -n -A 20 "handleChatError" /home/dev/workspace_ssh/geek-social-api/src/modules/chat/chat.controller.ts | head -40
```

Anotar como ele converte códigos para status HTTP. Vamos adicionar novos códigos com seus status.

### Step 4.2: Adicionar codes novos em `handleChatError`

Localizar a função `handleChatError` (provavelmente no fim do arquivo `chat.controller.ts`). Adicionar mapeamento para os codes novos. Exemplo do trecho a editar:

```ts
function handleChatError(e: unknown, reply: FastifyReply) {
  if (!(e instanceof ChatError)) throw e
  const map: Record<string, number> = {
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    BLOCKED: 403,
    EMPTY_MESSAGE: 400,
    ATTACHMENT_NOT_FOUND: 404,
    // ... outros existentes
    AUDIO_TOO_LONG: 400,
    AUDIO_METADATA_REQUIRED: 400,
    UNSUPPORTED_AUDIO_FORMAT: 400,
    INVALID_WAVEFORM: 400,
    ATTACHMENT_TOO_LARGE: 413,
  }
  const status = map[e.code] ?? 400
  return reply.status(status).send({ error: e.code })
}
```

(Manter todos os códigos existentes; só adicionar os novos. Se o `handleChatError` atual tem outra estrutura, adicionar os 5 codes seguindo o padrão dele.)

### Step 4.3: Substituir o handler `uploadAttachment` para usar `req.parts()`

Em `chat.controller.ts:320-331`, substituir o handler por:

```ts
async uploadAttachment(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const userId = (req.user as any).userId as string
  let fileBuffer: Buffer | null = null
  let fileMimeType = ''
  let fileFilename = ''
  let durationMs: number | undefined
  let waveformPeaks: number[] | undefined

  try {
    const parts = req.parts({ limits: { fileSize: 10 * 1024 * 1024 } })
    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer()
        fileMimeType = part.mimetype
        fileFilename = part.filename
      } else if (part.fieldname === 'durationMs' && typeof part.value === 'string') {
        const n = parseInt(part.value, 10)
        if (Number.isFinite(n)) durationMs = n
      } else if (part.fieldname === 'waveformPeaks' && typeof part.value === 'string') {
        try {
          const parsed = JSON.parse(part.value)
          if (Array.isArray(parsed)) waveformPeaks = parsed
        } catch {/* deixa undefined */}
      }
    }
  } catch (e: any) {
    if (e?.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({ error: 'ATTACHMENT_TOO_LARGE' })
    }
    throw e
  }

  if (!fileBuffer) return reply.status(400).send({ error: 'FILE_REQUIRED' })

  const audioMeta =
    fileMimeType.startsWith('audio/') && durationMs !== undefined && waveformPeaks !== undefined
      ? { durationMs, waveformPeaks }
      : undefined

  try {
    const attachment = await this.messagesService.uploadAttachment(
      req.params.id, userId, fileBuffer, fileMimeType, fileFilename, fileBuffer.length, audioMeta,
    )
    return reply.status(201).send(attachment)
  } catch (e) { return handleChatError(e, reply) }
}
```

### Step 4.4: Adicionar `type` derivado em `enrichMessages`

Localizar a função `enrichMessages` em `chat.controller.ts` (linha ~52). Ao montar o objeto retornado por mensagem, adicionar campo `type`:

```ts
function deriveMessageType(attachments: Array<{ mimeType: string }>): 'text' | 'image' | 'audio' | 'file' {
  if (attachments.length === 0) return 'text'
  const first = attachments[0].mimeType
  if (first.startsWith('image/')) return 'image'
  if (first.startsWith('audio/')) return 'audio'
  return 'file'
}
```

(Pode declarar como função privada do controller ou helper top-level no arquivo.) No retorno enriquecido de cada mensagem, adicionar `type: deriveMessageType(msg.attachments)`. Procurar o objeto retornado no fim de `enrichMessages` e acrescentar o campo.

### Step 4.5: Atualizar `lastMessage.type` em `conversations.repository.ts`

Em `conversations.repository.ts:164` e `:221`, substituir o `type: 'text'` hardcoded. Antes da linha do `lastMessage`, buscar attachments do `lastMsg`:

```ts
let lastMsgType: 'text' | 'image' | 'audio' | 'file' = 'text'
if (lastMsg) {
  const atts = await this.db
    .select({ mimeType: messageAttachments.mimeType })
    .from(messageAttachments)
    .where(eq(messageAttachments.messageId, lastMsg.id))
    .limit(1)
  if (atts.length > 0) {
    const m = atts[0].mimeType
    if (m.startsWith('image/')) lastMsgType = 'image'
    else if (m.startsWith('audio/')) lastMsgType = 'audio'
    else lastMsgType = 'file'
  }
}
// ...
lastMessage: lastMsg ? { id: lastMsg.id, content: lastMsg.content, senderId: lastMsg.userId, createdAt: lastMsg.createdAt, type: lastMsgType } : null,
```

(Aplicar nas duas ocorrências — linhas 164 e 221.)

Garantir que `messageAttachments` e `eq` estão importados (`import { messageAttachments } from '...schema.js'`, `import { eq } from 'drizzle-orm'`).

### Step 4.6: TypeScript check

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

### Step 4.7: Smoke test manual do upload de imagem (regressão)

Backend já reiniciado pelo Task 1. Verificar que upload de imagem ainda funciona (ferramenta de teste manual no frontend já existe):

- Frontend em `localhost:5173`, abrir uma DM, anexar uma imagem qualquer.
- Resultado esperado: imagem aparece no chat normalmente.

### Step 4.8: Commit

```bash
cd /home/dev/workspace_ssh/geek-social-api
git add src/modules/chat/chat.controller.ts src/modules/chat/conversations.repository.ts
git commit -m "feat(chat): controller aceita audioMeta no upload e deriva message type por mime"
```

---

## Task 5: Frontend — tipos + service de upload

**Files:**
- Modify: `src/modules/chat/types.ts`
- Modify: `src/modules/chat/services/chatService.ts`

### Step 5.1: Atualizar `types.ts`

Substituir as definições afetadas:

```ts
export type AttachmentType = 'image' | 'audio' | 'file'

export interface MessageAttachment {
  id: string
  url: string
  type: AttachmentType
  name: string
  size: number
  mimeType?: string         // útil pra distinguir no client
  durationMs?: number
  waveformPeaks?: number[]
}

export interface LastMessage {
  id: string
  content: string
  senderId: string
  createdAt: string
  type: 'text' | 'image' | 'audio' | 'file'
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  content: string
  type: 'text' | 'image' | 'audio' | 'file'
  attachments: MessageAttachment[]
  replyTo: MessageReply | null
  reactions: MessageReaction[]
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
}

export interface SendMessagePayload {
  content?: string
  type?: 'text' | 'image' | 'audio' | 'file'
  replyToId?: string
  attachmentIds?: string[]
}
```

(Manter o resto do arquivo intacto.)

### Step 5.2: Localizar `chatService.uploadAttachment`

```bash
grep -n "uploadAttachment\|attachments" /home/dev/workspace_ssh/geek-social-frontend/src/modules/chat/services/chatService.ts | head -20
```

### Step 5.3: Atualizar a função para aceitar áudio

No `chatService.ts`, modificar a função `uploadAttachment` para aceitar params de áudio:

```ts
export async function uploadAttachment(
  conversationId: string,
  file: Blob,
  filename: string,
  audioMeta?: { durationMs: number; waveformPeaks: number[] },
): Promise<MessageAttachment> {
  const fd = new FormData()
  fd.append('file', file, filename)
  if (audioMeta) {
    fd.append('durationMs', String(audioMeta.durationMs))
    fd.append('waveformPeaks', JSON.stringify(audioMeta.waveformPeaks))
  }
  const { data } = await http.post(`/chat/conversations/${conversationId}/attachments`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return mapApiAttachment(data)
}
```

(Adaptar nomes — confira o nome real da função e como ela já é chamada hoje. Manter compatível com chamada existente quando `audioMeta` é undefined.)

Garantir que `mapApiAttachment` (ou equivalente) propaga `durationMs` e `waveformPeaks` no retorno.

### Step 5.4: Verificar TypeScript do frontend

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

### Step 5.5: Commit

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/types.ts src/modules/chat/services/chatService.ts
git commit -m "feat(chat): tipos e service de upload com metadata de áudio"
```

---

## Task 6: Composable `useAudioRecorder`

**Files:**
- Create: `src/modules/chat/composables/useAudioRecorder.ts`

### Step 6.1: Criar o composable

```ts
import { ref, onBeforeUnmount } from 'vue'

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'preview' | 'uploading' | 'error'

export interface UseAudioRecorderOptions {
  maxMs: number
  peakBuckets: number
}

export function useAudioRecorder(opts: UseAudioRecorderOptions) {
  const state = ref<RecorderState>('idle')
  const elapsedMs = ref(0)
  const recordedBlob = ref<Blob | null>(null)
  const durationMs = ref<number | null>(null)
  const peaks = ref<number[] | null>(null)
  const errorCode = ref<string | null>(null)

  let mediaRecorder: MediaRecorder | null = null
  let stream: MediaStream | null = null
  let chunks: BlobPart[] = []
  let timerId: ReturnType<typeof setInterval> | null = null
  let startTs = 0
  let mimeType = ''

  function pickMimeType(): string {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
    }
    return ''
  }

  async function start() {
    if (state.value !== 'idle') return
    state.value = 'requesting'
    errorCode.value = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e: any) {
      state.value = 'error'
      errorCode.value = e?.name === 'NotAllowedError' ? 'PERMISSION_DENIED'
        : e?.name === 'NotFoundError' ? 'NO_DEVICE'
        : 'UNKNOWN'
      cleanup()
      return
    }

    const chosen = pickMimeType()
    mimeType = chosen
    chunks = []
    mediaRecorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    mediaRecorder.onstop = () => { void finalize() }
    mediaRecorder.start()

    startTs = performance.now()
    elapsedMs.value = 0
    state.value = 'recording'
    timerId = setInterval(() => {
      elapsedMs.value = Math.floor(performance.now() - startTs)
      if (elapsedMs.value >= opts.maxMs) void stop()
    }, 100)
  }

  async function stop() {
    if (state.value !== 'recording' || !mediaRecorder) return
    if (timerId) { clearInterval(timerId); timerId = null }
    if (mediaRecorder.state === 'recording') mediaRecorder.stop()
    // restante do trabalho em onstop → finalize()
  }

  async function finalize() {
    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
    chunks = []
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }

    let buffer: AudioBuffer
    try {
      const ctx = new AudioContext()
      const arrayBuf = await blob.arrayBuffer()
      buffer = await ctx.decodeAudioData(arrayBuf)
      void ctx.close()
    } catch {
      state.value = 'error'
      errorCode.value = 'DECODE_FAILED'
      cleanup()
      return
    }

    const computedPeaks = computePeaks(buffer.getChannelData(0), opts.peakBuckets)
    recordedBlob.value = blob
    durationMs.value = Math.floor(buffer.duration * 1000)
    peaks.value = computedPeaks
    state.value = 'preview'
  }

  function discard() {
    cleanup()
    recordedBlob.value = null
    durationMs.value = null
    peaks.value = null
    elapsedMs.value = 0
    errorCode.value = null
    state.value = 'idle'
  }

  function cleanup() {
    if (timerId) { clearInterval(timerId); timerId = null }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop() } catch {/*ignore*/}
    }
    mediaRecorder = null
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
    chunks = []
  }

  onBeforeUnmount(() => cleanup())

  return { state, elapsedMs, recordedBlob, durationMs, peaks, errorCode, start, stop, discard }
}

function computePeaks(samples: Float32Array, buckets: number): number[] {
  if (samples.length === 0) return new Array(buckets).fill(0)
  const bucketSize = Math.max(1, Math.floor(samples.length / buckets))
  const rms: number[] = []
  for (let i = 0; i < buckets; i++) {
    const start = i * bucketSize
    const end = Math.min(start + bucketSize, samples.length)
    let sumSq = 0
    for (let j = start; j < end; j++) sumSq += samples[j] * samples[j]
    rms.push(Math.sqrt(sumSq / Math.max(1, end - start)))
  }
  const max = Math.max(...rms, 1e-9)
  return rms.map(v => Math.min(1, Math.max(0, v / max)))
}

export function isRecorderSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
}
```

### Step 6.2: TypeScript check

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

### Step 6.3: Commit

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/composables/useAudioRecorder.ts
git commit -m "feat(chat): composable useAudioRecorder com peaks e limite de duração"
```

---

## Task 7: Componente `AudioRecorderBar`

**Files:**
- Create: `src/modules/chat/components/AudioRecorderBar.vue`

### Step 7.1: Criar componente

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Mic, Square, X, Send, Play, Pause, Trash2 } from 'lucide-vue-next'
import type { RecorderState } from '../composables/useAudioRecorder'

const props = defineProps<{
  state: RecorderState
  elapsedMs: number
  durationMs: number | null
  peaks: number[] | null
  recordedBlob: Blob | null
}>()

const emit = defineEmits<{
  (e: 'stop'): void
  (e: 'discard'): void
  (e: 'send'): void
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const blobUrl = ref<string | null>(null)

watch(() => props.recordedBlob, (b) => {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  blobUrl.value = b ? URL.createObjectURL(b) : null
}, { immediate: true })

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function togglePlay() {
  const a = audioRef.value
  if (!a) return
  if (a.paused) { void a.play(); isPlaying.value = true }
  else { a.pause(); isPlaying.value = false }
}

const peaksDisplay = computed(() => props.peaks ?? [])
</script>

<template>
  <div class="flex items-center gap-2 px-2 py-2 bg-[#1e2038] rounded-xl border border-white/5">
    <template v-if="state === 'recording'">
      <span class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
      <span class="font-mono text-sm text-white/90 tabular-nums">{{ fmt(elapsedMs) }}</span>
      <span class="text-white/40 text-xs">/ 03:00</span>
      <div class="flex-1"></div>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-white/70 hover:bg-white/10 text-sm flex items-center gap-1"
        @click="emit('discard')"
      >
        <X class="w-4 h-4" /> Cancelar
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 text-sm font-medium flex items-center gap-1"
        @click="emit('stop')"
      >
        <Square class="w-4 h-4" /> Parar
      </button>
    </template>

    <template v-else-if="state === 'preview' || state === 'uploading'">
      <button
        type="button"
        class="w-9 h-9 rounded-full bg-amber-500 text-black hover:bg-amber-400 flex items-center justify-center"
        @click="togglePlay"
      >
        <Pause v-if="isPlaying" class="w-4 h-4" />
        <Play v-else class="w-4 h-4 ml-0.5" />
      </button>
      <div class="flex items-end gap-[2px] h-6 flex-1 max-w-[160px]">
        <div
          v-for="(p, i) in peaksDisplay"
          :key="i"
          class="w-[2px] bg-white/40 rounded-sm"
          :style="{ height: Math.max(2, p * 24) + 'px' }"
        ></div>
      </div>
      <span class="font-mono text-sm text-white/80 tabular-nums">{{ fmt(durationMs ?? 0) }}</span>
      <audio
        v-if="blobUrl"
        ref="audioRef"
        :src="blobUrl"
        @ended="isPlaying = false"
        @pause="isPlaying = false"
        class="hidden"
      ></audio>
      <div class="flex-1"></div>
      <button
        type="button"
        :disabled="state === 'uploading'"
        class="px-3 py-1.5 rounded-lg text-white/70 hover:bg-white/10 text-sm flex items-center gap-1 disabled:opacity-50"
        @click="emit('discard')"
      >
        <Trash2 class="w-4 h-4" /> Descartar
      </button>
      <button
        type="button"
        :disabled="state === 'uploading'"
        class="px-3 py-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
        @click="emit('send')"
      >
        <Send class="w-4 h-4" />
        {{ state === 'uploading' ? 'Enviando…' : 'Enviar' }}
      </button>
    </template>

    <template v-else-if="state === 'error'">
      <span class="text-red-400 text-sm">Não foi possível acessar o microfone.</span>
      <div class="flex-1"></div>
      <button class="px-2 py-1 text-white/60 hover:text-white" @click="emit('discard')">
        <X class="w-4 h-4" />
      </button>
    </template>
  </div>
</template>
```

### Step 7.2: TypeScript check

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

### Step 7.3: Commit

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/components/AudioRecorderBar.vue
git commit -m "feat(chat): componente AudioRecorderBar (gravação + preview)"
```

---

## Task 8: Componente `AudioPlayer` (na mensagem)

**Files:**
- Create: `src/modules/chat/components/AudioPlayer.vue`

### Step 8.1: Criar componente

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Play, Pause } from 'lucide-vue-next'
import type { MessageAttachment } from '../types'

const props = defineProps<{ attachment: MessageAttachment }>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const currentMs = ref(0)
const totalMs = computed(() => props.attachment.durationMs ?? 0)

const peaks = computed<number[]>(() => {
  const p = props.attachment.waveformPeaks
  if (Array.isArray(p) && p.length === 64) return p
  return new Array(64).fill(0.05)
})

const progress = computed(() => totalMs.value > 0 ? currentMs.value / totalMs.value : 0)

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function toggle() {
  const a = audioRef.value
  if (!a) return
  if (a.paused) { void a.play(); isPlaying.value = true }
  else { a.pause(); isPlaying.value = false }
}

function onTimeUpdate() {
  const a = audioRef.value
  if (a) currentMs.value = Math.floor(a.currentTime * 1000)
}

function seek(e: MouseEvent) {
  const a = audioRef.value
  if (!a || !totalMs.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  a.currentTime = (totalMs.value / 1000) * ratio
  currentMs.value = Math.floor(a.currentTime * 1000)
}

function onEnded() { isPlaying.value = false; currentMs.value = 0 }
</script>

<template>
  <div class="flex items-center gap-3 min-w-[220px] max-w-[320px]">
    <button
      type="button"
      class="w-10 h-10 rounded-full bg-amber-500 text-black hover:bg-amber-400 flex items-center justify-center shrink-0"
      @click="toggle"
    >
      <Pause v-if="isPlaying" class="w-4 h-4" />
      <Play v-else class="w-4 h-4 ml-0.5" />
    </button>
    <div class="flex-1 min-w-0">
      <div
        class="relative h-7 cursor-pointer flex items-end gap-[2px]"
        @click="seek"
      >
        <div
          v-for="(p, i) in peaks"
          :key="i"
          class="flex-1 rounded-sm"
          :class="(i / peaks.length) <= progress ? 'bg-amber-400' : 'bg-white/30'"
          :style="{ height: Math.max(3, p * 28) + 'px' }"
        ></div>
      </div>
      <div class="text-[11px] font-mono text-white/60 tabular-nums mt-1">
        {{ fmt(currentMs) }} / {{ fmt(totalMs) }}
      </div>
    </div>
    <audio
      ref="audioRef"
      :src="attachment.url"
      preload="metadata"
      @timeupdate="onTimeUpdate"
      @pause="isPlaying = false"
      @play="isPlaying = true"
      @ended="onEnded"
      class="hidden"
    ></audio>
  </div>
</template>
```

### Step 8.2: TypeScript check

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

### Step 8.3: Commit

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/components/AudioPlayer.vue
git commit -m "feat(chat): componente AudioPlayer com waveform e seek"
```

---

## Task 9: Integrar gravação no `MessageArea`

**Files:**
- Modify: `src/modules/chat/components/MessageArea.vue`

### Step 9.1: Inspecionar área onde fica o input atual

```bash
grep -n -E "(input|placeholder|attach|file|paperclip|Mic)" /home/dev/workspace_ssh/geek-social-frontend/src/modules/chat/components/MessageArea.vue | head -30
```

Anotar onde fica:
- O botão de anexo (provavelmente usa um Lucide ícone).
- O input/textarea de texto.
- O botão de enviar.
- A função/composable que faz upload e envia mensagem.

### Step 9.2: Adicionar imports e composable

Em `MessageArea.vue`, no `<script setup>`, adicionar:

```ts
import { Mic } from 'lucide-vue-next'
import AudioRecorderBar from './AudioRecorderBar.vue'
import { useAudioRecorder, isRecorderSupported } from '../composables/useAudioRecorder'
import { uploadAttachment } from '../services/chatService'

const recorder = useAudioRecorder({ maxMs: 180_000, peakBuckets: 64 })
const recorderSupported = isRecorderSupported()

async function startRecording() {
  await recorder.start()
}

async function sendRecorded() {
  if (!recorder.recordedBlob.value || !recorder.peaks.value || recorder.durationMs.value == null) return
  recorder.state.value = 'uploading'
  try {
    const ext = (recorder.recordedBlob.value.type.split('/')[1] ?? 'webm').split(';')[0]
    const att = await uploadAttachment(
      props.conversationId, // ou o nome real da prop/store
      recorder.recordedBlob.value,
      `voice.${ext}`,
      { durationMs: recorder.durationMs.value, waveformPeaks: recorder.peaks.value },
    )
    await sendMessage({ attachmentIds: [att.id] }) // usar a função que MessageArea já tem para enviar
    recorder.discard()
  } catch (e) {
    console.error('audio upload failed', e)
    recorder.state.value = 'preview' // permite tentar de novo
  }
}
```

(Adaptar `props.conversationId` e `sendMessage` aos nomes reais — confira no arquivo. Se o envio é via store, adaptar.)

### Step 9.3: Renderizar `AudioRecorderBar` quando ativo

No template, encontrar o bloco do input/footer da composição. Substituir por algo como:

```vue
<template>
  <!-- ... cabeçalho e mensagens existentes ... -->

  <div class="px-3 py-2 border-t border-white/5">
    <AudioRecorderBar
      v-if="recorder.state.value !== 'idle'"
      :state="recorder.state.value"
      :elapsed-ms="recorder.elapsedMs.value"
      :duration-ms="recorder.durationMs.value"
      :peaks="recorder.peaks.value"
      :recorded-blob="recorder.recordedBlob.value"
      @stop="recorder.stop()"
      @discard="recorder.discard()"
      @send="sendRecorded"
    />

    <div v-else class="flex items-center gap-2">
      <!-- botão de anexo existente -->
      <!-- input/textarea existente -->
      <!-- botão de enviar existente -->

      <button
        v-if="recorderSupported"
        type="button"
        class="w-9 h-9 rounded-full text-white/60 hover:bg-white/10 hover:text-amber-400 flex items-center justify-center"
        @click="startRecording"
        title="Gravar áudio"
      >
        <Mic class="w-5 h-5" />
      </button>
    </div>
  </div>
</template>
```

(Adaptar ao layout existente do `MessageArea`. O importante é: quando `recorder.state.value !== 'idle'`, esconder input/anexar/enviar e mostrar o `AudioRecorderBar`.)

### Step 9.4: Verificar TypeScript

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

### Step 9.5: Smoke test no browser

- Abrir `localhost:5173`, ir numa DM.
- Botão de microfone deve aparecer ao lado do input.
- Clicar → browser pede permissão → aceitar.
- Ver UI de gravação com timer.
- Clicar Parar → ver preview com play/waveform.
- Clicar Enviar → mensagem aparece como áudio (mas ainda renderizada como "file" até a Task 10).

### Step 9.6: Commit

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/components/MessageArea.vue
git commit -m "feat(chat): botão de gravação no MessageArea"
```

---

## Task 10: Render do áudio em `MessageBubble` + `ConversationItem`

**Files:**
- Modify: `src/modules/chat/components/MessageBubble.vue`
- Modify: `src/modules/chat/components/ConversationItem.vue`

### Step 10.1: Inspecionar o bloco de attachments no `MessageBubble`

```bash
grep -n -E "(attachment|image|<img|file)" /home/dev/workspace_ssh/geek-social-frontend/src/modules/chat/components/MessageBubble.vue | head -30
```

Anotar onde renderiza imagens/arquivos.

### Step 10.2: Importar e branch para áudio

Em `MessageBubble.vue`:

```ts
import AudioPlayer from './AudioPlayer.vue'
```

No template, na seção de attachments, adicionar branch antes da renderização de imagens/files:

```vue
<template v-for="att in message.attachments" :key="att.id">
  <AudioPlayer v-if="att.type === 'audio'" :attachment="att" />
  <img v-else-if="att.type === 'image'" :src="att.url" ... />
  <a v-else :href="att.url" ...>{{ att.name }}</a>
</template>
```

(Adaptar à estrutura existente. Se hoje há um `<div>` com classes especiais por tipo, manter wrapper e só trocar o conteúdo.)

### Step 10.3: Reply quote para áudio

Localizar o bloco de "Respondendo a X" no `MessageBubble`. Quando a mensagem citada é áudio (`replyTo.type === 'audio'` ou similar — verificar campos disponíveis em `MessageReply`), exibir:

```
🎤 Mensagem de voz
```

em vez do `replyTo.content`. Se `MessageReply` não tem `type`, usar fallback: se `replyTo.content === ''` e a mensagem original era áudio, ainda assim queremos mostrar "Mensagem de voz". Decisão pragmática: olhar se o conteúdo está vazio e exibir "🎤 Mensagem de voz" como fallback para áudios — por enquanto o `replyTo` não vai trazer `type`, então ajustar `MessageReply` no backend pra incluir `type` derivada também (vide passo abaixo).

**Sub-passo 10.3a:** No backend `chat.controller.ts`, na construção de `replyTo` dentro de `enrichMessages` (por volta da linha 73-80), adicionar `type: deriveMessageType(replied.attachments)`. No frontend `types.ts`, adicionar:

```ts
export interface MessageReply {
  id: string
  senderId: string
  senderName: string
  content: string
  type?: 'text' | 'image' | 'audio' | 'file'
}
```

Então no MessageBubble:

```vue
<div v-if="message.replyTo">
  <span v-if="message.replyTo.type === 'audio'">🎤 Mensagem de voz</span>
  <span v-else-if="message.replyTo.type === 'image'">📷 Imagem</span>
  <span v-else>{{ message.replyTo.content }}</span>
</div>
```

### Step 10.4: `ConversationItem` lastMessage

Em `ConversationItem.vue`, localizar onde `lastMessage.content` é exibido. Adicionar:

```vue
<span v-if="conversation.lastMessage?.type === 'audio'">🎤 Mensagem de voz</span>
<span v-else-if="conversation.lastMessage?.type === 'image'">📷 Imagem</span>
<span v-else>{{ conversation.lastMessage?.content ?? '' }}</span>
```

### Step 10.5: Verificar TypeScript

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

### Step 10.6: Smoke test no browser

- Mandar um áudio numa DM.
- Conferir que aparece com player + waveform.
- Tocar play → áudio toca, waveform vai colorindo de âmbar.
- Voltar pra lista de conversas: preview mostra "🎤 Mensagem de voz".
- Reply numa mensagem de áudio → quote diz "🎤 Mensagem de voz".

### Step 10.7: Commit

```bash
cd /home/dev/workspace_ssh/geek-social-frontend
git add src/modules/chat/components/MessageBubble.vue \
        src/modules/chat/components/ConversationItem.vue \
        src/modules/chat/types.ts
git commit -m "feat(chat): renderiza player de áudio no bubble e preview na lista"
cd /home/dev/workspace_ssh/geek-social-api
git add src/modules/chat/chat.controller.ts
git commit -m "feat(chat): replyTo carrega type derivado do attachment"
```

---

## Task 11: Smoke test ponta-a-ponta

- [ ] **Step 11.1: Reiniciar backend**

```bash
pkill -f "tsx watch src/server.ts" 2>/dev/null; sleep 1
cd /home/dev/workspace_ssh/geek-social-api && npm run dev
```

(Frontend tem HMR, segue rodando.)

- [ ] **Step 11.2: Cenários a verificar manualmente no browser**

Em `localhost:5173`, autenticado:

1. **Gravação básica**: numa DM, mic → grava 5s → para → preview com waveform → enviar → áudio aparece no chat.
2. **Limite de duração**: começar a gravar, deixar até 3min, esperar parar automático → preview aparece.
3. **Permissão negada**: bloquear permissão de mic no browser, clicar mic → ver mensagem de erro amigável, sem travar UI.
4. **Descartar**: gravar, clicar descartar → volta a idle limpo.
5. **Cancelar mid-recording**: começar a gravar, clicar cancelar → para sem preview.
6. **Reproduzir**: tocar áudio enviado → tempo decorrido atualiza, waveform colore, pausar funciona.
7. **Seek**: clicar na waveform → pula pra posição.
8. **Lista de conversas**: voltar pra lista → preview da DM mostra "🎤 Mensagem de voz".
9. **Reply**: replicar uma mensagem de áudio → quote mostra "🎤 Mensagem de voz".
10. **Reação**: reagir num áudio → emoji pílula aparece.
11. **Deleção**: deletar mensagem de áudio → some da view.
12. **Bloqueio (DM)**: bloquear o outro usuário → não consigo enviar áudio (bloqueio do server protege).
13. **Regressão de imagem**: enviar uma imagem normal → continua funcionando.
14. **Regressão de arquivo**: anexar PDF → continua funcionando.

- [ ] **Step 11.3: Verificações finais de tipos**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros nos dois.

- [ ] **Step 11.4: Rodar suite de testes unitários**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run --project unit
```

Esperado: tudo passando, sem regressão.

- [ ] **Step 11.5: Anotar pendências menores**

Se algo não-bloqueante aparecer no smoke test (visual menor, mensagem de erro pouco amigável), anotar como follow-up — não consertar agora.

---

## Notas de execução

- Em caso de erro no `MediaRecorder` por mime não suportado (Safari raríssimo), o composable já tem fallback. Se na prática o Safari usar `audio/mp4`, o backend já aceita.
- `decodeAudioData` em Safari historicamente é chato com `audio/webm`. Se aparecer falha em Safari, fallback razoável: pular peaks (mandar `new Array(64).fill(0)`) — vamos cruzar essa ponte se aparecer.
- Reiniciar o backend é necessário em qualquer mudança em `.ts` (tsx watch geralmente cuida, mas em mudanças de schema/migration às vezes precisa kill explícito).
