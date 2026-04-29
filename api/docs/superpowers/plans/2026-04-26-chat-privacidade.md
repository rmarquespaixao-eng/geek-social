# Plano de Implementação — Privacidade e estado do chat

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar mute por conversa, visibilidade de presença (online/last seen) e read receipts (visto) com toggle recíproco, configuráveis pelo usuário em `SettingsView`.

**Architecture:** Schema ganha 3 colunas (1 em `conversation_members`, 2 em `users`). Backend filtra presence/read-receipts conforme flags do usuário. Sockets passam a usar salas `presence:{userId}` por amigo, em vez de room global. Frontend ganha 2 toggles em settings, ícone de sino na conversa, ícone `BellOff` em `ConversationItem`, checks (`Check`/`CheckCheck`) em mensagens próprias.

**Tech Stack:** Drizzle ORM + Postgres, Fastify, Socket.io, Vitest, Vue 3 + Pinia, Tailwind, lucide-vue-next.

**Spec:** `docs/superpowers/specs/2026-04-26-chat-privacidade-design.md`

---

## Convenções

- **Modelo de subagent:** TDD/implementação requer **Opus**. Tarefas auxiliares (movimentar arquivos, ajustar estilo) podem usar **Sonnet/Haiku**.
- **Rodar testes/typecheck do backend:** `cd /home/dev/workspace_ssh/geek-social-api && npx vitest run <path>` ou `npx tsc --noEmit`.
- **Rodar typecheck do frontend:** `cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit`.
- **Reiniciar apps após mudanças no backend:** sim. Frontend tem HMR — só reiniciar se quebrar.
- **Commits:** mensagens curtas em português imperativo, ex: `feat(chat): adiciona is_muted em conversation_members`.

---

## File Structure

### Novos arquivos

| Caminho | Responsabilidade |
|---|---|
| `geek-social-api/src/shared/infra/database/migrations/0012_chat_privacy.sql` | Migration: adiciona `conversation_members.is_muted`, `users.show_presence`, `users.show_read_receipts` |
| `geek-social-api/tests/modules/chat/conversations.service.mute.test.ts` | Testes de mute/unmute em ConversationsService |
| `geek-social-api/tests/modules/chat/messages.service.read-receipts.test.ts` | Testes de `seen` no enrich em DM e grupo, com filtro recíproco |
| `geek-social-api/tests/modules/users/users.service.settings.test.ts` | Testes de `updateSettings` |

### Arquivos modificados (backend)

| Caminho | Mudança |
|---|---|
| `geek-social-api/src/shared/infra/database/schema.ts` | Adicionar `isMuted` em `conversationMembers`, `showPresence`/`showReadReceipts` em `users` |
| `geek-social-api/src/shared/contracts/conversations.repository.contract.ts` | `ConversationMember.isMuted`, `ConversationWithMeta.isMuted`, novos métodos no repo |
| `geek-social-api/src/shared/contracts/user.repository.contract.ts` | `User.showPresence`/`showReadReceipts`, `UpdateProfileData` ganha settings |
| `geek-social-api/src/modules/chat/conversations.repository.ts` | `setMuted`, expor `isMuted` em mappers, presence filter em participants |
| `geek-social-api/src/modules/chat/conversations.service.ts` | Métodos `setMuted` |
| `geek-social-api/src/modules/chat/messages.service.ts` | Novo `enrichSeen(message, viewerId, viewerShowsReceipts, members)` exposto via service |
| `geek-social-api/src/modules/chat/chat.controller.ts` | Handlers `mute`/`unmute`; `enrichMessages` chama `enrichSeen`; emite `message:read` no `markAsRead` |
| `geek-social-api/src/modules/chat/chat.routes.ts` | Rotas POST `/chat/conversations/:id/mute` e `/unmute` |
| `geek-social-api/src/modules/chat/chat.gateway.ts` | Refator presence rooms, novos métodos `linkFriendship`/`unlinkFriendship`/`emitMessageRead`/`emitPresenceUpdate` |
| `geek-social-api/src/modules/chat/presence.service.ts` | Buscar lista de friends conectados ao emitir |
| `geek-social-api/src/modules/users/users.service.ts` | Método `updateSettings`; `getProfile` filtra presence; expõe settings em `getMe` |
| `geek-social-api/src/modules/users/users.repository.ts` | `updateSettings(userId, patch)` |
| `geek-social-api/src/modules/users/users.controller.ts` | Handler `updateSettings`; getMe inclui settings |
| `geek-social-api/src/modules/users/users.routes.ts` | Rota `PATCH /users/me/settings` |
| `geek-social-api/src/modules/users/users.schema.ts` | `updateSettingsSchema` |
| `geek-social-api/src/modules/friends/friends.service.ts` | Hook em `acceptRequest`/`block` chamando `gateway.linkFriendship`/`unlinkFriendship` |
| `geek-social-api/src/app.ts` | Injetar `chatGateway` em `friendsService` |

### Arquivos modificados (frontend)

| Caminho | Mudança |
|---|---|
| `geek-social-frontend/src/shared/types/auth.types.ts` | `User.showPresence`, `User.showReadReceipts` |
| `geek-social-frontend/src/modules/chat/types.ts` | `Conversation.isMuted`, `Message.seen?` (DM bool / group {count,total} / null), `SocketMessageRead` |
| `geek-social-frontend/src/modules/auth/services/usersService.ts` | `updateSettings({ showPresence?, showReadReceipts? })` |
| `geek-social-frontend/src/modules/chat/services/chatService.ts` | `muteConversation(id)`, `unmuteConversation(id)` |
| `geek-social-frontend/src/modules/chat/composables/useChat.ts` | `toggleMute(convId)`, handler `message:read`, `totalUnread` ignora muted |
| `geek-social-frontend/src/modules/chat/components/ConversationItem.vue` | Ícone `BellOff` + badge cinza quando muted |
| `geek-social-frontend/src/modules/chat/components/MessageBubble.vue` | Checks (Check/CheckCheck) em mensagens próprias |
| `geek-social-frontend/src/modules/chat/views/ChatView.vue` | Botão sino no header (toggle mute) |
| `geek-social-frontend/src/modules/auth/views/SettingsView.vue` | Seção "Privacidade do chat" com 2 toggles |

---

## Roadmap (ordem das tasks)

**Fase A — Schema e contratos (Tasks 1–2)**
**Fase B — Mute (Tasks 3–7)** — feature mais isolada, valida o pipeline
**Fase C — Settings de usuário (Tasks 8–11)** — base pras features 2 e 3
**Fase D — Read receipts (Tasks 12–16)** — usa `lastReadAt` existente + settings
**Fase E — Visibilidade de presença (Tasks 17–22)** — refator mais delicado, deixa por último
**Fase F — Frontend SettingsView (Task 23)** — consolida UI

---

## Task 1: Migration 0012 — schema de privacidade

**Files:**
- Create: `geek-social-api/src/shared/infra/database/migrations/0012_chat_privacy.sql`
- Modify: `geek-social-api/src/shared/infra/database/schema.ts:15-28` (users table)
- Modify: `geek-social-api/src/shared/infra/database/schema.ts:173-185` (conversationMembers table)

- [ ] **Step 1: Escrever a migration SQL**

Criar `geek-social-api/src/shared/infra/database/migrations/0012_chat_privacy.sql`:

```sql
ALTER TABLE "conversation_members" ADD COLUMN "is_muted" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_presence" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_read_receipts" boolean NOT NULL DEFAULT true;
```

- [ ] **Step 2: Atualizar `schema.ts`**

Em `users` (linhas 15-28), adicionar antes de `createdAt`:

```ts
  showPresence: boolean('show_presence').default(true).notNull(),
  showReadReceipts: boolean('show_read_receipts').default(true).notNull(),
```

Em `conversationMembers` (linhas 173-185), adicionar antes de `}, (table) => ({`:

```ts
  isMuted: boolean('is_muted').notNull().default(false),
```

- [ ] **Step 3: Aplicar a migration**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npm run db:migrate
```

Esperado: log indicando que `0012_chat_privacy.sql` foi aplicada. (Se o comando exato não existir, abrir `package.json` para confirmar — alternativa: `psql` direto no container.)

- [ ] **Step 4: Verificar coluna no banco**

```bash
docker exec -it $(docker ps --filter name=postgres --format '{{.Names}}' | head -1) psql -U dev -d geek_social -c "\d conversation_members" | grep is_muted
```

Esperado: linha mostrando `is_muted | boolean | not null default false`.

- [ ] **Step 5: Typecheck do backend**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/shared/infra/database/migrations/0012_chat_privacy.sql src/shared/infra/database/schema.ts && git commit -m "feat(db): adiciona schema de privacidade do chat (mute, presence, receipts)"
```

---

## Task 2: Atualizar contratos `User` e `ConversationMember`

**Files:**
- Modify: `geek-social-api/src/shared/contracts/user.repository.contract.ts:1-30`
- Modify: `geek-social-api/src/shared/contracts/conversations.repository.contract.ts:20-56`

- [ ] **Step 1: Adicionar settings ao `User`**

Em `user.repository.contract.ts`, `type User` (linhas 1-14), adicionar antes de `createdAt`:

```ts
  showPresence: boolean
  showReadReceipts: boolean
```

E em `UpdateProfileData` (linhas 24-30), adicionar:

```ts
  showPresence?: boolean
  showReadReceipts?: boolean
```

- [ ] **Step 2: Adicionar `isMuted` em `ConversationMember` e `ConversationWithMeta`**

Em `conversations.repository.contract.ts`, `type ConversationMember` (linhas 20-30), adicionar:

```ts
  isMuted: boolean
```

Em `ConversationWithMeta` (linhas 48-56), adicionar:

```ts
  isMuted: boolean
```

- [ ] **Step 3: Atualizar mappers do repo**

Em `geek-social-api/src/modules/chat/conversations.repository.ts:285-297`, no `mapMember`, adicionar `isMuted: row.isMuted`.

- [ ] **Step 4: Adicionar `isMuted: false` nos retornos de `findUserConversations` e `findConversationWithMeta`**

Em `findUserConversations` (linhas 113-201) no `results.push({...})`, adicionar `isMuted: myMembership.isMuted`.

Em `findConversationWithMeta` (linhas 203-264) no return, adicionar `isMuted: myMembership.isMuted`.

- [ ] **Step 5: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros (todos os contratos consistentes).

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/shared/contracts src/modules/chat/conversations.repository.ts && git commit -m "feat(contracts): expõe is_muted, show_presence e show_read_receipts"
```

---

## Task 3: Repo `setMuted`

**Files:**
- Modify: `geek-social-api/src/shared/contracts/conversations.repository.contract.ts:58-77` (interface)
- Modify: `geek-social-api/src/modules/chat/conversations.repository.ts:299-315` (implementação)

- [ ] **Step 1: Adicionar `setMuted` à interface**

Em `IConversationsRepository`, adicionar:

```ts
  setMuted(conversationId: string, userId: string, muted: boolean): Promise<void>
```

- [ ] **Step 2: Implementar em `ConversationsRepository`**

No fim do arquivo (após `setHiddenAt`):

```ts
  async setMuted(conversationId: string, userId: string, muted: boolean): Promise<void> {
    await this.db.update(conversationMembers)
      .set({ isMuted: muted })
      .where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ))
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/shared/contracts/conversations.repository.contract.ts src/modules/chat/conversations.repository.ts && git commit -m "feat(chat): repo setMuted"
```

---

## Task 4: Service `setMuted` — testes primeiro

**Files:**
- Create: `geek-social-api/tests/modules/chat/conversations.service.mute.test.ts`
- Modify: `geek-social-api/src/modules/chat/conversations.service.ts:170-186`

- [ ] **Step 1: Escrever teste falhando**

Criar `geek-social-api/tests/modules/chat/conversations.service.mute.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationsService } from '../../../src/modules/chat/conversations.service.js'
import { ChatError } from '../../../src/modules/chat/chat.errors.js'
import type { IConversationsRepository, ConversationMember } from '../../../src/shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'

function makeMember(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    id: 'm1', conversationId: 'c1', userId: 'u1', role: 'member',
    permissions: { can_send_messages: true, can_send_files: true },
    joinedAt: new Date(), lastReadAt: null, isArchived: false, hiddenAt: null, isMuted: false,
    ...overrides,
  }
}

function makeRepo(): IConversationsRepository {
  return {
    create: vi.fn(), findById: vi.fn(), update: vi.fn(), delete: vi.fn(),
    addMember: vi.fn(), findMember: vi.fn(), updateMember: vi.fn(), removeMember: vi.fn(),
    findMembers: vi.fn(), findMembersByUserId: vi.fn(),
    findExistingDm: vi.fn(), findUserConversations: vi.fn(), findConversationWithMeta: vi.fn(),
    updateLastReadAt: vi.fn(), setArchived: vi.fn(), setHiddenAt: vi.fn(),
    setMuted: vi.fn(),
  }
}

describe('ConversationsService.setMuted', () => {
  let repo: IConversationsRepository
  let friendsRepo: IFriendsRepository
  let storage: IStorageService
  let service: ConversationsService

  beforeEach(() => {
    repo = makeRepo()
    friendsRepo = {} as IFriendsRepository
    storage = {} as IStorageService
    service = new ConversationsService(repo, friendsRepo, storage)
  })

  it('marca como mute quando o membro existe', async () => {
    vi.mocked(repo.findMember).mockResolvedValue(makeMember())
    await service.setMuted('c1', 'u1', true)
    expect(repo.setMuted).toHaveBeenCalledWith('c1', 'u1', true)
  })

  it('desmarca mute quando solicitado', async () => {
    vi.mocked(repo.findMember).mockResolvedValue(makeMember({ isMuted: true }))
    await service.setMuted('c1', 'u1', false)
    expect(repo.setMuted).toHaveBeenCalledWith('c1', 'u1', false)
  })

  it('lança NOT_FOUND quando o usuário não é membro', async () => {
    vi.mocked(repo.findMember).mockResolvedValue(null)
    await expect(service.setMuted('c1', 'u1', true)).rejects.toThrow(ChatError)
  })
})
```

- [ ] **Step 2: Rodar teste, ver falhar**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/chat/conversations.service.mute.test.ts
```

Esperado: FAIL — `service.setMuted is not a function`.

- [ ] **Step 3: Implementar `setMuted` no service**

Em `geek-social-api/src/modules/chat/conversations.service.ts`, adicionar após `hideConversation` (linha ~186):

```ts
  async setMuted(conversationId: string, userId: string, muted: boolean): Promise<void> {
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    await this.repo.setMuted(conversationId, userId, muted)
  }
```

- [ ] **Step 4: Rodar teste, ver passar**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/chat/conversations.service.mute.test.ts
```

Esperado: PASS — 3 testes.

- [ ] **Step 5: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add tests/modules/chat/conversations.service.mute.test.ts src/modules/chat/conversations.service.ts && git commit -m "feat(chat): ConversationsService.setMuted"
```

---

## Task 5: Endpoints HTTP `mute`/`unmute`

**Files:**
- Modify: `geek-social-api/src/modules/chat/chat.controller.ts:432-436` (após `markAsRead`)
- Modify: `geek-social-api/src/modules/chat/chat.routes.ts` (adicionar 2 rotas)

- [ ] **Step 1: Adicionar handlers no controller**

Em `chat.controller.ts`, após `markAsRead` (linhas 432-436), adicionar:

```ts
  async muteConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.setMuted(req.params.id, userId, true)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async unmuteConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.setMuted(req.params.id, userId, false)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }
```

- [ ] **Step 2: Registrar as rotas**

Em `chat.routes.ts`, próximo às rotas de `archive`/`unarchive` (procurar `archive` no arquivo), adicionar:

```ts
  app.post('/conversations/:id/mute', { preHandler: [authenticate], handler: controller.muteConversation.bind(controller) })
  app.post('/conversations/:id/unmute', { preHandler: [authenticate], handler: controller.unmuteConversation.bind(controller) })
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Smoke test manual**

Reiniciar backend (`Ctrl-C` + `npm run dev`). Em outro terminal:

```bash
TOKEN="<jwt válido — pode pegar dos cookies do navegador ou do logs do app>"
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3003/chat/conversations/<convId>/mute -i
```

Esperado: `204 No Content`.

```bash
docker exec -it $(docker ps --filter name=postgres --format '{{.Names}}' | head -1) psql -U dev -d geek_social -c "SELECT user_id, is_muted FROM conversation_members WHERE conversation_id='<convId>'"
```

Esperado: linha do usuário com `is_muted = t`.

- [ ] **Step 5: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/chat/chat.controller.ts src/modules/chat/chat.routes.ts && git commit -m "feat(chat): endpoints POST mute/unmute conversa"
```

---

## Task 6: Frontend — service e store de mute

**Files:**
- Modify: `geek-social-frontend/src/modules/chat/types.ts:38-55` (`Conversation`)
- Modify: `geek-social-frontend/src/modules/chat/services/chatService.ts` (adicionar 2 funções)
- Modify: `geek-social-frontend/src/modules/chat/composables/useChat.ts:60-62` e adicionar `toggleMute`

- [ ] **Step 1: Adicionar `isMuted` no tipo Conversation**

Em `types.ts`, em `interface Conversation` (linhas 38-55), adicionar antes do fechamento:

```ts
  isMuted?: boolean
```

- [ ] **Step 2: Adicionar funções no chatService**

Em `chatService.ts`, próximo a `archiveConversation` (linhas 19-25):

```ts
export async function muteConversation(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/mute`)
}

export async function unmuteConversation(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/unmute`)
}
```

- [ ] **Step 3: Adicionar action `toggleMute` no useChat**

Em `useChat.ts`, próximo a `archiveConversation` (linhas 95-102), adicionar:

```ts
  async function toggleMute(conversationId: string): Promise<void> {
    const conv = conversations.value.find(c => c.id === conversationId)
      ?? archivedConversations.value.find(c => c.id === conversationId)
    if (!conv) return
    const next = !(conv.isMuted ?? false)
    if (next) await chatService.muteConversation(conversationId)
    else await chatService.unmuteConversation(conversationId)
    conv.isMuted = next
  }
```

E exportá-la no `return { ... }` final do store.

- [ ] **Step 4: Atualizar `totalUnread` para ignorar muted**

Em `useChat.ts`, substituir `totalUnread` (linhas 60-62) por:

```ts
  const totalUnread = computed(() =>
    conversations.value
      .filter(c => !c.isMuted)
      .reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
  )
```

- [ ] **Step 5: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && git add src/modules/chat/types.ts src/modules/chat/services/chatService.ts src/modules/chat/composables/useChat.ts && git commit -m "feat(chat): toggleMute no store e ignora muted no totalUnread"
```

---

## Task 7: Frontend — UI do mute (header e ConversationItem)

**Files:**
- Modify: `geek-social-frontend/src/modules/chat/views/ChatView.vue` (header)
- Modify: `geek-social-frontend/src/modules/chat/components/ConversationItem.vue`

- [ ] **Step 1: Adicionar botão sino no header de ChatView**

Em `ChatView.vue`, importar:

```ts
import { ArrowLeft, Users, MoreVertical, Eye, UserX, Bell, BellOff } from 'lucide-vue-next'
```

Localizar o trecho do header onde está o `MoreVertical`. Adicionar antes dele um botão que reflete o estado:

```vue
<button
  v-if="conversation"
  @click="chat.toggleMute(conversation.id)"
  class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
  :title="conversation.isMuted ? 'Reativar notificações' : 'Silenciar conversa'"
>
  <component :is="conversation.isMuted ? BellOff : Bell" :size="18" />
</button>
```

(`conversation` é a computed local da `ChatView` — verificar nome no arquivo, costuma ser `activeConv` ou `conv`. Se nomes diferirem, ajustar.)

- [ ] **Step 2: Adicionar ícone BellOff no ConversationItem**

Em `ConversationItem.vue`, importar `BellOff` no `lucide-vue-next` import. Localizar onde renderiza o nome da conversa, adicionar ao lado:

```vue
<BellOff
  v-if="conversation.isMuted"
  :size="14"
  class="text-(--color-text-muted) flex-shrink-0"
/>
```

- [ ] **Step 3: Badge de unread cinza quando muted**

Localizar a `<span>` que renderiza `unreadCount` (badge âmbar). Trocar por classes condicionais. Exemplo de classes-padrão (ajustar nomes ao que existe):

```vue
<span
  v-if="conversation.unreadCount > 0"
  :class="[
    'min-w-5 h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center',
    conversation.isMuted
      ? 'bg-(--color-bg-elevated) text-(--color-text-secondary)'
      : 'bg-(--color-accent-amber) text-[#0f0f1a]',
  ]"
>
  {{ conversation.unreadCount }}
</span>
```

- [ ] **Step 4: Verificar HMR — testar manualmente**

Frontend deve estar rodando em `localhost:5173`. Abrir uma conversa, clicar no sino. Esperado:
1. Sino vira `BellOff`.
2. Sair da view e voltar — estado persiste (vem do backend).
3. Receber mensagem nova: badge da `ConversationItem` aparece cinza, não âmbar.
4. Sidebar: ponto de unread no chat ignora a conversa silenciada (se ela é a única com unread, ponto some).

- [ ] **Step 5: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && git add src/modules/chat/views/ChatView.vue src/modules/chat/components/ConversationItem.vue && git commit -m "feat(chat): UI de mute (sino no header + BellOff no item + badge cinza)"
```

---

## Task 8: Endpoint `PATCH /users/me/settings`

**Files:**
- Modify: `geek-social-api/src/modules/users/users.schema.ts`
- Modify: `geek-social-api/src/modules/users/users.repository.ts`
- Modify: `geek-social-api/src/modules/users/users.service.ts`
- Modify: `geek-social-api/src/modules/users/users.controller.ts`
- Modify: `geek-social-api/src/modules/users/users.routes.ts`
- Create: `geek-social-api/tests/modules/users/users.service.settings.test.ts`

- [ ] **Step 1: Adicionar Zod schema**

Em `users.schema.ts`, adicionar:

```ts
export const updateSettingsSchema = z.object({
  showPresence: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
```

- [ ] **Step 2: Repo `updateSettings`**

Em `users.repository.ts`, adicionar método:

```ts
  async updateSettings(userId: string, patch: { showPresence?: boolean; showReadReceipts?: boolean }): Promise<User> {
    const result = await this.db.update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    return result[0]
  }
```

- [ ] **Step 3: Teste falhando do service**

Criar `geek-social-api/tests/modules/users/users.service.settings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsersService } from '../../../src/modules/users/users.service.js'
import type { UsersRepository } from '../../../src/modules/users/users.repository.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'
import type { User } from '../../../src/shared/contracts/user.repository.contract.js'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1', email: 'a@a.com', passwordHash: null, displayName: 'A',
    bio: null, avatarUrl: null, coverUrl: null, privacy: 'public',
    keycloakId: null, emailVerified: true,
    showPresence: true, showReadReceipts: true,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('UsersService.updateSettings', () => {
  let repo: UsersRepository
  let storage: IStorageService
  let service: UsersService

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      updateSettings: vi.fn(),
    } as unknown as UsersRepository
    storage = {} as IStorageService
    service = new UsersService(repo, storage)
  })

  it('atualiza showPresence', async () => {
    vi.mocked(repo.updateSettings).mockResolvedValue(makeUser({ showPresence: false }))
    const result = await service.updateSettings('u1', { showPresence: false })
    expect(repo.updateSettings).toHaveBeenCalledWith('u1', { showPresence: false })
    expect(result.showPresence).toBe(false)
  })

  it('atualiza showReadReceipts', async () => {
    vi.mocked(repo.updateSettings).mockResolvedValue(makeUser({ showReadReceipts: false }))
    const result = await service.updateSettings('u1', { showReadReceipts: false })
    expect(repo.updateSettings).toHaveBeenCalledWith('u1', { showReadReceipts: false })
    expect(result.showReadReceipts).toBe(false)
  })
})
```

- [ ] **Step 4: Rodar teste — ver falhar**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/users/users.service.settings.test.ts
```

Esperado: FAIL — `service.updateSettings is not a function`.

- [ ] **Step 5: Implementar `updateSettings` no service**

Em `users.service.ts`, adicionar:

```ts
  async updateSettings(userId: string, patch: { showPresence?: boolean; showReadReceipts?: boolean }): Promise<User> {
    return this.usersRepository.updateSettings(userId, patch)
  }
```

- [ ] **Step 6: Rodar teste — passar**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/users/users.service.settings.test.ts
```

Esperado: PASS — 2 testes.

- [ ] **Step 7: Controller + rota**

Em `users.controller.ts`, adicionar handler:

```ts
  async updateSettings(request: FastifyRequest<{ Body: import('./users.schema.js').UpdateSettingsInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const updated = await this.usersService.updateSettings(userId, request.body)
    return reply.send({ showPresence: updated.showPresence, showReadReceipts: updated.showReadReceipts })
  }
```

E no topo, importar:

```ts
import { updateSettingsSchema } from './users.schema.js'
```

Adicionar parse do body antes de chamar (Fastify não valida automaticamente). Substituir o handler por:

```ts
  async updateSettings(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const body = updateSettingsSchema.parse(request.body)
    const updated = await this.usersService.updateSettings(userId, body)
    return reply.send({ showPresence: updated.showPresence, showReadReceipts: updated.showReadReceipts })
  }
```

Em `users.routes.ts`, adicionar:

```ts
  app.patch('/me/settings', {
    preHandler: [authenticate],
    handler: controller.updateSettings.bind(controller),
  })
```

- [ ] **Step 8: Atualizar `getProfile` (getMe) pra incluir settings quando viewer === target**

Em `users.service.ts`, no `getProfile`, no return final (linhas 66-75), adicionar:

```ts
      ...(isOwner ? {
        showPresence: user.showPresence,
        showReadReceipts: user.showReadReceipts,
      } : {}),
```

E no `PublicProfile` type (linhas 16-29), adicionar:

```ts
  showPresence?: boolean
  showReadReceipts?: boolean
```

- [ ] **Step 9: Smoke test**

Reiniciar backend. Em outro terminal:

```bash
TOKEN="<jwt>"
curl -s -X PATCH http://localhost:3003/users/me/settings -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"showPresence": false}'
```

Esperado: `{"showPresence":false,"showReadReceipts":true}`.

```bash
curl -s http://localhost:3003/users/me -H "Authorization: Bearer $TOKEN" | grep -o 'showPresence.....'
```

Esperado: `showPresence":false`.

- [ ] **Step 10: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/users tests/modules/users && git commit -m "feat(users): PATCH /users/me/settings (showPresence, showReadReceipts)"
```

---

## Task 9: Frontend — service e store de settings

**Files:**
- Modify: `geek-social-frontend/src/shared/types/auth.types.ts:1-10`
- Modify: `geek-social-frontend/src/modules/auth/services/usersService.ts`

- [ ] **Step 1: Adicionar settings ao tipo User**

Em `auth.types.ts`, em `interface User` (linhas 1-10), adicionar:

```ts
  showPresence?: boolean
  showReadReceipts?: boolean
```

- [ ] **Step 2: Adicionar `updateSettings` no service**

Em `usersService.ts`, adicionar:

```ts
export async function updateSettings(payload: { showPresence?: boolean; showReadReceipts?: boolean }): Promise<{ showPresence: boolean; showReadReceipts: boolean }> {
  const { data } = await api.patch<{ showPresence: boolean; showReadReceipts: boolean }>('/users/me/settings', payload)
  return data
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && git add src/shared/types/auth.types.ts src/modules/auth/services/usersService.ts && git commit -m "feat(users): updateSettings service no frontend"
```

---

## Task 10: Endpoints `getMe` e `getProfile` filtram presence

**Files:**
- Modify: `geek-social-api/src/modules/users/users.service.ts:38-76`

- [ ] **Step 1: Filtrar `isOnline`/`lastSeenAt` no `getProfile`**

Em `users.service.ts`, `getProfile`, no retorno final, garantir que campos de presence só aparecem se o caller tem permissão.

Hoje o método não retorna presence — quem retorna é a inclusão do `usersRepository.findById` na rota direta. Para esta task, manter o `getProfile` sem mudanças adicionais aqui — a filtragem de presence acontece no momento de emitir/expor presence em outras camadas (chat e profile).

**Mas** o `PublicProfile` precisa expor `showPresence` apenas se `isOwner` (já feito na Task 8). Confirmar.

- [ ] **Step 2: Adicionar campos `isOnline`/`lastSeenAt` no `PublicProfile`**

Em `users.service.ts`, em `type PublicProfile`, adicionar:

```ts
  isOnline?: boolean
  lastSeenAt?: string | null
```

- [ ] **Step 3: Injetar `presenceService` em `UsersService`**

Em `users.service.ts`, mudar o constructor:

```ts
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly storageService: IStorageService,
    private readonly friendsRepository?: IFriendsRepository,
    private readonly presenceService?: import('../chat/presence.service.js').PresenceService,
  ) {}
```

- [ ] **Step 4: Atualizar DI em `app.ts`**

Em `geek-social-api/src/app.ts`, localizar a instanciação de `usersService` (procurar `new UsersService`). Adicionar `presenceService` como 4º argumento. **Garantir que `presenceService` já tenha sido instanciado antes** — se não, mover a instanciação. (Hoje o `presenceService` é instanciado dentro do bloco do chat.)

Se a ordem for problema, criar `presenceService` antes do `usersService`. Se isso quebrar dependência circular, deixar `presenceService` como undefined no `UsersService` e injetá-lo depois via setter — mas a opção limpa é só reordenar.

- [ ] **Step 5: No `getProfile`, popular presence se permitido**

Adicionar antes do return final:

```ts
    let isOnline: boolean | undefined
    let lastSeenAt: string | null | undefined
    const canSeePresence = isOwner || (isFriend && user.showPresence)
    if (canSeePresence && this.presenceService) {
      isOnline = this.presenceService.isOnline(userId)
      const ls = await this.presenceService.getLastSeen(userId)
      lastSeenAt = ls ? ls.toISOString() : null
    }
```

E no return (full profile, não restricted), adicionar:

```ts
      ...(isOnline !== undefined ? { isOnline, lastSeenAt: lastSeenAt ?? null } : {}),
```

- [ ] **Step 6: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 7: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/users/users.service.ts src/app.ts && git commit -m "feat(users): getProfile expõe presence filtrada por amizade e showPresence"
```

---

## Task 11: Filtro de presence em `findUserConversations` / `findConversationWithMeta`

**Files:**
- Modify: `geek-social-api/src/modules/chat/conversations.repository.ts`

- [ ] **Step 1: Aceitar mapa de presence + showPresence opcional no construtor da repo**

Para evitar acoplar presence à repo, fazer o filtro no service. Vamos repassar a tarefa pra `ConversationsService.enrichWithBlockInfo`.

Em `enrichWithBlockInfo` (linhas 43-63), expandir para receber `friendsRepo`/`presenceService`/`usersRepo` e popular `isOnline` apenas para participantes amigos com `showPresence=true`.

**Modificar `ConversationsService` constructor** para receber `presenceService` e `usersRepository`:

```ts
  constructor(
    private readonly repo: IConversationsRepository,
    private readonly friendsRepo: IFriendsRepository,
    private readonly storageService: IStorageService,
    private readonly presenceService?: import('./presence.service.js').PresenceService,
    private readonly usersRepository?: import('../users/users.repository.js').UsersRepository,
  ) {}
```

- [ ] **Step 2: Atualizar `enrichWithBlockInfo` pra popular presence**

Substituir o método por:

```ts
  private async enrichWithBlockInfo(conv: ConversationWithMeta, viewerId: string): Promise<ConversationWithMeta> {
    // Aplicar filtro de presence em participantes amigos com showPresence=true
    let participants = conv.participants
    if (this.presenceService && this.usersRepository) {
      const enriched = await Promise.all(participants.map(async p => {
        if (p.userId === viewerId) return p
        const isFriend = await this.friendsRepo.areFriends(viewerId, p.userId)
        if (!isFriend) return p
        const user = await this.usersRepository!.findById(p.userId)
        if (!user || !user.showPresence) return p
        return { ...p, isOnline: this.presenceService!.isOnline(p.userId) }
      }))
      participants = enriched
    }

    if (conv.type !== 'dm') return { ...conv, participants }

    const other = participants.find(p => p.userId !== viewerId)
    if (!other) return { ...conv, participants }
    const [isBlockedByMe, isBlockedByOther] = await Promise.all([
      this.friendsRepo.isBlockedBy(viewerId, other.userId),
      this.friendsRepo.isBlockedBy(other.userId, viewerId),
    ])

    if (isBlockedByOther) {
      participants = participants.map(p =>
        p.userId === other.userId
          ? { ...p, displayName: 'Usuário do Geek Social', avatarUrl: null, isOnline: false }
          : p,
      )
    }

    return { ...conv, participants, isBlockedByMe, isBlockedByOther }
  }
```

- [ ] **Step 3: Atualizar DI em `app.ts`**

Em `app.ts`, localizar `new ConversationsService(...)` e passar `presenceService` e `usersRepository` (na ordem nova). Se `presenceService`/`usersRepository` ainda não foram criados naquele ponto, mover a instanciação para antes.

- [ ] **Step 4: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 5: Smoke**

Reiniciar backend. No frontend, com 2 usuários amigos: usuário A vai em settings e marca `showPresence=false` (via curl ou UI quando estiver pronta). Usuário B abre `GET /chat/conversations` — esperado: `participants` do A não tem `isOnline=true` (será `false`).

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/chat/conversations.service.ts src/app.ts && git commit -m "feat(chat): conversa filtra isOnline por amizade + showPresence"
```

---

## Task 12: Service `enrichSeen` — testes primeiro

**Files:**
- Create: `geek-social-api/tests/modules/chat/messages.service.read-receipts.test.ts`
- Modify: `geek-social-api/src/modules/chat/messages.service.ts`

- [ ] **Step 1: Estender `MessagesService` com método público `computeSeen`**

A função pura recebe a mensagem, viewerId, settings e estados de leitura.

```ts
type SeenInput = {
  message: { id: string; userId: string; conversationId: string; createdAt: Date }
  viewerId: string
  viewerShowsReceipts: boolean
  conversationType: 'dm' | 'group'
  otherMembers: Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>
}

export type SeenResult =
  | null
  | { type: 'dm'; seen: boolean }
  | { type: 'group'; count: number; total: number }
```

- [ ] **Step 2: Escrever teste falhando**

Criar `geek-social-api/tests/modules/chat/messages.service.read-receipts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeSeen } from '../../../src/modules/chat/messages.service.js'

const baseMsg = { id: 'm1', userId: 'me', conversationId: 'c1', createdAt: new Date('2026-04-26T10:00:00Z') }

describe('computeSeen — DM', () => {
  it('retorna null quando viewer.showReadReceipts=false', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: false,
      conversationType: 'dm',
      otherMembers: [{ userId: 'peer', lastReadAt: new Date('2026-04-26T10:01:00Z'), showReadReceipts: true }],
    })).toBeNull()
  })

  it('retorna null quando peer.showReadReceipts=false', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'dm',
      otherMembers: [{ userId: 'peer', lastReadAt: new Date('2026-04-26T10:01:00Z'), showReadReceipts: false }],
    })).toBeNull()
  })

  it('seen=true quando peer.lastReadAt >= message.createdAt', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'dm',
      otherMembers: [{ userId: 'peer', lastReadAt: new Date('2026-04-26T10:01:00Z'), showReadReceipts: true }],
    })).toEqual({ type: 'dm', seen: true })
  })

  it('seen=false quando peer ainda não leu', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'dm',
      otherMembers: [{ userId: 'peer', lastReadAt: null, showReadReceipts: true }],
    })).toEqual({ type: 'dm', seen: false })
  })
})

describe('computeSeen — grupo', () => {
  it('retorna null quando viewer.showReadReceipts=false', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: false,
      conversationType: 'group',
      otherMembers: [
        { userId: 'a', lastReadAt: new Date('2026-04-26T10:02:00Z'), showReadReceipts: true },
        { userId: 'b', lastReadAt: null, showReadReceipts: true },
      ],
    })).toBeNull()
  })

  it('count=2 / total=2 quando todos os outros leram (todos com flag true)', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'group',
      otherMembers: [
        { userId: 'a', lastReadAt: new Date('2026-04-26T10:02:00Z'), showReadReceipts: true },
        { userId: 'b', lastReadAt: new Date('2026-04-26T10:03:00Z'), showReadReceipts: true },
      ],
    })).toEqual({ type: 'group', count: 2, total: 2 })
  })

  it('count exclui membros com showReadReceipts=false', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'group',
      otherMembers: [
        { userId: 'a', lastReadAt: new Date('2026-04-26T10:02:00Z'), showReadReceipts: true },
        { userId: 'b', lastReadAt: new Date('2026-04-26T10:03:00Z'), showReadReceipts: false },
      ],
    })).toEqual({ type: 'group', count: 1, total: 2 })
  })

  it('count=0 quando ninguém leu', () => {
    expect(computeSeen({
      message: baseMsg, viewerId: 'me', viewerShowsReceipts: true,
      conversationType: 'group',
      otherMembers: [
        { userId: 'a', lastReadAt: null, showReadReceipts: true },
        { userId: 'b', lastReadAt: null, showReadReceipts: true },
      ],
    })).toEqual({ type: 'group', count: 0, total: 2 })
  })
})
```

- [ ] **Step 3: Rodar — ver falhar**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/chat/messages.service.read-receipts.test.ts
```

Esperado: FAIL — `computeSeen is not exported`.

- [ ] **Step 4: Implementar `computeSeen`**

Em `messages.service.ts`, adicionar (no nível do módulo, fora da classe):

```ts
export type SeenResult =
  | null
  | { type: 'dm'; seen: boolean }
  | { type: 'group'; count: number; total: number }

type SeenInput = {
  message: { id: string; userId: string; conversationId: string; createdAt: Date }
  viewerId: string
  viewerShowsReceipts: boolean
  conversationType: 'dm' | 'group'
  otherMembers: Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>
}

export function computeSeen(input: SeenInput): SeenResult {
  if (!input.viewerShowsReceipts) return null
  if (input.message.userId !== input.viewerId) return null
  if (input.conversationType === 'dm') {
    const peer = input.otherMembers[0]
    if (!peer || !peer.showReadReceipts) return null
    const seen = peer.lastReadAt ? peer.lastReadAt.getTime() >= input.message.createdAt.getTime() : false
    return { type: 'dm', seen }
  }
  const total = input.otherMembers.length
  let count = 0
  for (const m of input.otherMembers) {
    if (!m.showReadReceipts) continue
    if (m.lastReadAt && m.lastReadAt.getTime() >= input.message.createdAt.getTime()) count += 1
  }
  return { type: 'group', count, total }
}
```

- [ ] **Step 5: Rodar — ver passar**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/chat/messages.service.read-receipts.test.ts
```

Esperado: PASS — 8 testes.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add tests/modules/chat/messages.service.read-receipts.test.ts src/modules/chat/messages.service.ts && git commit -m "feat(chat): computeSeen — read receipts puros (DM + grupo)"
```

---

## Task 13: Repo helper `findMembersWithReceiptsFlag`

**Files:**
- Modify: `geek-social-api/src/shared/contracts/conversations.repository.contract.ts`
- Modify: `geek-social-api/src/modules/chat/conversations.repository.ts`

- [ ] **Step 1: Adicionar método à interface**

Em `IConversationsRepository`:

```ts
  findMembersWithReceiptsFlag(conversationId: string): Promise<Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>>
```

- [ ] **Step 2: Implementar**

Em `conversations.repository.ts`, adicionar:

```ts
  async findMembersWithReceiptsFlag(conversationId: string): Promise<Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>> {
    const rows = await this.db
      .select({
        userId: conversationMembers.userId,
        lastReadAt: conversationMembers.lastReadAt,
        showReadReceipts: users.showReadReceipts,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(eq(conversationMembers.conversationId, conversationId))
    return rows
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/shared/contracts/conversations.repository.contract.ts src/modules/chat/conversations.repository.ts && git commit -m "feat(chat): findMembersWithReceiptsFlag (lastReadAt + showReadReceipts)"
```

---

## Task 14: Enrich integra `seen` no controller

**Files:**
- Modify: `geek-social-api/src/modules/chat/chat.controller.ts:62-151`

- [ ] **Step 1: Buscar viewer + members antes do map**

Em `enrichMessages`, após carregar `senderRows`, adicionar:

```ts
    const viewer = viewerId ? await this.usersRepository.findById(viewerId) : null
    const conversationsTouched = [...new Set(msgs.map(m => m.conversationId))]
    const membersByConv = new Map<string, Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>>()
    if (viewer && viewer.showReadReceipts) {
      for (const cid of conversationsTouched) {
        const members = await this.conversationsService.findMembersWithReceiptsFlag(cid)
        membersByConv.set(cid, members)
      }
    }
    // Tipo da conversa para cada conversationId
    const convTypeByConv = new Map<string, 'dm' | 'group'>()
    for (const cid of conversationsTouched) {
      const c = await this.conversationsService.getConversation(cid, viewerId ?? '').catch(() => null)
      if (c) convTypeByConv.set(cid, c.type)
    }
```

(Para evitar a chamada redundante de `getConversation`, pode-se agrupar via `findById` direto, mas pra simplificar deixaremos assim agora. Se for problema de perf, refatorar depois.)

- [ ] **Step 2: Expor `findMembersWithReceiptsFlag` no service**

Em `conversations.service.ts`, adicionar:

```ts
  async findMembersWithReceiptsFlag(conversationId: string) {
    return this.repo.findMembersWithReceiptsFlag(conversationId)
  }
```

- [ ] **Step 3: Computar `seen` no `msgs.map(...)`**

Importar `computeSeen` no topo do `chat.controller.ts`:

```ts
import { computeSeen, type SeenResult } from './messages.service.js'
```

No bloco `return { ...msg }` final do map (linhas ~121-149), adicionar antes do `return`:

```ts
        let seen: SeenResult = null
        if (viewerId && viewer && msg.userId === viewerId) {
          const convType = convTypeByConv.get(msg.conversationId)
          const allMembers = membersByConv.get(msg.conversationId) ?? []
          if (convType) {
            const otherMembers = allMembers.filter(m => m.userId !== viewerId)
            seen = computeSeen({
              message: { id: msg.id, userId: msg.userId, conversationId: msg.conversationId, createdAt: msg.createdAt },
              viewerId,
              viewerShowsReceipts: viewer.showReadReceipts,
              conversationType: convType,
              otherMembers,
            })
          }
        }
```

E adicionar `seen` no objeto retornado (junto com `reactions`):

```ts
        seen,
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 5: Smoke manual**

Reiniciar backend. Em curl:

```bash
TOKEN="<jwt do meu user>"
curl -s "http://localhost:3003/chat/conversations/<convId>/messages?limit=5" -H "Authorization: Bearer $TOKEN" | jq '.messages[] | {id, senderId, seen}'
```

Esperado: mensagens próprias retornam `seen: { type: "dm", seen: true|false }` ou `null`. Mensagens de outros vem `seen: null`.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/chat/chat.controller.ts src/modules/chat/conversations.service.ts && git commit -m "feat(chat): enrichMessages popula seen em mensagens próprias"
```

---

## Task 15: Socket `message:read` em real-time

**Files:**
- Modify: `geek-social-api/src/modules/chat/chat.gateway.ts:108-112` (handler conversation:read)
- Modify: `geek-social-api/src/modules/chat/chat.controller.ts:432-436` (markAsRead HTTP)

- [ ] **Step 1: Novo método no gateway**

Em `chat.gateway.ts`, adicionar perto dos outros emitters (após `emitMessageReaction`):

```ts
  emitMessageRead(conversationId: string, userId: string, lastReadAt: Date): void {
    this.io.to(`conv:${conversationId}`).emit('message:read', {
      conversationId,
      userId,
      lastReadAt: lastReadAt.toISOString(),
    })
  }
```

- [ ] **Step 2: Disparar no socket handler `conversation:read`**

Substituir o handler (linhas 109-111) por:

```ts
      socket.on('conversation:read', async (data: { conversationId: string }) => {
        await this.conversationsService.markAsRead(data.conversationId, userId).catch(() => {})
        this.emitMessageRead(data.conversationId, userId, new Date())
      })
```

- [ ] **Step 3: Disparar no `markAsRead` HTTP do controller**

Em `chat.controller.ts`, no `markAsRead` (linhas 432-436), substituir por:

```ts
  async markAsRead(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    const ok = await this.conversationsService.markAsRead(req.params.id, userId).then(() => true).catch(() => false)
    if (ok) this.chatGateway.emitMessageRead(req.params.id, userId, new Date())
    return reply.status(204).send()
  }
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 5: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/chat/chat.gateway.ts src/modules/chat/chat.controller.ts && git commit -m "feat(chat): emite message:read em markAsRead (socket + HTTP)"
```

---

## Task 16: Frontend — UI de checks + handler `message:read`

**Files:**
- Modify: `geek-social-frontend/src/modules/chat/types.ts:87-102` (Message)
- Modify: `geek-social-frontend/src/modules/chat/composables/useChat.ts` (handler `message:read`)
- Modify: `geek-social-frontend/src/modules/chat/components/MessageBubble.vue`

- [ ] **Step 1: Adicionar tipo `Seen` em types**

Em `types.ts`:

```ts
export type Seen =
  | null
  | { type: 'dm'; seen: boolean }
  | { type: 'group'; count: number; total: number }
```

E no `interface Message`, adicionar campo:

```ts
  seen?: Seen
```

E adicionar tipo socket:

```ts
export interface SocketMessageRead {
  conversationId: string
  userId: string
  lastReadAt: string
}
```

- [ ] **Step 2: Handler `message:read` no useChat**

Em `useChat.ts`, importar `SocketMessageRead`. Adicionar handler:

```ts
  function handleMessageRead(data: unknown): void {
    const payload = data as SocketMessageRead
    const conv = conversations.value.find(c => c.id === payload.conversationId)
    if (!conv) return
    const list = messages.value.get(payload.conversationId)
    if (!list) return
    // Recalcular seen para mensagens próprias usando o lastReadAt recebido
    const myId = authStore.user?.id
    if (!myId) return
    const readAt = new Date(payload.lastReadAt).getTime()
    const updated = list.map(m => {
      if (m.senderId !== myId) return m
      const created = new Date(m.createdAt).getTime()
      if (conv.type === 'dm') {
        const isPeer = payload.userId !== myId
        if (!isPeer) return m
        const seen = readAt >= created
        return { ...m, seen: m.seen ? { ...m.seen, seen } as const : { type: 'dm' as const, seen } }
      }
      // grupo
      if (payload.userId === myId) return m
      if (!m.seen || m.seen.type !== 'group') return m
      const wasSeenByThisUser = readAt >= created
      const next = wasSeenByThisUser
        ? Math.min(m.seen.count + 1, m.seen.total)
        : m.seen.count
      return { ...m, seen: { ...m.seen, count: next } }
    })
    messages.value = new Map(messages.value).set(payload.conversationId, updated)
  }
```

E registrar no `init()`:

```ts
    sock.on('message:read', handleMessageRead)
```

- [ ] **Step 3: Renderizar checks no MessageBubble**

Em `MessageBubble.vue`, importar:

```ts
import { Trash2, Reply, MoreHorizontal, Download, SmilePlus, X, Check, CheckCheck } from 'lucide-vue-next'
```

Localizar onde renderiza o timestamp da mensagem (no rodapé do bubble). Adicionar (apenas se `isOwn`):

```vue
<span v-if="isOwn && message.seen" class="ml-1 inline-flex items-center" :title="seenTitle">
  <Check
    v-if="(message.seen.type === 'dm' && !message.seen.seen) || (message.seen.type === 'group' && message.seen.count === 0)"
    :size="14"
    class="text-(--color-text-muted)"
  />
  <CheckCheck
    v-else-if="(message.seen.type === 'dm' && message.seen.seen) || (message.seen.type === 'group' && message.seen.count === message.seen.total)"
    :size="14"
    class="text-(--color-accent-amber)"
  />
  <CheckCheck
    v-else
    :size="14"
    class="text-(--color-text-muted)"
  />
</span>
```

E na `<script>`, adicionar computed:

```ts
const seenTitle = computed(() => {
  const s = props.message.seen
  if (!s) return ''
  if (s.type === 'dm') return s.seen ? 'Visto' : 'Enviado'
  return s.count === s.total ? 'Visto por todos' : `Visto por ${s.count} de ${s.total}`
})
```

- [ ] **Step 4: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 5: Smoke manual**

Backend e frontend rodando. Com 2 navegadores (usuários A e B amigos):
1. A envia mensagem para B em DM. B fica com a conversa fechada. Em A, deve aparecer 1 check cinza.
2. B abre a conversa. Em A, o check vira check duplo âmbar (recebe `message:read` via socket).
3. A vai em settings e desliga `showReadReceipts`. Mensagens de A para B em DM deixam de mostrar checks.

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && git add src/modules/chat/types.ts src/modules/chat/composables/useChat.ts src/modules/chat/components/MessageBubble.vue && git commit -m "feat(chat): UI dos read receipts + handler socket message:read"
```

---

## Task 17: `presenceService.getFriendIdsOnline` (helper)

**Files:**
- Modify: `geek-social-api/src/modules/chat/presence.service.ts`

- [ ] **Step 1: Adicionar método público utilitário**

Em `presence.service.ts`, adicionar:

```ts
  getOnlineUserIdsAmong(userIds: string[]): string[] {
    return userIds.filter(uid => this.isOnline(uid))
  }
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 3: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/chat/presence.service.ts && git commit -m "feat(presence): getOnlineUserIdsAmong helper"
```

---

## Task 18: Refator de presence rooms — connect

**Files:**
- Modify: `geek-social-api/src/modules/chat/chat.gateway.ts:57-80` (connect handler)

- [ ] **Step 1: Substituir o trecho de presence join + emit no connect**

Em `chat.gateway.ts`, substituir:

```ts
      socket.join('presence')
      socket.join(`user:${userId}`)

      // Marcar online e notificar
      this.presenceService.userConnected(userId, socket.id)
      this.io.to('presence').emit('presence:update', { userId, isOnline: true, lastSeenAt: null })

      // Enviar status inicial de todos os usuários online para este socket
      const onlineUserIds = this.presenceService.getOnlineUserIds()
      socket.emit('presence:bulk', onlineUserIds.map(uid => ({ userId: uid, isOnline: true })))

      // Cliente pode pedir lista de presença sob demanda
      socket.on('presence:request', () => {
        const ids = this.presenceService.getOnlineUserIds()
        socket.emit('presence:bulk', ids.map(uid => ({ userId: uid, isOnline: true })))
      })
```

Por:

```ts
      socket.join(`user:${userId}`)

      // Friend graph para presence rooms
      const friendIds = await this.friendsRepo.findFriendIds(userId)
      for (const fid of friendIds) {
        socket.join(`presence:${fid}`)
      }

      // Marcar online
      this.presenceService.userConnected(userId, socket.id)

      // Emitir presence:update apenas se o user permite
      const me = await this.usersRepository.findById(userId)
      if (me?.showPresence) {
        this.io.to(`presence:${userId}`).emit('presence:update', {
          userId, isOnline: true, lastSeenAt: null,
        })
      }

      // Bulk inicial: friends online com showPresence=true
      const onlineFriends = this.presenceService.getOnlineUserIdsAmong(friendIds)
      const onlineUserRows = onlineFriends.length
        ? await Promise.all(onlineFriends.map(uid => this.usersRepository.findById(uid)))
        : []
      const visibleOnline = onlineUserRows
        .filter((u): u is NonNullable<typeof u> => !!u && u.showPresence)
        .map(u => ({ userId: u.id, isOnline: true }))
      socket.emit('presence:bulk', visibleOnline)

      // presence:request — pode pedir refresh
      socket.on('presence:request', async () => {
        const fids = await this.friendsRepo.findFriendIds(userId)
        const onlineNow = this.presenceService.getOnlineUserIdsAmong(fids)
        const rows = await Promise.all(onlineNow.map(uid => this.usersRepository.findById(uid)))
        const list = rows
          .filter((u): u is NonNullable<typeof u> => !!u && u.showPresence)
          .map(u => ({ userId: u.id, isOnline: true }))
        socket.emit('presence:bulk', list)
      })
```

- [ ] **Step 2: Substituir o emit do disconnect**

Em `chat.gateway.ts`, no handler `disconnect` (linhas 224-230):

```ts
        const isNowOffline = this.presenceService.userDisconnected(userId, socket.id)
        if (isNowOffline) {
          const lastSeenAt = await this.presenceService.persistLastSeen(userId)
          const me = await this.usersRepository.findById(userId)
          if (me?.showPresence) {
            this.io.to(`presence:${userId}`).emit('presence:update', {
              userId, isOnline: false, lastSeenAt: lastSeenAt.toISOString(),
            })
          }
        }
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Smoke**

Reiniciar backend. Com 2 navegadores A e B amigos: ao A conectar, B deve receber `presence:update` indicando A online. Ao A desconectar, B recebe outro `presence:update` com `isOnline=false`.

Verificar no log do backend que não há mais o broadcast pra room `presence`.

- [ ] **Step 5: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/chat/chat.gateway.ts && git commit -m "feat(chat): presence rooms por amigo (presence:{userId})"
```

---

## Task 19: `linkFriendship`/`unlinkFriendship` no gateway + hooks no FriendsService

**Files:**
- Modify: `geek-social-api/src/modules/chat/chat.gateway.ts`
- Modify: `geek-social-api/src/modules/friends/friends.service.ts`
- Modify: `geek-social-api/src/app.ts` (DI)

- [ ] **Step 1: Adicionar métodos ao gateway**

Em `chat.gateway.ts`, próximo aos outros emitters, adicionar:

```ts
  async linkFriendship(userIdA: string, userIdB: string): Promise<void> {
    const sockets = await this.io.fetchSockets()
    for (const sock of sockets) {
      const sid = sock.data.userId as string
      if (sid === userIdA) sock.join(`presence:${userIdB}`)
      if (sid === userIdB) sock.join(`presence:${userIdA}`)
    }
    // Notify retroativo: se um lado está online com showPresence=true, emitir pro outro
    const [a, b] = await Promise.all([
      this.usersRepository.findById(userIdA),
      this.usersRepository.findById(userIdB),
    ])
    if (a?.showPresence && this.presenceService.isOnline(userIdA)) {
      this.io.to(`presence:${userIdA}`).emit('presence:update', { userId: userIdA, isOnline: true, lastSeenAt: null })
    }
    if (b?.showPresence && this.presenceService.isOnline(userIdB)) {
      this.io.to(`presence:${userIdB}`).emit('presence:update', { userId: userIdB, isOnline: true, lastSeenAt: null })
    }
  }

  async unlinkFriendship(userIdA: string, userIdB: string): Promise<void> {
    const sockets = await this.io.fetchSockets()
    for (const sock of sockets) {
      const sid = sock.data.userId as string
      if (sid === userIdA) sock.leave(`presence:${userIdB}`)
      if (sid === userIdB) sock.leave(`presence:${userIdA}`)
    }
  }
```

- [ ] **Step 2: Hook no FriendsService**

Em `friends.service.ts`, descobrir métodos `acceptRequest` e `block`. Após a operação dar certo, chamar (via setter ou parâmetro opcional):

Constructor recebe `chatGateway?: import('../chat/chat.gateway.js').ChatGateway`. Em `acceptRequest`, depois de persistir aceite, adicionar `await this.chatGateway?.linkFriendship(requesterId, receiverId)`. Em `block`, depois de persistir block (e desfazer amizade), adicionar `await this.chatGateway?.unlinkFriendship(blockerId, blockedId)`.

(Verificar nome dos parâmetros no arquivo real.)

- [ ] **Step 3: Atualizar DI em app.ts**

Em `app.ts`, ao instanciar `FriendsService`, passar `chatGateway` (que é instanciado depois). Resolver via `friendsService.setChatGateway(chatGateway)` se preferir manter ordem atual.

Implementação simples: no `FriendsService`, adicionar:

```ts
  setChatGateway(gw: import('../chat/chat.gateway.js').ChatGateway): void {
    this.chatGateway = gw
  }
```

E em `app.ts`, depois de instanciar o gateway: `friendsService.setChatGateway(chatGateway)`.

- [ ] **Step 4: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 5: Smoke**

Reiniciar backend. A e B não-amigos. A aceita pedido de B (via UI). Sem reconectar, B fica online — A passa a ver presence updates de B (em tempo real).

- [ ] **Step 6: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/chat/chat.gateway.ts src/modules/friends/friends.service.ts src/app.ts && git commit -m "feat(chat): linkFriendship/unlinkFriendship em accept/block"
```

---

## Task 20: Side-effect socket no `PATCH /users/me/settings`

**Files:**
- Modify: `geek-social-api/src/modules/users/users.controller.ts` (handler updateSettings)

- [ ] **Step 1: Injetar gateway no controller**

Pra simplificar, em vez de injetar gateway no UsersController (mexe em DI), expor um helper `usersService.updateSettingsWithEffects(userId, patch, gateway)`. Mas mais limpo é injetar `chatGateway` diretamente no `UsersController` via construtor:

Em `users.controller.ts`, mudar construtor:

```ts
  constructor(
    private readonly usersService: UsersService,
    private readonly chatGateway?: import('../chat/chat.gateway.js').ChatGateway,
  ) {}
```

E em `users.routes.ts`, ao construir o controller, passar `options.chatGateway`. Vai precisar receber gateway nas options:

```ts
export async function usersRoutes(app: FastifyInstance, options: { usersService: UsersService; chatGateway?: ChatGateway }) {
  const controller = new UsersController(options.usersService, options.chatGateway)
  ...
}
```

E em `app.ts`, ao registrar `usersRoutes`, passar `chatGateway`. (Ordem: gateway é instanciado depois de routes — pode-se passar via `getter` ou simplesmente fazer routes registrar mais tarde. A solução mais simples: registrar routes depois do gateway. Verificar `app.ts:.../register(usersRoutes)`.)

- [ ] **Step 2: Disparar emits no handler**

Em `updateSettings` no controller:

```ts
  async updateSettings(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const body = updateSettingsSchema.parse(request.body)
    const before = await this.usersService.getMyRawSettings(userId)
    const updated = await this.usersService.updateSettings(userId, body)

    // Effects — somente se a flag mudou
    if (this.chatGateway) {
      if (body.showPresence !== undefined && body.showPresence !== before.showPresence) {
        if (body.showPresence === false) {
          this.chatGateway.emitPresenceUpdate(userId, false, null)
        } else {
          this.chatGateway.emitPresenceUpdate(userId, true, null)
        }
      }
      if (body.showReadReceipts !== undefined && body.showReadReceipts !== before.showReadReceipts) {
        await this.chatGateway.refreshConversationsForUserAndPeers(userId)
      }
    }

    return reply.send({ showPresence: updated.showPresence, showReadReceipts: updated.showReadReceipts })
  }
```

- [ ] **Step 3: Implementar `getMyRawSettings` em `UsersService`**

```ts
  async getMyRawSettings(userId: string): Promise<{ showPresence: boolean; showReadReceipts: boolean }> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new UsersError('USER_NOT_FOUND')
    return { showPresence: user.showPresence, showReadReceipts: user.showReadReceipts }
  }
```

- [ ] **Step 4: Implementar `emitPresenceUpdate` e `refreshConversationsForUserAndPeers` no gateway**

Em `chat.gateway.ts`:

```ts
  emitPresenceUpdate(userId: string, isOnline: boolean, lastSeenAt: Date | null): void {
    this.io.to(`presence:${userId}`).emit('presence:update', {
      userId, isOnline, lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    })
  }

  async refreshConversationsForUserAndPeers(userId: string): Promise<void> {
    const convIds = await this.conversationsService.getConversationIds(userId)
    const userIds = new Set<string>([userId])
    for (const cid of convIds) {
      const members = await this.conversationsService.getConversationMembers(cid)
      members.forEach(m => userIds.add(m.userId))
    }
    this.emitConversationsRefresh(Array.from(userIds))
  }
```

(Os helpers `getConversationIds` e `getConversationMembers` já existem em `ConversationsService`.)

- [ ] **Step 5: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 6: Smoke**

Backend reiniciado. A toggla `showPresence` no curl. B recebe `presence:update` com isOnline=false (mesmo A continuando online). A toggla `showReadReceipts` — B recebe `conversations:refresh` e refaz fetch de conversas.

- [ ] **Step 7: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-api && git add src/modules/users/users.controller.ts src/modules/users/users.routes.ts src/modules/users/users.service.ts src/modules/chat/chat.gateway.ts src/app.ts && git commit -m "feat(users): side-effects socket no PATCH /me/settings"
```

---

## Task 21: Ajuste — `findUserConversations` filtra `isOnline` por amizade + showPresence

**Files:** já feito na Task 11.

- [ ] **Step 1: Verificação dupla**

Confirmar que após Task 18 e 19, `enrichWithBlockInfo` ainda funciona pra DMs sem amizade direta (existe `findExistingDm` apenas entre amigos, mas grupos podem ter membros não-amigos). Para grupos, viewers só veem presence dos membros que são seus amigos com `showPresence=true`.

Esse comportamento já está no Task 11. Smoke test: A e B amigos num grupo onde tem C (não-amigo de A). Ao listar conversa, `participants[C].isOnline` deve ser `false` mesmo se C estiver online.

- [ ] **Step 2: Sem mudanças neste passo se a Task 11 já cobre.**

(Se faltar algum ajuste, este é o lugar pra resolver.)

- [ ] **Step 3: Commit (vazio se nada faltou)**

Se houver alguma correção, commitar; senão pular.

---

## Task 22: Frontend — handler `presence:update` re-confirmado

**Files:**
- Modify: `geek-social-frontend/src/modules/chat/composables/usePresence.ts` (se existir; senão verificar `useChat.ts`)

- [ ] **Step 1: Garantir que UI atualiza com `isOnline`**

O frontend já tem `usePresence`. Verificar que ele:
- Escuta `presence:update` e atualiza o map de online.
- `ConversationItem` usa esse store pra mostrar dot verde via `participant.isOnline`.

Quando A toggla `showPresence=false`, B recebe `presence:update {isOnline: false}` e UI atualiza dot. Sem refresh.

- [ ] **Step 2: Smoke**

Já testado nas Tasks 18 e 20. Não precisa código novo se tudo já está conectado.

- [ ] **Step 3: Commit (vazio se nada faltou)**

---

## Task 23: Frontend — `SettingsView` ganha "Privacidade do chat"

**Files:**
- Modify: `geek-social-frontend/src/modules/auth/views/SettingsView.vue`

- [ ] **Step 1: Importar service**

Em `SettingsView.vue`, no `<script setup>`, adicionar (se não tiver):

```ts
import { Bell, Eye } from 'lucide-vue-next'
```

- [ ] **Step 2: Adicionar reactive state**

Após `passwordForm`:

```ts
const chatPrivacy = reactive({
  showPresence: true,
  showReadReceipts: true,
})
const savingChatPrivacy = ref(false)
const chatPrivacyError = ref('')
const chatPrivacySuccess = ref(false)

onMounted(() => {
  // já existe um onMounted atualizando form de perfil — adicionar aqui também
})
```

Em `onMounted` (linhas 190-196), adicionar:

```ts
  if (user.value) {
    chatPrivacy.showPresence = user.value.showPresence ?? true
    chatPrivacy.showReadReceipts = user.value.showReadReceipts ?? true
  }
```

- [ ] **Step 3: Função de salvar**

```ts
async function saveChatPrivacy(field: 'showPresence' | 'showReadReceipts', next: boolean) {
  savingChatPrivacy.value = true
  chatPrivacyError.value = ''
  chatPrivacySuccess.value = false
  const old = chatPrivacy[field]
  chatPrivacy[field] = next
  try {
    const updated = await usersService.updateSettings({ [field]: next })
    chatPrivacy.showPresence = updated.showPresence
    chatPrivacy.showReadReceipts = updated.showReadReceipts
    if (store.user) {
      store.user.showPresence = updated.showPresence
      store.user.showReadReceipts = updated.showReadReceipts
    }
    chatPrivacySuccess.value = true
    setTimeout(() => { chatPrivacySuccess.value = false }, 2000)
  } catch (err: any) {
    chatPrivacy[field] = old
    chatPrivacyError.value = err.response?.data?.error ?? 'Erro ao atualizar.'
  } finally {
    savingChatPrivacy.value = false
  }
}
```

- [ ] **Step 4: Adicionar card no template**

Antes do card "Sair":

```vue
<!-- Card: Privacidade do chat -->
<div class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated) mb-6">
  <h2 class="text-base font-semibold text-(--color-text-primary) mb-4">Privacidade do chat</h2>
  <div class="flex flex-col gap-4">
    <label class="flex items-start justify-between gap-4 cursor-pointer">
      <div class="flex-1">
        <p class="text-sm text-(--color-text-primary) font-medium">Aparecer online</p>
        <p class="text-xs text-(--color-text-muted)">Se desligado, amigos não veem quando você está online nem a última vez que foi visto.</p>
      </div>
      <input
        type="checkbox"
        class="mt-1 accent-(--color-accent-amber) scale-125"
        :checked="chatPrivacy.showPresence"
        :disabled="savingChatPrivacy"
        @change="(e: Event) => saveChatPrivacy('showPresence', (e.target as HTMLInputElement).checked)"
      />
    </label>
    <label class="flex items-start justify-between gap-4 cursor-pointer">
      <div class="flex-1">
        <p class="text-sm text-(--color-text-primary) font-medium">Mostrar confirmação de leitura</p>
        <p class="text-xs text-(--color-text-muted)">Se desligado, você também não verá quando outros leram suas mensagens.</p>
      </div>
      <input
        type="checkbox"
        class="mt-1 accent-(--color-accent-amber) scale-125"
        :checked="chatPrivacy.showReadReceipts"
        :disabled="savingChatPrivacy"
        @change="(e: Event) => saveChatPrivacy('showReadReceipts', (e.target as HTMLInputElement).checked)"
      />
    </label>
    <p v-if="chatPrivacyError" class="text-sm text-(--color-danger) bg-(--color-danger)/10 rounded-lg px-3 py-2">
      {{ chatPrivacyError }}
    </p>
    <p v-if="chatPrivacySuccess" class="text-sm text-(--color-status-online) bg-(--color-status-online)/10 rounded-lg px-3 py-2">
      Configurações atualizadas.
    </p>
  </div>
</div>
```

- [ ] **Step 5: Typecheck**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 6: Smoke manual**

Backend e frontend rodando. Em A: ir em Settings, desligar "Aparecer online". Em outra aba (B amigo de A), abrir conversa com A — bolinha online some. Ligar de novo — volta. Mesmo teste com "Mostrar confirmação de leitura": ao desligar, checks somem em mensagens próprias e nas mensagens de A na visão de B (recíproco).

- [ ] **Step 7: Commit**

```bash
cd /home/dev/workspace_ssh/geek-social-frontend && git add src/modules/auth/views/SettingsView.vue && git commit -m "feat(settings): adiciona privacidade do chat (showPresence, showReadReceipts)"
```

---

## Task 24: Smoke E2E final + checklist do spec

**Files:** nenhum.

- [ ] **Step 1: Rodar typecheck completo**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
cd /home/dev/workspace_ssh/geek-social-frontend && npx vue-tsc --noEmit
```

Esperado: 0 erros nos dois.

- [ ] **Step 2: Rodar testes do backend**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run
```

Esperado: testes novos (mute, settings, computeSeen) passam. Os 13 testes pré-existentes que falham continuam falhando — não são desta fase.

- [ ] **Step 3: Validar critérios de aceitação do spec**

Checar manualmente cada critério da seção 11 do spec:

- [ ] Migration 0012 aplicada sem erro.
- [ ] Mutar uma DM esconde unread âmbar, vira cinza, e some do contador da sidebar.
- [ ] `SettingsView` salva `showPresence=false` → `ProfileView` de outro amigo deixa de mostrar online/visto.
- [ ] DM com peer com `showReadReceipts=false`: minhas mensagens não mostram checks.
- [ ] Grupo: enviar mensagem, todos os outros membros lerem → check duplo âmbar com tooltip "Visto por todos".
- [ ] Backend: 0 erros TS. Frontend: 0 erros TS.

- [ ] **Step 4: Atualizar memória**

Atualizar `/home/dev/.claude/projects/-home-dev-workspace-ssh/memory/project_geek_social.md` adicionando uma seção "Sessão 2026-04-XX — Privacidade do chat" descrevendo o que ficou feito.

- [ ] **Step 5: Commit final / merge**

Se o usuário quiser, criar uma tag/release. Caso contrário, terminar aqui.

---

## Spec Coverage Self-Check

| Spec section | Task |
|---|---|
| 3 — Schema (migration 0012) | Task 1 |
| 4.1 — Backend mute (endpoints, service, repo) | Tasks 3, 4, 5 |
| 4.2 — Frontend mute (header, ConversationItem, sidebar) | Tasks 6, 7 |
| 4.3 — Notificações (forward-looking) | (sem implementação ativa — comentado) |
| 5.2 — Refator presence rooms | Tasks 17, 18 |
| 5.2 — Convite/aceite/bloqueio (linkFriendship) | Task 19 |
| 5.3 — Filtro REST (`getProfile`, `findUserConversations`) | Tasks 10, 11 |
| 5.4 — Frontend SettingsView showPresence | Task 23 |
| 6 — Read receipts (computeSeen, enrich, socket) | Tasks 12, 13, 14, 15, 16 |
| 6.5 — UI checks | Task 16 |
| 6.5 — SettingsView showReadReceipts | Task 23 |
| 7 — PATCH /users/me/settings + side-effects | Tasks 8, 9, 20 |
| Critérios de aceitação | Task 24 |
