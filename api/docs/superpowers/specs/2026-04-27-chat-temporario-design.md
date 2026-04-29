# Chat Temporário — Design

**Data:** 2026-04-27
**Escopo:** DMs (1-a-1). Grupos ficam fora.
**Status:** Approved (pending plan)

---

## Problema

Adicionar um modo "chat temporário" em DMs onde mensagens somem automaticamente após o destinatário visualizar e sair da conversa — semelhante ao Snapchat. Recurso opcional, ativável/desativável por qualquer um dos dois lados, com TTL fallback de 30 dias para mensagens não lidas.

---

## Decisões de design (consolidadas)

| Tema | Decisão |
|------|---------|
| Escopo | Apenas DM (1-a-1). Grupos fora de escopo. |
| Ativação | Unilateral por DM — qualquer um dos dois liga/desliga e vale para a conversa toda. Sem aceite. |
| Gatilho de deleção | "Snapchat-clássico": destinatário **lê** + **sai da DM** → mensagens lidas somem para ambos. |
| Mensagens antigas | Não retroativo. Ativar o modo só afeta mensagens novas. |
| Anexos | Hard delete do banco **e** do storage (S3/MinIO) quando a mensagem some. |
| Não lidas | TTL fallback de 30 dias — depois disso, hard delete via cron. |
| Forward | Bloqueado server-side em mensagens com `is_temporary=true` (HTTP 422). |
| Download de mídia | Permitido (defesa contra screenshot é teatro em web). |
| UI ativação | Item no menu ⋮ do header da DM + banner condicional âmbar quando ativo. |
| Notificação do toggle | Mensagem de sistema na conversa **e** banner condicional (ambos). |
| Detecção de "saiu" | Socket.io: frontend emite `chat:dm:leave` ao mudar de DM/limpar view + handler de disconnect. **Cron de fallback (60s)** cobre crashes/abrupt closes. |

---

## Modelo de dados

### Migration `0018_temporary_chat.sql`

```sql
ALTER TABLE conversations
  ADD COLUMN is_temporary boolean NOT NULL DEFAULT false;

ALTER TABLE messages
  ADD COLUMN is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN temporary_event jsonb;

CREATE INDEX messages_temp_cleanup_idx
  ON messages (conversation_id, created_at)
  WHERE is_temporary = true AND deleted_at IS NULL;
```

### Semântica das colunas

- **`conversations.is_temporary`** — estado atual do toggle. Vale para a DM toda. Editável apenas em conversas onde `type='dm'`.
- **`messages.is_temporary`** — **snapshot** do estado da conversa no momento do `INSERT`. Mensagens enviadas com o toggle ativo permanecem temporárias mesmo se o toggle for desligado depois.
- **`messages.temporary_event`** — `null` em mensagens normais; `{ enabled: boolean, byUserId: string }` em mensagens de sistema do tipo `temporary_toggle`.

### Schema (Drizzle)

```ts
// conversations
isTemporary: boolean('is_temporary').notNull().default(false),

// messages
isTemporary: boolean('is_temporary').notNull().default(false),
temporaryEvent: jsonb('temporary_event').$type<{ enabled: boolean; byUserId: string } | null>(),
```

### Frontend types

```ts
// types.ts
interface Conversation {
  // ...existente
  isTemporary?: boolean
}

interface Message {
  // ...existente
  isTemporary?: boolean
  temporaryEvent?: { enabled: boolean; byUserId: string } | null
}

type MessageType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'call' | 'temporary_toggle'
```

---

## API

### REST

#### `PATCH /chat/conversations/:id/temporary`

Liga ou desliga o modo temporário da DM.

**Body:**
```json
{ "enabled": true }
```

**Validações:**
- Membro da conversa: senão `404 NOT_FOUND`
- Conversa é DM: senão `422 NOT_DM`
- Bloqueio em qualquer direção: senão `403 BLOCKED`

**Comportamento:**
1. Se valor mudou:
   - `UPDATE conversations SET is_temporary=? WHERE id=?`
   - Cria mensagem do tipo `temporary_toggle` com `temporary_event={enabled, byUserId}`
   - Emite via socket: `conversation:updated` (com `isTemporary` novo) + `message:new` (a mensagem de sistema)
2. Se valor não mudou: retorna 204 sem efeito colateral.

**Resposta:** `204 No Content`.

### Mudanças em endpoints existentes

#### `POST /chat/messages/:id/forward`

Adicionar verificação:
```
Se source.is_temporary === true:
  return 422 SOURCE_TEMPORARY
```

#### `POST /chat/conversations/:id/messages` (sendMessage)

Ao criar uma nova mensagem, snapshot:
```sql
INSERT INTO messages (..., is_temporary)
VALUES (..., (SELECT is_temporary FROM conversations WHERE id=?))
```

### Socket

#### Emitido pelo frontend

##### `chat:dm:leave { conversationId: string }`

Frontend emite quando:
- O usuário muda a "DM ativa" no `useChat.setActiveConversation` para outra conversa
- Quando a `ChatView` é desmontada / route navega para fora
- *Não* emite quando minimiza app — confiamos no cron de fallback nesses casos

#### Emitido pelo backend

##### `message:deleted { conversationId, messageId }`
*(já existe; agora também é disparado pelos jobs de cleanup e pelo handler `chat:dm:leave`)*

##### `conversation:updated`
*(já existe; agora reflete também `isTemporary`)*

---

## Workers / Cron jobs

Reutiliza `pg-boss` que já está configurado.

### Job 1 — `temporary.cleanup-read` (a cada 60s)

Fallback caso `chat:dm:leave` não tenha sido entregue (browser crash, mobile killed, etc.).

```typescript
async function handle() {
  // Para cada DM com is_temporary=true:
  const tempDms = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.type, 'dm'), eq(conversations.isTemporary, true)))

  for (const dm of tempDms) {
    const members = await convRepo.findMembers(dm.id)
    for (const m of members) {
      // Pula quem está com socket conectado nesta DM
      if (gateway.isUserInRoom(m.userId, dm.id)) continue
      if (!m.lastReadAt) continue

      // Apaga mensagens recebidas por m que ele leu
      await deleteReadTemporaryFor(dm.id, m.userId, m.lastReadAt)
    }
  }
}
```

### Job 2 — `temporary.cleanup-ttl` (a cada 1h)

TTL de 30 dias para temporárias **não lidas**.

```typescript
async function handle() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const expired = await db
    .select()
    .from(messages)
    .where(and(
      eq(messages.isTemporary, true),
      isNull(messages.deletedAt),
      lt(messages.createdAt, cutoff),
    ))

  for (const msg of expired) {
    await hardDeleteMessage(msg.id) // delete S3 + delete row + emit socket event
  }
}
```

### Função compartilhada `hardDeleteMessage`

```typescript
async function hardDeleteMessage(messageId: string) {
  const attachments = await db.select().from(messageAttachments)
    .where(eq(messageAttachments.messageId, messageId))

  // 1. Delete S3 dos arquivos (idempotente, best-effort)
  for (const a of attachments) {
    const key = extractKeyFromUrl(a.url)
    if (key) await storage.delete(key).catch(() => {})
    if (a.thumbnailUrl) {
      const thumbKey = extractKeyFromUrl(a.thumbnailUrl)
      if (thumbKey) await storage.delete(thumbKey).catch(() => {})
    }
  }

  // 2. Delete row (cascata FK remove attachments + reactions)
  const [msg] = await db.delete(messages).where(eq(messages.id, messageId)).returning()
  if (!msg) return

  // 3. Emite no socket
  gateway.emitMessageDeleted(msg.conversationId, messageId)
}
```

---

## Fluxo completo (caminho feliz)

```
1. Maria abre DM com Pedro, menu ⋮ → "Ativar modo temporário"
   → frontend: chatService.setTemporaryMode(convId, true)
   → backend: PATCH /chat/conversations/:id/temporary { enabled: true }
       - UPDATE conversations SET is_temporary=true
       - INSERT mensagem temporary_toggle { enabled: true, byUserId: Maria }
       - emit conversation:updated, message:new
   → frontend (Maria + Pedro): banner aparece, mensagem de sistema renderiza

2. Maria envia "oi"
   → INSERT messages (is_temporary=true por snapshot)
   → emit message:new

3. Pedro abre a DM
   → markAsRead atualiza Pedro.lastReadAt = now()
   → frontend renderiza bolha com ⏳

4. Pedro navega pra outra rota / muda de DM
   → frontend emit 'chat:dm:leave' { conversationId }
   → backend handler:
       - busca lastReadAt de Pedro nesta conv (= now-ε)
       - busca mensagens com is_temporary=true AND user_id != Pedro
         AND created_at <= Pedro.lastReadAt AND deleted_at IS NULL
       - hardDeleteMessage para cada
       - emit message:deleted no socket

5. Maria, que está com a DM aberta, recebe message:deleted
   → bolha "oi" some da lista local
```

### Caminho com browser crash

```
1-3. iguais
4. Pedro fecha o tab (sem chance de emit chat:dm:leave)
5. Próxima execução do cron temporary.cleanup-read (≤ 60s):
   - Pedro não está em nenhuma room socket dessa conv
   - lastReadAt de Pedro existe
   - hardDeleteMessage de cada mensagem temporária recebida e lida por ele
6. Maria recebe message:deleted
```

### Caminho TTL

```
1-2. iguais
3. Pedro nunca abre a DM
4. 30 dias depois, cron temporary.cleanup-ttl:
   - createdAt < now - 30d
   - hardDeleteMessage
5. Maria (se online) recebe message:deleted
```

---

## UI — Frontend

### `ChatView.vue` (header)

**Item de menu ⋮:**
```html
<button @click="toggleTemporary">
  <Hourglass :size="14" />
  {{ activeConversation.isTemporary ? 'Desativar' : 'Ativar' }} modo temporário
</button>
```
*Item só aparece em DMs (não em grupos).*

**Banner condicional** (entre header e MessageArea):
```html
<div
  v-if="activeConversation.isTemporary"
  class="bg-(--color-accent-amber)/10 text-(--color-accent-amber) text-xs px-4 py-2 flex items-center gap-2"
>
  <Hourglass :size="12" />
  Modo temporário ativo · Mensagens somem ao serem visualizadas
</div>
```

### `MessageBubble.vue`

- Quando `message.isTemporary === true`: renderizar pequeno ícone ⏳ ao lado do horário, em cor âmbar.
- Quando `message.isTemporary === true`: **esconder** o botão "Encaminhar" (Forward) na barra de ações.

### Componente novo `TemporarySystemMessage.vue`

Render igual ao `CallSystemMessage.vue` (linha cinza centralizada):
```html
<div class="text-xs text-center text-(--color-text-muted) py-2">
  <Hourglass :size="11" class="inline-block mr-1" />
  {{ actorName }} {{ message.temporaryEvent.enabled ? 'ativou' : 'desativou' }}
  o modo temporário
</div>
```
Roteamento em `MessageBubble.vue`: se `message.type === 'temporary_toggle'`, renderiza `TemporarySystemMessage` ao invés do bubble normal (igual `call`).

### `useChat.ts`

```typescript
// nova action
async function toggleTemporary(conversationId: string, enabled: boolean): Promise<void> {
  await chatService.setTemporaryMode(conversationId, enabled)
  // Estado real é atualizado via socket conversation:updated
}

// emit ao trocar de DM ativa
function setActiveConversation(id: string | null) {
  const prev = activeConversationId.value
  if (prev && prev !== id) {
    const sock = getSocket()
    sock?.emit('chat:dm:leave', { conversationId: prev })
  }
  activeConversationId.value = id
  // ...resto
}
```

Cleanup também ao desmontar `ChatView`.

### `chatService.ts`

```typescript
export async function setTemporaryMode(conversationId: string, enabled: boolean): Promise<void> {
  await api.patch(`/chat/conversations/${conversationId}/temporary`, { enabled })
}
```

---

## Edge cases

| Caso | Tratamento |
|------|-----------|
| Reply para mensagem temporária | Permitido. A reply herda `is_temporary` se a conversa estiver temp na hora. Se a original foi hard-deleted, `findMessageRaw(replyToId)` retorna `null` — o enriquecimento da reply deve produzir `replyTo: { id: replyToId, senderId: null, senderName: 'Sistema', content: 'Mensagem expirada', type: 'text' }` em vez de `null`, para que a bolha de reply ainda apareça com o placeholder. |
| Reaction em mensagem temp | Permitido. Removidas em cascata pela FK quando a mensagem é hard-deleted. |
| Toggle off com mensagens temp pendentes | Mensagens já enviadas continuam temporárias (snapshot). Só novas serão normais. |
| DM com bloqueio | PATCH retorna 403 BLOCKED. Cleanups continuam rodando normalmente. |
| Anexos órfãos no S3 | `storage.delete()` é best-effort com `.catch(() => {})`. Em caso de falha rara, ficam órfãos. Sem fila de retry no MVP. |
| Race entre socket leave e cron | `DELETE ... WHERE deleted_at IS NULL` (pra rows) e S3.delete idempotente. Sem conflito. |
| Forward de mensagem temp | 422 SOURCE_TEMPORARY no backend. UI esconde o botão preventivamente. |
| Notification push de mensagem temp | Mantém comportamento atual (push pode mostrar conteúdo). Revisar depois se virar problema. |
| Sair da DM sem ler nada | `lastReadAt` é null ou anterior à mensagem → nada é apagado. Cron TTL pega depois. |

---

## Testes

### Unitários (vitest)

- **`messages.service.test.ts`** *(estender)*:
  - `forwardMessage` retorna `SOURCE_TEMPORARY` quando origem é temporária
  - `sendMessage` em conv temp marca `is_temporary=true` na nova mensagem
  - `sendMessage` em conv não-temp marca `is_temporary=false`

- **Novo `temporary.service.test.ts`**:
  - `toggleTemporary` rejeita em conversa de grupo (`NOT_DM`)
  - `toggleTemporary` rejeita não-membro (`NOT_FOUND`)
  - `toggleTemporary` cria mensagem de sistema quando estado muda
  - `toggleTemporary` é idempotente (mesma valor não cria mensagem)
  - `cleanupReadMessagesFor` apaga só mensagens recebidas (não enviadas) por X com `created_at <= lastReadAt`
  - `cleanupExpiredTemporary` apaga não lidas com `created_at < now - 30d`

### E2E (`tests/e2e/temporary-chat.e2e.test.ts`)

- Maria → PATCH /temporary → DM tem `is_temporary=true`, mensagem de sistema criada
- Maria envia "oi" → mensagem tem `is_temporary=true`
- Pedro lê + faz request simulando "saiu" → mensagem hard-deleted
- Forward de mensagem temp → 422
- TTL: mensagem temp criada há > 30d → cleanup deleta

---

## Fora de escopo

- Detecção de screenshot (impossível em web; nem tentar).
- Modo temporário em grupos.
- Per-message timer customizável (estilo Telegram).
- Re-enviar (resend) mensagem que expirou.
- Esconder conteúdo da push notification para mensagens temporárias.
- Histórico/auditoria de quem ativou/desativou (a mensagem de sistema já cobre).

---

## Mudanças por arquivo

### Backend (`geek-social-api`)

| Arquivo | Mudança |
|---------|---------|
| `src/shared/infra/database/migrations/0018_temporary_chat.sql` | **Novo** — adiciona colunas + índice |
| `src/shared/infra/database/migrations/meta/_journal.json` | Atualizar |
| `src/shared/infra/database/schema.ts` | Adicionar colunas em `conversations` e `messages` |
| `src/shared/contracts/conversations.repository.contract.ts` | `setTemporary(convId, value): Promise<void>` |
| `src/shared/contracts/messages.repository.contract.ts` | `Message.isTemporary` + `temporaryEvent`; `hardDeleteMessage(id)`; `findReadTemporaryReceivedBy(convId, userId, before): Message[]`; `findExpiredTemporary(cutoff): Message[]` |
| `src/modules/chat/conversations.repository.ts` | Implementar `setTemporary` |
| `src/modules/chat/messages.repository.ts` | Implementar novos métodos; `createMessage` recebe `isTemporary` + `temporaryEvent` |
| `src/modules/chat/conversations.service.ts` | `toggleTemporary(convId, userId, enabled)` + cria mensagem de sistema |
| `src/modules/chat/messages.service.ts` | `sendMessage` snapshot do `isTemporary`; `forwardMessage` rejeita temp; novos `cleanupReadMessagesFor`, `cleanupExpiredTemporary` |
| `src/modules/chat/chat.controller.ts` (enrichMessages) | Quando `findMessageRaw(replyId)` retorna `null`, retornar `replyTo` com placeholder `'Mensagem expirada'` (em vez de `null`). |
| `src/modules/chat/chat.controller.ts` | Novo handler `setTemporary` |
| `src/modules/chat/chat.routes.ts` | Rota `PATCH /conversations/:id/temporary` |
| `src/modules/chat/chat.schema.ts` | `setTemporarySchema` |
| `src/modules/chat/chat.gateway.ts` | Handler `chat:dm:leave`; método utilitário `isUserInRoom(userId, convId)` |
| `src/shared/infra/jobs/workers/temporary-cleanup-read.worker.ts` | **Novo** |
| `src/shared/infra/jobs/workers/temporary-cleanup-ttl.worker.ts` | **Novo** |
| `src/app.ts` | Registrar 2 workers + agendar (cada 60s e cada 1h) |
| `tests/modules/chat/messages.service.test.ts` | Estender |
| `tests/modules/chat/temporary.service.test.ts` | **Novo** |
| `tests/e2e/temporary-chat.e2e.test.ts` | **Novo** |

### Frontend (`geek-social-frontend`)

| Arquivo | Mudança |
|---------|---------|
| `src/modules/chat/types.ts` | `Conversation.isTemporary`, `Message.isTemporary`, `Message.temporaryEvent`, `MessageType += 'temporary_toggle'` |
| `src/modules/chat/services/chatService.ts` | `setTemporaryMode(convId, enabled)` |
| `src/modules/chat/composables/useChat.ts` | `toggleTemporary` action; emit `chat:dm:leave` no `setActiveConversation` |
| `src/modules/chat/views/ChatView.vue` | Item no menu ⋮ + banner condicional |
| `src/modules/chat/components/MessageBubble.vue` | Ícone ⏳; esconder Forward em mensagens temp; rotear `temporary_toggle` para `TemporarySystemMessage` |
| `src/modules/chat/components/TemporarySystemMessage.vue` | **Novo** |

---

## Plano de rollout

1. Migration aplicada em dev → spec frontend types atualizado simultaneamente.
2. Backend completo com testes verde.
3. Frontend toggle/banner/system message.
4. Frontend cleanup signals (chat:dm:leave) integrado.
5. Cron jobs registrados.
6. Smoke test manual: ligar modo, trocar mensagens, testar com 2 abas, observar o sumiço.

---
