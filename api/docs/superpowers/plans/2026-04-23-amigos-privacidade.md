# Sistema de Amigos e Privacidade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar amizades mútuas, bloqueio de usuários e visibilidade `friends_only` em coleções e perfis.

**Architecture:** Módulo `friends` novo (repositório + service + controller + routes); `FriendsRepository` injetado em `UsersService`, `CollectionsService` e `ItemsService` para verificação de amizade e bloqueio. Amizades em tabela única `friendships` com status `pending/accepted`; bloqueios em `user_blocks` separado.

**Tech Stack:** Node.js, TypeScript, Fastify 5, Drizzle ORM, PostgreSQL 17, Vitest

---

## Estrutura de Arquivos

**Novos:**
- `src/shared/contracts/friends.repository.contract.ts`
- `src/modules/friends/friends.schema.ts`
- `src/modules/friends/friends.repository.ts`
- `src/modules/friends/friends.service.ts`
- `src/modules/friends/friends.controller.ts`
- `src/modules/friends/friends.routes.ts`
- `tests/modules/friends/friends.service.test.ts`

**Modificados:**
- `src/shared/infra/database/schema.ts`
- `src/shared/infra/database/migrations/` (auto-gerado)
- `src/shared/contracts/collection.repository.contract.ts`
- `src/shared/middleware/authenticate.ts`
- `src/modules/collections/collections.schema.ts`
- `src/modules/collections/collections.repository.ts`
- `src/modules/collections/collections.service.ts`
- `src/modules/collections/collections.controller.ts`
- `src/modules/collections/collections.routes.ts`
- `src/modules/items/items.service.ts`
- `src/modules/items/items.controller.ts`
- `src/modules/items/items.routes.ts`
- `src/modules/users/users.service.ts`
- `src/app.ts`
- `tests/modules/users/users.service.test.ts`
- `tests/modules/collections/collections.service.test.ts`
- `tests/modules/items/items.service.test.ts`

---

### Task 1: Schema + Migration

**Files:**
- Modify: `src/shared/infra/database/schema.ts`
- Create (auto): nova migration SQL via drizzle-kit

- [ ] **Step 1: Atualizar schema.ts**

Substituir o conteúdo completo de `src/shared/infra/database/schema.ts`:

```typescript
import {
  pgTable, pgEnum, uuid, varchar, text,
  boolean, timestamp, integer, smallint, jsonb, uniqueIndex,
} from 'drizzle-orm/pg-core'

export const privacyEnum = pgEnum('privacy', ['public', 'friends_only', 'private'])
export const collectionTypeEnum = pgEnum('collection_type', ['games', 'books', 'cardgames', 'boardgames', 'custom'])
export const collectionVisibilityEnum = pgEnum('collection_visibility', ['public', 'private', 'friends_only'])
export const fieldTypeEnum = pgEnum('field_type', ['text', 'number', 'date', 'boolean', 'select'])
export const friendshipStatusEnum = pgEnum('friendship_status', ['pending', 'accepted'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash'),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  bio: text('bio'),
  avatarUrl: varchar('avatar_url'),
  coverUrl: varchar('cover_url'),
  privacy: privacyEnum('privacy').default('public').notNull(),
  keycloakId: varchar('keycloak_id').unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const fieldDefinitions = pgTable('field_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  fieldKey: varchar('field_key', { length: 50 }).notNull(),
  fieldType: fieldTypeEnum('field_type').notNull(),
  collectionType: collectionTypeEnum('collection_type'),
  selectOptions: jsonb('select_options').$type<string[]>(),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const collections = pgTable('collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  iconUrl: varchar('icon_url'),
  coverUrl: varchar('cover_url'),
  type: collectionTypeEnum('type').notNull(),
  visibility: collectionVisibilityEnum('visibility').default('public').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const collectionFieldSchema = pgTable('collection_field_schema', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  fieldDefinitionId: uuid('field_definition_id').notNull().references(() => fieldDefinitions.id),
  isRequired: boolean('is_required').default(false).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
})

export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  coverUrl: varchar('cover_url'),
  fields: jsonb('fields').$type<Record<string, unknown>>().default({}).notNull(),
  rating: smallint('rating'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const friendships = pgTable('friendships', {
  id: uuid('id').defaultRandom().primaryKey(),
  requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: uuid('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: friendshipStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueRequest: uniqueIndex('friendships_requester_receiver_unique').on(table.requesterId, table.receiverId),
}))

export const userBlocks = pgTable('user_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueBlock: uniqueIndex('user_blocks_blocker_blocked_unique').on(table.blockerId, table.blockedId),
}))
```

- [ ] **Step 2: Gerar a migration**

```bash
cd /home/dev/workspace_ssh/geek-social-api && DATABASE_URL=postgres://dev:dev@localhost:5432/geek_social npx drizzle-kit generate
```

Expected: novo arquivo SQL criado em `src/shared/infra/database/migrations/` (ex: `0002_*.sql`).

- [ ] **Step 3: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/shared/infra/database/schema.ts src/shared/infra/database/migrations/
git commit -m "feat: schema friendships, user_blocks e friends_only nas coleções"
```

---

### Task 2: Contrato do repositório de amizades

**Files:**
- Create: `src/shared/contracts/friends.repository.contract.ts`

- [ ] **Step 1: Criar o arquivo de contrato**

```typescript
// src/shared/contracts/friends.repository.contract.ts

export type FriendshipStatus = 'pending' | 'accepted'

export type Friendship = {
  id: string
  requesterId: string
  receiverId: string
  status: FriendshipStatus
  createdAt: Date
  updatedAt: Date
}

export type Block = {
  id: string
  blockerId: string
  blockedId: string
  createdAt: Date
}

export interface IFriendsRepository {
  createRequest(requesterId: string, receiverId: string): Promise<Friendship>
  findRequestById(id: string): Promise<Friendship | null>
  findExistingRelation(userId1: string, userId2: string): Promise<Friendship | null>
  findReceivedRequests(receiverId: string): Promise<Friendship[]>
  findSentRequests(requesterId: string): Promise<Friendship[]>
  updateRequestStatus(id: string, status: FriendshipStatus): Promise<Friendship>
  findFriendIds(userId: string): Promise<string[]>
  areFriends(userId: string, otherUserId: string): Promise<boolean>
  removeFriendshipBetween(userId1: string, userId2: string): Promise<void>
  createBlock(blockerId: string, blockedId: string): Promise<void>
  deleteBlock(blockerId: string, blockedId: string): Promise<void>
  isBlockedBy(blockerId: string, blockedId: string): Promise<boolean>
  isBlockedEitherDirection(userId1: string, userId2: string): Promise<boolean>
  findBlocksByBlocker(blockerId: string): Promise<Block[]>
}
```

- [ ] **Step 2: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/contracts/friends.repository.contract.ts
git commit -m "feat: contrato IFriendsRepository"
```

---

### Task 3: Repositório de amizades

**Files:**
- Create: `src/modules/friends/friends.repository.ts`

- [ ] **Step 1: Criar o repositório**

```typescript
// src/modules/friends/friends.repository.ts
import { eq, and, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { friendships, userBlocks } from '../../shared/infra/database/schema.js'
import type {
  IFriendsRepository,
  Friendship,
  FriendshipStatus,
  Block,
} from '../../shared/contracts/friends.repository.contract.js'

export class FriendsRepository implements IFriendsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createRequest(requesterId: string, receiverId: string): Promise<Friendship> {
    const result = await this.db.insert(friendships)
      .values({ requesterId, receiverId, status: 'pending' })
      .returning()
    return result[0] as Friendship
  }

  async findRequestById(id: string): Promise<Friendship | null> {
    const result = await this.db.select().from(friendships).where(eq(friendships.id, id)).limit(1)
    return (result[0] as Friendship) ?? null
  }

  async findExistingRelation(userId1: string, userId2: string): Promise<Friendship | null> {
    const result = await this.db.select().from(friendships)
      .where(or(
        and(eq(friendships.requesterId, userId1), eq(friendships.receiverId, userId2)),
        and(eq(friendships.requesterId, userId2), eq(friendships.receiverId, userId1)),
      ))
      .limit(1)
    return (result[0] as Friendship) ?? null
  }

  async findReceivedRequests(receiverId: string): Promise<Friendship[]> {
    return this.db.select().from(friendships)
      .where(and(eq(friendships.receiverId, receiverId), eq(friendships.status, 'pending'))) as Promise<Friendship[]>
  }

  async findSentRequests(requesterId: string): Promise<Friendship[]> {
    return this.db.select().from(friendships)
      .where(and(eq(friendships.requesterId, requesterId), eq(friendships.status, 'pending'))) as Promise<Friendship[]>
  }

  async updateRequestStatus(id: string, status: FriendshipStatus): Promise<Friendship> {
    const result = await this.db.update(friendships)
      .set({ status, updatedAt: new Date() })
      .where(eq(friendships.id, id))
      .returning()
    return result[0] as Friendship
  }

  async findFriendIds(userId: string): Promise<string[]> {
    const rows = await this.db.select().from(friendships)
      .where(and(
        or(eq(friendships.requesterId, userId), eq(friendships.receiverId, userId)),
        eq(friendships.status, 'accepted'),
      ))
    return rows.map(row => row.requesterId === userId ? row.receiverId : row.requesterId)
  }

  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const result = await this.db.select().from(friendships)
      .where(and(
        or(
          and(eq(friendships.requesterId, userId), eq(friendships.receiverId, otherUserId)),
          and(eq(friendships.requesterId, otherUserId), eq(friendships.receiverId, userId)),
        ),
        eq(friendships.status, 'accepted'),
      ))
      .limit(1)
    return result.length > 0
  }

  async removeFriendshipBetween(userId1: string, userId2: string): Promise<void> {
    await this.db.delete(friendships)
      .where(or(
        and(eq(friendships.requesterId, userId1), eq(friendships.receiverId, userId2)),
        and(eq(friendships.requesterId, userId2), eq(friendships.receiverId, userId1)),
      ))
  }

  async createBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.db.insert(userBlocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing()
  }

  async deleteBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.db.delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)))
  }

  async isBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await this.db.select().from(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)))
      .limit(1)
    return result.length > 0
  }

  async isBlockedEitherDirection(userId1: string, userId2: string): Promise<boolean> {
    const result = await this.db.select().from(userBlocks)
      .where(or(
        and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedId, userId2)),
        and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedId, userId1)),
      ))
      .limit(1)
    return result.length > 0
  }

  async findBlocksByBlocker(blockerId: string): Promise<Block[]> {
    return this.db.select().from(userBlocks)
      .where(eq(userBlocks.blockerId, blockerId)) as Promise<Block[]>
  }
}
```

- [ ] **Step 2: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/modules/friends/friends.repository.ts
git commit -m "feat: FriendsRepository — amizades e bloqueios com Drizzle"
```

---

### Task 4: FriendsService com TDD

**Files:**
- Create: `tests/modules/friends/friends.service.test.ts`
- Create: `src/modules/friends/friends.service.ts`

- [ ] **Step 1: Escrever os testes (RED)**

```typescript
// tests/modules/friends/friends.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FriendsService } from '../../../src/modules/friends/friends.service.js'
import type { IFriendsRepository, Friendship, Block } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockFriendsRepository(): IFriendsRepository {
  return {
    createRequest: vi.fn(),
    findRequestById: vi.fn(),
    findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(),
    findSentRequests: vi.fn(),
    updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(),
    areFriends: vi.fn(),
    removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(),
    deleteBlock: vi.fn(),
    isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(),
    findBlocksByBlocker: vi.fn(),
  }
}

function createMockFriendship(overrides: Partial<Friendship> = {}): Friendship {
  return {
    id: 'friendship-uuid-1',
    requesterId: 'user-a',
    receiverId: 'user-b',
    status: 'pending',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('FriendsService', () => {
  let repo: ReturnType<typeof createMockFriendsRepository>
  let service: FriendsService

  beforeEach(() => {
    repo = createMockFriendsRepository()
    service = new FriendsService(repo)
    vi.clearAllMocks()
  })

  describe('sendRequest', () => {
    it('deve enviar pedido de amizade com sucesso', async () => {
      vi.mocked(repo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(repo.findExistingRelation).mockResolvedValue(null)
      vi.mocked(repo.createRequest).mockResolvedValue(createMockFriendship())

      const result = await service.sendRequest('user-a', 'user-b')

      expect(repo.createRequest).toHaveBeenCalledWith('user-a', 'user-b')
      expect(result.status).toBe('pending')
    })

    it('deve lançar SELF_REQUEST ao tentar adicionar a si mesmo', async () => {
      await expect(service.sendRequest('user-a', 'user-a'))
        .rejects.toThrow('SELF_REQUEST')
      expect(repo.createRequest).not.toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND se um dos dois bloqueou o outro', async () => {
      vi.mocked(repo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.sendRequest('user-a', 'user-b'))
        .rejects.toThrow('NOT_FOUND')
      expect(repo.createRequest).not.toHaveBeenCalled()
    })

    it('deve lançar ALREADY_EXISTS se já existe relação em qualquer direção', async () => {
      vi.mocked(repo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(repo.findExistingRelation).mockResolvedValue(createMockFriendship())

      await expect(service.sendRequest('user-a', 'user-b'))
        .rejects.toThrow('ALREADY_EXISTS')
      expect(repo.createRequest).not.toHaveBeenCalled()
    })
  })

  describe('acceptRequest', () => {
    it('deve aceitar pedido se o receiver for o usuário autenticado', async () => {
      vi.mocked(repo.findRequestById).mockResolvedValue(createMockFriendship({ receiverId: 'user-b', status: 'pending' }))
      vi.mocked(repo.updateRequestStatus).mockResolvedValue(createMockFriendship({ receiverId: 'user-b', status: 'accepted' }))

      const result = await service.acceptRequest('user-b', 'friendship-uuid-1')

      expect(repo.updateRequestStatus).toHaveBeenCalledWith('friendship-uuid-1', 'accepted')
      expect(result.status).toBe('accepted')
    })

    it('deve lançar NOT_FOUND se o pedido não existe', async () => {
      vi.mocked(repo.findRequestById).mockResolvedValue(null)

      await expect(service.acceptRequest('user-b', 'nao-existe'))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND se o usuário não é o receiver', async () => {
      vi.mocked(repo.findRequestById).mockResolvedValue(createMockFriendship({ receiverId: 'user-b' }))

      await expect(service.acceptRequest('user-c', 'friendship-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_PENDING se o pedido já foi aceito', async () => {
      vi.mocked(repo.findRequestById).mockResolvedValue(createMockFriendship({ receiverId: 'user-b', status: 'accepted' }))

      await expect(service.acceptRequest('user-b', 'friendship-uuid-1'))
        .rejects.toThrow('NOT_PENDING')
    })
  })

  describe('rejectRequest', () => {
    it('deve recusar pedido se o receiver for o usuário autenticado', async () => {
      vi.mocked(repo.findRequestById).mockResolvedValue(createMockFriendship({ receiverId: 'user-b', status: 'pending' }))
      vi.mocked(repo.removeFriendshipBetween).mockResolvedValue()

      await service.rejectRequest('user-b', 'friendship-uuid-1')

      expect(repo.removeFriendshipBetween).toHaveBeenCalledWith('user-a', 'user-b')
    })

    it('deve lançar NOT_FOUND se o usuário não é o receiver', async () => {
      vi.mocked(repo.findRequestById).mockResolvedValue(createMockFriendship({ receiverId: 'user-b' }))

      await expect(service.rejectRequest('user-c', 'friendship-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND se o pedido não existe', async () => {
      vi.mocked(repo.findRequestById).mockResolvedValue(null)

      await expect(service.rejectRequest('user-b', 'nao-existe'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('removeFriend', () => {
    it('deve remover amizade se forem amigos', async () => {
      vi.mocked(repo.areFriends).mockResolvedValue(true)
      vi.mocked(repo.removeFriendshipBetween).mockResolvedValue()

      await service.removeFriend('user-a', 'user-b')

      expect(repo.removeFriendshipBetween).toHaveBeenCalledWith('user-a', 'user-b')
    })

    it('deve lançar NOT_FOUND se não forem amigos', async () => {
      vi.mocked(repo.areFriends).mockResolvedValue(false)

      await expect(service.removeFriend('user-a', 'user-b'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('block', () => {
    it('deve bloquear usuário e remover amizade existente', async () => {
      vi.mocked(repo.removeFriendshipBetween).mockResolvedValue()
      vi.mocked(repo.createBlock).mockResolvedValue()

      await service.block('user-a', 'user-b')

      expect(repo.removeFriendshipBetween).toHaveBeenCalledWith('user-a', 'user-b')
      expect(repo.createBlock).toHaveBeenCalledWith('user-a', 'user-b')
    })

    it('deve lançar SELF_BLOCK ao tentar bloquear a si mesmo', async () => {
      await expect(service.block('user-a', 'user-a'))
        .rejects.toThrow('SELF_BLOCK')
      expect(repo.createBlock).not.toHaveBeenCalled()
    })
  })

  describe('unblock', () => {
    it('deve desbloquear usuário bloqueado', async () => {
      vi.mocked(repo.isBlockedBy).mockResolvedValue(true)
      vi.mocked(repo.deleteBlock).mockResolvedValue()

      await service.unblock('user-a', 'user-b')

      expect(repo.deleteBlock).toHaveBeenCalledWith('user-a', 'user-b')
    })

    it('deve lançar NOT_FOUND se o usuário não estava bloqueado', async () => {
      vi.mocked(repo.isBlockedBy).mockResolvedValue(false)

      await expect(service.unblock('user-a', 'user-b'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('listFriends', () => {
    it('deve retornar lista de IDs dos amigos', async () => {
      vi.mocked(repo.findFriendIds).mockResolvedValue(['user-b', 'user-c'])

      const result = await service.listFriends('user-a')

      expect(result).toEqual(['user-b', 'user-c'])
    })
  })

  describe('listReceivedRequests', () => {
    it('deve retornar pedidos recebidos pendentes', async () => {
      vi.mocked(repo.findReceivedRequests).mockResolvedValue([createMockFriendship({ receiverId: 'user-a' })])

      const result = await service.listReceivedRequests('user-a')

      expect(result).toHaveLength(1)
      expect(result[0].receiverId).toBe('user-a')
    })
  })

  describe('listSentRequests', () => {
    it('deve retornar pedidos enviados pendentes', async () => {
      vi.mocked(repo.findSentRequests).mockResolvedValue([createMockFriendship({ requesterId: 'user-a' })])

      const result = await service.listSentRequests('user-a')

      expect(result).toHaveLength(1)
      expect(result[0].requesterId).toBe('user-a')
    })
  })

  describe('listBlocks', () => {
    it('deve retornar lista de usuários bloqueados', async () => {
      const blocks: Block[] = [{ id: 'block-1', blockerId: 'user-a', blockedId: 'user-b', createdAt: new Date() }]
      vi.mocked(repo.findBlocksByBlocker).mockResolvedValue(blocks)

      const result = await service.listBlocks('user-a')

      expect(result).toHaveLength(1)
      expect(result[0].blockedId).toBe('user-b')
    })
  })
})
```

- [ ] **Step 2: Verificar que os testes falham**

```bash
npx vitest run tests/modules/friends/friends.service.test.ts
```

Expected: FAIL com "Cannot find module"

- [ ] **Step 3: Criar FriendsService**

```typescript
// src/modules/friends/friends.service.ts
import type { IFriendsRepository, Friendship, Block } from '../../shared/contracts/friends.repository.contract.js'

export class FriendsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'FriendsError'
  }
}

export class FriendsService {
  constructor(private readonly repo: IFriendsRepository) {}

  async sendRequest(requesterId: string, receiverId: string): Promise<Friendship> {
    if (requesterId === receiverId) throw new FriendsError('SELF_REQUEST')
    const blocked = await this.repo.isBlockedEitherDirection(requesterId, receiverId)
    if (blocked) throw new FriendsError('NOT_FOUND')
    const existing = await this.repo.findExistingRelation(requesterId, receiverId)
    if (existing) throw new FriendsError('ALREADY_EXISTS')
    return this.repo.createRequest(requesterId, receiverId)
  }

  async acceptRequest(userId: string, requestId: string): Promise<Friendship> {
    const request = await this.repo.findRequestById(requestId)
    if (!request || request.receiverId !== userId) throw new FriendsError('NOT_FOUND')
    if (request.status !== 'pending') throw new FriendsError('NOT_PENDING')
    return this.repo.updateRequestStatus(requestId, 'accepted')
  }

  async rejectRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.repo.findRequestById(requestId)
    if (!request || request.receiverId !== userId) throw new FriendsError('NOT_FOUND')
    if (request.status !== 'pending') throw new FriendsError('NOT_PENDING')
    await this.repo.removeFriendshipBetween(request.requesterId, request.receiverId)
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    const areFriends = await this.repo.areFriends(userId, friendId)
    if (!areFriends) throw new FriendsError('NOT_FOUND')
    await this.repo.removeFriendshipBetween(userId, friendId)
  }

  async listFriends(userId: string): Promise<string[]> {
    return this.repo.findFriendIds(userId)
  }

  async listReceivedRequests(userId: string): Promise<Friendship[]> {
    return this.repo.findReceivedRequests(userId)
  }

  async listSentRequests(userId: string): Promise<Friendship[]> {
    return this.repo.findSentRequests(userId)
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new FriendsError('SELF_BLOCK')
    await this.repo.removeFriendshipBetween(blockerId, blockedId)
    await this.repo.createBlock(blockerId, blockedId)
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    const isBlocked = await this.repo.isBlockedBy(blockerId, blockedId)
    if (!isBlocked) throw new FriendsError('NOT_FOUND')
    await this.repo.deleteBlock(blockerId, blockedId)
  }

  async listBlocks(blockerId: string): Promise<Block[]> {
    return this.repo.findBlocksByBlocker(blockerId)
  }

  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    return this.repo.areFriends(userId, otherUserId)
  }

  async isBlockedBy(potentialBlockedId: string, blockerId: string): Promise<boolean> {
    return this.repo.isBlockedBy(blockerId, potentialBlockedId)
  }
}
```

- [ ] **Step 4: Verificar que os testes passam**

```bash
npx vitest run tests/modules/friends/friends.service.test.ts
```

Expected: 14 testes passando, 0 falhas.

- [ ] **Step 5: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add tests/modules/friends/friends.service.test.ts src/modules/friends/friends.service.ts
git commit -m "feat: FriendsService com TDD — pedidos, amizades e bloqueios"
```

---

### Task 5: Friends routes + controller

**Files:**
- Create: `src/modules/friends/friends.schema.ts`
- Create: `src/modules/friends/friends.controller.ts`
- Create: `src/modules/friends/friends.routes.ts`

- [ ] **Step 1: Criar o schema Zod**

```typescript
// src/modules/friends/friends.schema.ts
import { z } from 'zod'

export const sendFriendRequestSchema = z.object({
  receiverId: z.string().uuid(),
})

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>
```

- [ ] **Step 2: Criar o controller**

```typescript
// src/modules/friends/friends.controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FriendsService } from './friends.service.js'
import { FriendsError } from './friends.service.js'
import type { SendFriendRequestInput } from './friends.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class FriendsController {
  constructor(private readonly service: FriendsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof FriendsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Não encontrado' })
      if (error.code === 'ALREADY_EXISTS') return reply.status(409).send({ error: 'Já existe uma relação entre os usuários' })
      if (error.code === 'SELF_REQUEST') return reply.status(400).send({ error: 'Não é possível adicionar a si mesmo' })
      if (error.code === 'SELF_BLOCK') return reply.status(400).send({ error: 'Não é possível bloquear a si mesmo' })
      if (error.code === 'NOT_PENDING') return reply.status(409).send({ error: 'Pedido não está pendente' })
    }
    throw error
  }

  async sendRequest(request: FastifyRequest<{ Body: SendFriendRequestInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const friendship = await this.service.sendRequest(userId, request.body.receiverId)
      return reply.status(201).send(friendship)
    } catch (error) { return this.handleError(error, reply) }
  }

  async listReceivedRequests(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const requests = await this.service.listReceivedRequests(userId)
    return reply.send(requests)
  }

  async listSentRequests(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const requests = await this.service.listSentRequests(userId)
    return reply.send(requests)
  }

  async acceptRequest(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const friendship = await this.service.acceptRequest(userId, request.params.id)
      return reply.send(friendship)
    } catch (error) { return this.handleError(error, reply) }
  }

  async rejectRequest(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.rejectRequest(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async listFriends(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const friendIds = await this.service.listFriends(userId)
    return reply.send({ friendIds })
  }

  async removeFriend(request: FastifyRequest<{ Params: { friendId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.removeFriend(userId, request.params.friendId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async blockUser(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.block(userId, request.params.userId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async unblockUser(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.unblock(userId, request.params.userId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async listBlocks(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const blocks = await this.service.listBlocks(userId)
    return reply.send(blocks)
  }
}
```

- [ ] **Step 3: Criar as rotas**

```typescript
// src/modules/friends/friends.routes.ts
import type { FastifyInstance } from 'fastify'
import type { FriendsService } from './friends.service.js'
import { FriendsController } from './friends.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'

export async function friendsRoutes(
  app: FastifyInstance,
  options: { friendsService: FriendsService },
) {
  const controller = new FriendsController(options.friendsService)

  app.post('/requests', { preHandler: [authenticate], handler: controller.sendRequest.bind(controller) })
  app.get('/requests/received', { preHandler: [authenticate], handler: controller.listReceivedRequests.bind(controller) })
  app.get('/requests/sent', { preHandler: [authenticate], handler: controller.listSentRequests.bind(controller) })
  app.post('/requests/:id/accept', { preHandler: [authenticate], handler: controller.acceptRequest.bind(controller) })
  app.post('/requests/:id/reject', { preHandler: [authenticate], handler: controller.rejectRequest.bind(controller) })
  app.get('/', { preHandler: [authenticate], handler: controller.listFriends.bind(controller) })
  app.delete('/:friendId', { preHandler: [authenticate], handler: controller.removeFriend.bind(controller) })
}

export async function blocksRoutes(
  app: FastifyInstance,
  options: { friendsService: FriendsService },
) {
  const controller = new FriendsController(options.friendsService)

  app.post('/:userId', { preHandler: [authenticate], handler: controller.blockUser.bind(controller) })
  app.delete('/:userId', { preHandler: [authenticate], handler: controller.unblockUser.bind(controller) })
  app.get('/', { preHandler: [authenticate], handler: controller.listBlocks.bind(controller) })
}
```

- [ ] **Step 4: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/friends/
git commit -m "feat: rotas e controller de amizades e bloqueios"
```

---

### Task 6: Atualizar CollectionVisibility + repositório

**Files:**
- Modify: `src/shared/contracts/collection.repository.contract.ts`
- Modify: `src/modules/collections/collections.repository.ts`
- Modify: `src/modules/collections/collections.schema.ts`

- [ ] **Step 1: Atualizar o contrato de coleções**

Substituir o conteúdo completo de `src/shared/contracts/collection.repository.contract.ts`:

```typescript
// src/shared/contracts/collection.repository.contract.ts
import type { CollectionType, FieldDefinition } from './field-definition.repository.contract.js'

export type CollectionVisibility = 'public' | 'private' | 'friends_only'

export type Collection = {
  id: string
  userId: string
  name: string
  description: string | null
  iconUrl: string | null
  coverUrl: string | null
  type: CollectionType
  visibility: CollectionVisibility
  createdAt: Date
  updatedAt: Date
}

export type CollectionSchemaEntry = {
  id: string
  fieldDefinition: FieldDefinition
  isRequired: boolean
  displayOrder: number
}

export type CollectionWithSchema = Collection & {
  fieldSchema: CollectionSchemaEntry[]
}

export type CreateCollectionData = {
  userId: string
  name: string
  description?: string
  type: CollectionType
  visibility?: CollectionVisibility
}

export type UpdateCollectionData = {
  name?: string
  description?: string
  visibility?: CollectionVisibility
  iconUrl?: string | null
  coverUrl?: string | null
}

export type SchemaEntryData = {
  fieldDefinitionId: string
  isRequired: boolean
  displayOrder: number
}

export interface ICollectionRepository {
  create(data: CreateCollectionData): Promise<Collection>
  findById(id: string): Promise<CollectionWithSchema | null>
  findByUserId(userId: string, query?: string): Promise<Collection[]>
  findPublicByUserId(userId: string, visibilities: CollectionVisibility[]): Promise<Collection[]>
  update(id: string, data: UpdateCollectionData): Promise<Collection>
  delete(id: string): Promise<void>
  addFieldsToSchema(collectionId: string, fields: SchemaEntryData[]): Promise<void>
  getFieldSchema(collectionId: string): Promise<CollectionSchemaEntry[]>
}
```

- [ ] **Step 2: Atualizar o repositório de coleções**

Em `src/modules/collections/collections.repository.ts`:

1. Adicionar `inArray` nos imports do drizzle:
```typescript
import { eq, and, ilike, asc, inArray } from 'drizzle-orm'
```

2. Adicionar `CollectionVisibility` nos imports do contrato:
```typescript
import type {
  ICollectionRepository,
  Collection,
  CollectionWithSchema,
  CollectionSchemaEntry,
  CreateCollectionData,
  UpdateCollectionData,
  SchemaEntryData,
  CollectionVisibility,
} from '../../shared/contracts/collection.repository.contract.js'
```

3. Substituir o método `findPublicByUserId` inteiro:
```typescript
async findPublicByUserId(userId: string, visibilities: CollectionVisibility[]): Promise<Collection[]> {
  if (visibilities.length === 0) return []
  return this.db.select().from(collections)
    .where(and(
      eq(collections.userId, userId),
      inArray(collections.visibility, visibilities),
    )) as Promise<Collection[]>
}
```

- [ ] **Step 3: Atualizar o schema Zod de coleções**

Substituir o conteúdo de `src/modules/collections/collections.schema.ts`:

```typescript
// src/modules/collections/collections.schema.ts
import { z } from 'zod'

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['games', 'books', 'cardgames', 'boardgames', 'custom']),
  visibility: z.enum(['public', 'private', 'friends_only']).default('public'),
  fieldDefinitionIds: z.array(z.string().uuid()).optional(),
})

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private', 'friends_only']).optional(),
})

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>
```

- [ ] **Step 4: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: erros de TypeScript sobre `findPublicByUserId` e `getPublicCollections` chamados com assinatura antiga — serão corrigidos nas Tasks 7 e 8.

- [ ] **Step 5: Commit**

```bash
git add src/shared/contracts/collection.repository.contract.ts src/modules/collections/collections.repository.ts src/modules/collections/collections.schema.ts
git commit -m "feat: friends_only no enum de visibilidade de coleções e repositório"
```

---

### Task 7: Atualizar UsersService para friends_only real (TDD)

**Files:**
- Modify: `src/shared/middleware/authenticate.ts`
- Modify: `tests/modules/users/users.service.test.ts`
- Modify: `src/modules/users/users.service.ts`

- [ ] **Step 1: Adicionar optionalAuthenticate ao middleware**

Substituir o conteúdo de `src/shared/middleware/authenticate.ts`:

```typescript
// src/shared/middleware/authenticate.ts
import type { FastifyRequest, FastifyReply } from 'fastify'

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Não autorizado' })
  }
}

export async function optionalAuthenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    // Não autenticado — válido para rotas públicas
  }
}
```

- [ ] **Step 2: Atualizar o teste de UsersService (RED)**

Substituir o conteúdo completo de `tests/modules/users/users.service.test.ts`:

```typescript
// tests/modules/users/users.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-webp')),
  })),
}))

import { UsersService } from '../../../src/modules/users/users.service.js'
import { createMockStorageService, createMockUser } from '../../helpers/mock-repositories.js'
import type { UsersRepository } from '../../../src/modules/users/users.repository.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockFriendsRepository(): IFriendsRepository {
  return {
    createRequest: vi.fn(),
    findRequestById: vi.fn(),
    findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(),
    findSentRequests: vi.fn(),
    updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(),
    areFriends: vi.fn(),
    removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(),
    deleteBlock: vi.fn(),
    isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(),
    findBlocksByBlocker: vi.fn(),
  }
}

describe('UsersService', () => {
  let storageService: ReturnType<typeof createMockStorageService>
  let usersRepository: { findById: ReturnType<typeof vi.fn>; updateProfile: ReturnType<typeof vi.fn> }
  let friendsRepository: ReturnType<typeof createMockFriendsRepository>
  let usersService: UsersService

  beforeEach(() => {
    storageService = createMockStorageService()
    usersRepository = { findById: vi.fn(), updateProfile: vi.fn() }
    friendsRepository = createMockFriendsRepository()
    usersService = new UsersService(usersRepository as unknown as UsersRepository, storageService, friendsRepository)
    vi.clearAllMocks()
  })

  describe('getProfile', () => {
    it('deve retornar o perfil público completo', async () => {
      const user = createMockUser({ privacy: 'public' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(false)

      const profile = await usersService.getProfile(user.id, null)

      expect(profile).toMatchObject({ id: user.id, displayName: user.displayName })
      expect(profile).toHaveProperty('bio')
    })

    it('deve retornar apenas nome e avatar para perfil friends_only (visitante anônimo)', async () => {
      const user = createMockUser({ privacy: 'friends_only', bio: 'minha bio' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)

      const profile = await usersService.getProfile(user.id, null)

      expect(profile.displayName).toBe(user.displayName)
      expect((profile as any).bio).toBeUndefined()
    })

    it('deve retornar perfil completo para friends_only quando viewer é amigo', async () => {
      const user = createMockUser({ privacy: 'friends_only', bio: 'minha bio' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepository.areFriends).mockResolvedValue(true)

      const profile = await usersService.getProfile(user.id, 'viewer-id')

      expect((profile as any).bio).toBe('minha bio')
    })

    it('deve retornar apenas nome e avatar para friends_only quando viewer não é amigo', async () => {
      const user = createMockUser({ privacy: 'friends_only', bio: 'minha bio' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepository.areFriends).mockResolvedValue(false)

      const profile = await usersService.getProfile(user.id, 'viewer-id')

      expect((profile as any).bio).toBeUndefined()
    })

    it('deve lançar USER_NOT_FOUND para perfil private (visitante anônimo)', async () => {
      const user = createMockUser({ privacy: 'private' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)

      await expect(usersService.getProfile(user.id, null))
        .rejects.toThrow('USER_NOT_FOUND')
    })

    it('deve lançar USER_NOT_FOUND se usuário não existir', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(null)

      await expect(usersService.getProfile('nao-existe', null))
        .rejects.toThrow('USER_NOT_FOUND')
    })

    it('dono do perfil sempre vê tudo mesmo com privacy private', async () => {
      const user = createMockUser({ privacy: 'private', bio: 'bio secreta' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)

      const profile = await usersService.getProfile(user.id, user.id)

      expect((profile as any).bio).toBe('bio secreta')
    })

    it('deve lançar USER_NOT_FOUND se o viewer foi bloqueado pelo dono do perfil', async () => {
      const user = createMockUser({ privacy: 'public' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(true)

      await expect(usersService.getProfile(user.id, 'viewer-id'))
        .rejects.toThrow('USER_NOT_FOUND')
    })
  })

  describe('uploadAvatar', () => {
    it('deve fazer upload, atualizar URL e retornar usuário atualizado', async () => {
      const user = createMockUser()
      const updatedUser = createMockUser({ avatarUrl: 'https://s3.amazonaws.com/bucket/avatars/user-uuid-1234/avatar.webp' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(usersRepository.updateProfile).mockResolvedValue(updatedUser)

      const result = await usersService.uploadAvatar(user.id, Buffer.from('fake-image-data'), 'image/jpeg')

      expect(storageService.upload).toHaveBeenCalledWith(
        `avatars/${user.id}/avatar.webp`,
        expect.any(Buffer),
        'image/webp',
      )
      expect(result.avatarUrl).toContain('avatar.webp')
    })
  })

  describe('uploadCover', () => {
    it('deve fazer upload da capa e retornar usuário atualizado', async () => {
      const user = createMockUser()
      const updatedUser = createMockUser({ coverUrl: 'https://s3.amazonaws.com/bucket/covers/user-uuid-1234/cover.webp' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(usersRepository.updateProfile).mockResolvedValue(updatedUser)

      const result = await usersService.uploadCover(user.id, Buffer.from('fake-image-data'), 'image/jpeg')

      expect(storageService.upload).toHaveBeenCalledWith(
        `covers/${user.id}/cover.webp`,
        expect.any(Buffer),
        'image/webp',
      )
      expect(result.coverUrl).toContain('cover.webp')
    })
  })

  describe('updateProfile', () => {
    it('deve atualizar os campos do perfil', async () => {
      const updatedUser = createMockUser({ displayName: 'Novo Nome', bio: 'Nova bio' })
      vi.mocked(usersRepository.updateProfile).mockResolvedValue(updatedUser)

      const result = await usersService.updateProfile('user-uuid-1234', {
        displayName: 'Novo Nome',
        bio: 'Nova bio',
      })

      expect(result.displayName).toBe('Novo Nome')
      expect(usersRepository.updateProfile).toHaveBeenCalledWith('user-uuid-1234', {
        displayName: 'Novo Nome',
        bio: 'Nova bio',
      })
    })
  })
})
```

- [ ] **Step 3: Verificar que os novos testes falham**

```bash
npx vitest run tests/modules/users/users.service.test.ts
```

Expected: FAIL — constructor com 3 args não aceito / isBlockedBy não é função

- [ ] **Step 4: Atualizar UsersService**

Substituir o conteúdo completo de `src/modules/users/users.service.ts`:

```typescript
// src/modules/users/users.service.ts
import sharp from 'sharp'
import type { UsersRepository } from './users.repository.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { UpdateProfileInput } from './users.schema.js'
import type { User } from '../../shared/contracts/user.repository.contract.js'

export class UsersError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'UsersError'
  }
}

type PublicProfile = {
  id: string
  displayName: string
  avatarUrl: string | null
  coverUrl?: string | null
  bio?: string | null
  privacy?: string
  createdAt?: Date
}

export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly storageService: IStorageService,
    private readonly friendsRepository?: IFriendsRepository,
  ) {}

  async getProfile(userId: string, viewerId: string | null): Promise<PublicProfile> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new UsersError('USER_NOT_FOUND')

    const isOwner = viewerId === userId

    if (!isOwner && viewerId && this.friendsRepository) {
      const blocked = await this.friendsRepository.isBlockedBy(userId, viewerId)
      if (blocked) throw new UsersError('USER_NOT_FOUND')
    }

    const isFriend = (!isOwner && viewerId && this.friendsRepository)
      ? await this.friendsRepository.areFriends(userId, viewerId)
      : false

    if (user.privacy === 'private' && !isOwner && !isFriend) {
      throw new UsersError('USER_NOT_FOUND')
    }

    if (user.privacy === 'friends_only' && !isOwner && !isFriend) {
      return {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
      }
    }

    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      bio: user.bio,
      privacy: user.privacy,
      createdAt: user.createdAt,
    }
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
    return this.usersRepository.updateProfile(userId, input)
  }

  async uploadAvatar(userId: string, buffer: Buffer, _mimeType: string): Promise<User> {
    const webpBuffer = await sharp(buffer)
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()
    const key = `avatars/${userId}/avatar.webp`
    const avatarUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.usersRepository.updateProfile(userId, { avatarUrl })
  }

  async uploadCover(userId: string, buffer: Buffer, _mimeType: string): Promise<User> {
    const webpBuffer = await sharp(buffer)
      .resize(1200, 400, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()
    const key = `covers/${userId}/cover.webp`
    const coverUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.usersRepository.updateProfile(userId, { coverUrl })
  }

  async deleteAvatar(userId: string): Promise<User> {
    await this.storageService.delete(`avatars/${userId}/avatar.webp`)
    return this.usersRepository.updateProfile(userId, { avatarUrl: null })
  }

  async deleteCover(userId: string): Promise<User> {
    await this.storageService.delete(`covers/${userId}/cover.webp`)
    return this.usersRepository.updateProfile(userId, { coverUrl: null })
  }
}
```

- [ ] **Step 5: Verificar que os testes passam**

```bash
npx vitest run tests/modules/users/users.service.test.ts
```

Expected: todos os testes passando.

- [ ] **Step 6: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: pode haver erros residuais de Tasks anteriores — os erros desta task devem ser 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/middleware/authenticate.ts tests/modules/users/users.service.test.ts src/modules/users/users.service.ts
git commit -m "feat: UsersService com verificação real de amizade e bloqueio para friends_only"
```

---

### Task 8: Atualizar CollectionsService para friends_only (TDD)

**Files:**
- Modify: `tests/modules/collections/collections.service.test.ts`
- Modify: `src/modules/collections/collections.service.ts`
- Modify: `src/modules/collections/collections.controller.ts`
- Modify: `src/modules/collections/collections.routes.ts`

- [ ] **Step 1: Adicionar mock e testes de friends_only no teste de coleções (RED)**

No arquivo `tests/modules/collections/collections.service.test.ts`:

1. Adicionar import de `IFriendsRepository` logo após os imports existentes:
```typescript
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'
```

2. Adicionar a função helper `createMockFriendsRepository` após as helpers existentes:
```typescript
function createMockFriendsRepository(): IFriendsRepository {
  return {
    createRequest: vi.fn(),
    findRequestById: vi.fn(),
    findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(),
    findSentRequests: vi.fn(),
    updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(),
    areFriends: vi.fn(),
    removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(),
    deleteBlock: vi.fn(),
    isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(),
    findBlocksByBlocker: vi.fn(),
  }
}
```

3. No `describe('CollectionsService', ...)`, atualizar as declarações de variáveis e o `beforeEach`:
```typescript
let collRepo: ReturnType<typeof createMockCollectionRepository>
let fdRepo: ReturnType<typeof createMockFieldDefRepository>
let friendsRepo: ReturnType<typeof createMockFriendsRepository>
let service: CollectionsService

beforeEach(() => {
  collRepo = createMockCollectionRepository()
  fdRepo = createMockFieldDefRepository()
  friendsRepo = createMockFriendsRepository()
  service = new CollectionsService(collRepo, fdRepo, undefined, friendsRepo)
  vi.clearAllMocks()
})
```

4. Adicionar ao final do `describe('CollectionsService', ...)`:
```typescript
describe('getPublicCollections', () => {
  it('deve retornar apenas coleções públicas para viewer anônimo', async () => {
    const publicCol = createMockCollection({ visibility: 'public' })
    vi.mocked(collRepo.findPublicByUserId).mockResolvedValue([publicCol])

    const result = await service.getPublicCollections('owner-id', null)

    expect(collRepo.findPublicByUserId).toHaveBeenCalledWith('owner-id', ['public'])
    expect(result).toHaveLength(1)
  })

  it('deve retornar coleções públicas e friends_only para viewer que é amigo', async () => {
    const publicCol = createMockCollection({ visibility: 'public' })
    const friendsCol = createMockCollection({ id: 'col-uuid-2', visibility: 'friends_only' })
    vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(false)
    vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)
    vi.mocked(collRepo.findPublicByUserId).mockResolvedValue([publicCol, friendsCol])

    const result = await service.getPublicCollections('owner-id', 'viewer-id')

    expect(collRepo.findPublicByUserId).toHaveBeenCalledWith('owner-id', ['public', 'friends_only'])
    expect(result).toHaveLength(2)
  })

  it('deve retornar apenas coleções públicas para viewer que não é amigo', async () => {
    const publicCol = createMockCollection({ visibility: 'public' })
    vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(false)
    vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)
    vi.mocked(collRepo.findPublicByUserId).mockResolvedValue([publicCol])

    const result = await service.getPublicCollections('owner-id', 'viewer-id')

    expect(collRepo.findPublicByUserId).toHaveBeenCalledWith('owner-id', ['public'])
    expect(result).toHaveLength(1)
  })

  it('deve lançar NOT_FOUND se o viewer foi bloqueado pelo dono', async () => {
    vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(true)

    await expect(service.getPublicCollections('owner-id', 'viewer-id'))
      .rejects.toThrow('NOT_FOUND')
    expect(collRepo.findPublicByUserId).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verificar que os novos testes falham**

```bash
npx vitest run tests/modules/collections/collections.service.test.ts
```

Expected: FAIL — CollectionsService não aceita 4 parâmetros / getPublicCollections com assinatura errada

- [ ] **Step 3: Atualizar CollectionsService**

Substituir o conteúdo completo de `src/modules/collections/collections.service.ts`:

```typescript
// src/modules/collections/collections.service.ts
import sharp from 'sharp'
import type { ICollectionRepository, Collection, CollectionWithSchema } from '../../shared/contracts/collection.repository.contract.js'
import type { IFieldDefinitionRepository } from '../../shared/contracts/field-definition.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { CreateCollectionInput, UpdateCollectionInput } from './collections.schema.js'

export class CollectionsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'CollectionsError'
  }
}

export class CollectionsService {
  constructor(
    private readonly collectionsRepo: ICollectionRepository,
    private readonly fieldDefRepo: IFieldDefinitionRepository,
    private readonly storageService?: IStorageService,
    private readonly friendsRepo?: IFriendsRepository,
  ) {}

  async create(userId: string, input: CreateCollectionInput): Promise<CollectionWithSchema> {
    const collection = await this.collectionsRepo.create({
      userId,
      name: input.name,
      description: input.description,
      type: input.type,
      visibility: input.visibility,
    })

    if (input.type !== 'custom') {
      const systemFields = await this.fieldDefRepo.findSystemByCollectionType(input.type)
      if (systemFields.length > 0) {
        await this.collectionsRepo.addFieldsToSchema(
          collection.id,
          systemFields.map((f, i) => ({ fieldDefinitionId: f.id, isRequired: false, displayOrder: i })),
        )
      }
    } else if (input.fieldDefinitionIds?.length) {
      const userDefs = await this.fieldDefRepo.findByUserId(userId)
      const allowedIds = new Set(userDefs.map(d => d.id))
      for (const id of input.fieldDefinitionIds) {
        const def = await this.fieldDefRepo.findById(id)
        if (!def || (!def.isSystem && !allowedIds.has(id))) {
          throw new CollectionsError('FIELD_NOT_FOUND')
        }
      }
      await this.collectionsRepo.addFieldsToSchema(
        collection.id,
        input.fieldDefinitionIds.map((id, i) => ({ fieldDefinitionId: id, isRequired: false, displayOrder: i })),
      )
    }

    return (await this.collectionsRepo.findById(collection.id))!
  }

  async list(userId: string, query?: string): Promise<Collection[]> {
    return this.collectionsRepo.findByUserId(userId, query)
  }

  async get(userId: string, id: string): Promise<CollectionWithSchema> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) {
      throw new CollectionsError('NOT_FOUND')
    }
    return collection
  }

  async update(userId: string, id: string, input: UpdateCollectionInput): Promise<Collection> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) {
      throw new CollectionsError('NOT_FOUND')
    }
    return this.collectionsRepo.update(id, input)
  }

  async delete(userId: string, id: string): Promise<void> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) {
      throw new CollectionsError('NOT_FOUND')
    }
    await this.collectionsRepo.delete(id)
  }

  async uploadIcon(userId: string, id: string, buffer: Buffer): Promise<Collection> {
    if (!this.storageService) throw new CollectionsError('STORAGE_NOT_CONFIGURED')
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')
    const webpBuffer = await sharp(buffer).resize(200, 200, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const key = `collections/${id}/icon.webp`
    const iconUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.collectionsRepo.update(id, { iconUrl })
  }

  async uploadCover(userId: string, id: string, buffer: Buffer): Promise<Collection> {
    if (!this.storageService) throw new CollectionsError('STORAGE_NOT_CONFIGURED')
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')
    const webpBuffer = await sharp(buffer).resize(1200, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const key = `collections/${id}/cover.webp`
    const coverUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.collectionsRepo.update(id, { coverUrl })
  }

  async getPublicCollections(ownerId: string, viewerId: string | null): Promise<Collection[]> {
    if (viewerId && this.friendsRepo) {
      const blocked = await this.friendsRepo.isBlockedBy(ownerId, viewerId)
      if (blocked) throw new CollectionsError('NOT_FOUND')
      const isFriend = await this.friendsRepo.areFriends(ownerId, viewerId)
      if (isFriend) {
        return this.collectionsRepo.findPublicByUserId(ownerId, ['public', 'friends_only'])
      }
    }
    return this.collectionsRepo.findPublicByUserId(ownerId, ['public'])
  }
}
```

- [ ] **Step 4: Verificar que os testes passam**

```bash
npx vitest run tests/modules/collections/collections.service.test.ts
```

Expected: todos os testes passando.

- [ ] **Step 5: Atualizar CollectionsController — método listPublic**

Em `src/modules/collections/collections.controller.ts`, substituir apenas o método `listPublic`:

```typescript
async listPublic(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
  const user = request.user as AccessTokenClaims | undefined
  const viewerId = user?.userId ?? null
  try {
    const collections = await this.service.getPublicCollections(request.params.userId, viewerId)
    return reply.send(collections)
  } catch (error) { return this.handleError(error, reply) }
}
```

- [ ] **Step 6: Atualizar collectionsPublicRoutes para usar optionalAuthenticate**

Em `src/modules/collections/collections.routes.ts`, atualizar os imports e a função `collectionsPublicRoutes`:

```typescript
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'

// ... (collectionsRoutes permanece igual) ...

export async function collectionsPublicRoutes(
  app: FastifyInstance,
  options: { collectionsService: CollectionsService },
) {
  const controller = new CollectionsController(options.collectionsService)
  app.get('/:userId/collections', { preHandler: [optionalAuthenticate], handler: controller.listPublic.bind(controller) })
}
```

- [ ] **Step 7: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: pode haver erros residuais de Items — os erros desta task devem ser 0.

- [ ] **Step 8: Commit**

```bash
git add tests/modules/collections/collections.service.test.ts src/modules/collections/collections.service.ts src/modules/collections/collections.controller.ts src/modules/collections/collections.routes.ts
git commit -m "feat: CollectionsService com friends_only — bloqueio e verificação de amizade"
```

---

### Task 9: Atualizar ItemsService para friends_only (TDD)

**Files:**
- Modify: `tests/modules/items/items.service.test.ts`
- Modify: `src/modules/items/items.service.ts`
- Modify: `src/modules/items/items.controller.ts`
- Modify: `src/modules/items/items.routes.ts`

O método atual é `listPublicItems(collectionId, ownerId)` — passará a receber `viewerId: string | null` como terceiro parâmetro e aceitar coleções `friends_only` para amigos.

- [ ] **Step 1: Adicionar testes de friends_only no items.service.test.ts (RED)**

Em `tests/modules/items/items.service.test.ts`:

1. Adicionar import de `IFriendsRepository`:
```typescript
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'
```

2. Adicionar helper `createMockFriendsRepository` após os helpers existentes:
```typescript
function createMockFriendsRepository(): IFriendsRepository {
  return {
    createRequest: vi.fn(),
    findRequestById: vi.fn(),
    findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(),
    findSentRequests: vi.fn(),
    updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(),
    areFriends: vi.fn(),
    removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(),
    deleteBlock: vi.fn(),
    isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(),
    findBlocksByBlocker: vi.fn(),
  }
}
```

3. No `describe('ItemsService', ...)`, adicionar `friendsRepo` às declarações de variáveis e ao `beforeEach`. A inicialização do service deve passar `friendsRepo` como 4º parâmetro:
```typescript
let friendsRepo: ReturnType<typeof createMockFriendsRepository>
// ...
friendsRepo = createMockFriendsRepository()
service = new ItemsService(itemsRepo, collRepo, undefined, friendsRepo)
```

4. Adicionar `describe('listPublicItems', ...)` ao final do `describe('ItemsService', ...)` (localizar o describe existente de `listPublicItems` se houver e atualizar, ou adicionar novos testes):
```typescript
describe('listPublicItems — friends_only', () => {
  it('deve retornar itens de coleção friends_only para viewer que é amigo', async () => {
    const collection = createMockCollection({ visibility: 'friends_only' })
    vi.mocked(collRepo.findById).mockResolvedValue({ ...collection, fieldSchema: [] })
    vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(false)
    vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)
    vi.mocked(itemsRepo.findByCollectionId).mockResolvedValue([])

    await service.listPublicItems('col-uuid-1', 'owner-id', 'friend-id')

    expect(itemsRepo.findByCollectionId).toHaveBeenCalled()
  })

  it('deve lançar NOT_FOUND para coleção friends_only quando viewer não é amigo', async () => {
    const collection = createMockCollection({ visibility: 'friends_only' })
    vi.mocked(collRepo.findById).mockResolvedValue({ ...collection, fieldSchema: [] })
    vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(false)
    vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)

    await expect(service.listPublicItems('col-uuid-1', 'owner-id', 'viewer-id'))
      .rejects.toThrow('NOT_FOUND')
  })

  it('deve lançar NOT_FOUND para coleção friends_only quando viewer é anônimo', async () => {
    const collection = createMockCollection({ visibility: 'friends_only' })
    vi.mocked(collRepo.findById).mockResolvedValue({ ...collection, fieldSchema: [] })

    await expect(service.listPublicItems('col-uuid-1', 'owner-id', null))
      .rejects.toThrow('NOT_FOUND')
  })

  it('deve lançar NOT_FOUND se viewer foi bloqueado pelo dono', async () => {
    const collection = createMockCollection({ visibility: 'public' })
    vi.mocked(collRepo.findById).mockResolvedValue({ ...collection, fieldSchema: [] })
    vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(true)

    await expect(service.listPublicItems('col-uuid-1', 'owner-id', 'viewer-id'))
      .rejects.toThrow('NOT_FOUND')
  })
})
```

Também atualizar os testes existentes de `listPublicItems` que usam `service.listPublicItems('col-uuid-1', 'user-uuid-1')` para passar `null` como terceiro argumento: `service.listPublicItems('col-uuid-1', 'user-uuid-1', null)`.

- [ ] **Step 2: Verificar que os novos testes falham**

```bash
npx vitest run tests/modules/items/items.service.test.ts
```

Expected: FAIL — `listPublicItems` não aceita 3 parâmetros

- [ ] **Step 3: Atualizar ItemsService**

Em `src/modules/items/items.service.ts`:

1. Adicionar import de `IFriendsRepository`:
```typescript
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
```

2. Atualizar o constructor para incluir `friendsRepo` como 4º parâmetro opcional:
```typescript
constructor(
  private readonly itemRepo: IItemRepository,
  private readonly collectionRepo: ICollectionRepository,
  private readonly storageService?: IStorageService,
  private readonly friendsRepo?: IFriendsRepository,
) {}
```

3. Substituir o método `listPublicItems`:
```typescript
async listPublicItems(collectionId: string, ownerId: string, viewerId: string | null): Promise<Item[]> {
  const collection = await this.collectionRepo.findById(collectionId)
  if (!collection || collection.userId !== ownerId) throw new ItemsError('NOT_FOUND')

  if (viewerId && this.friendsRepo) {
    const blocked = await this.friendsRepo.isBlockedBy(ownerId, viewerId)
    if (blocked) throw new ItemsError('NOT_FOUND')
  }

  if (collection.visibility === 'private') throw new ItemsError('NOT_FOUND')

  if (collection.visibility === 'friends_only') {
    const isFriend = (viewerId && this.friendsRepo)
      ? await this.friendsRepo.areFriends(ownerId, viewerId)
      : false
    if (!isFriend) throw new ItemsError('NOT_FOUND')
  }

  return this.itemRepo.findByCollectionId(collectionId)
}
```

- [ ] **Step 4: Verificar que os testes passam**

```bash
npx vitest run tests/modules/items/items.service.test.ts
```

Expected: todos os testes passando.

- [ ] **Step 5: Atualizar ItemsController — método listPublic**

Em `src/modules/items/items.controller.ts`, substituir o método `listPublic`:

```typescript
async listPublic(
  request: FastifyRequest<{ Params: { userId: string; collectionId: string } }>,
  reply: FastifyReply,
) {
  const user = request.user as AccessTokenClaims | undefined
  const viewerId = user?.userId ?? null
  try {
    const items = await this.service.listPublicItems(request.params.collectionId, request.params.userId, viewerId)
    return reply.send(items)
  } catch (error) { return this.handleError(error, reply) }
}
```

Adicionar import de `AccessTokenClaims` se ainda não estiver presente:
```typescript
import type { AccessTokenClaims } from '../auth/auth.service.js'
```

- [ ] **Step 6: Atualizar itemsPublicRoutes para usar optionalAuthenticate**

Em `src/modules/items/items.routes.ts`, atualizar imports e a função `itemsPublicRoutes`:

```typescript
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'

// ... (itemsRoutes permanece igual) ...

export async function itemsPublicRoutes(
  app: FastifyInstance,
  options: { itemsService: ItemsService },
) {
  const controller = new ItemsController(options.itemsService)
  app.get('/:userId/collections/:collectionId/items', { preHandler: [optionalAuthenticate], handler: controller.listPublic.bind(controller) })
}
```

- [ ] **Step 7: Verificar todos os testes passam**

```bash
npx vitest run
```

Expected: ≥50 testes passando, 0 failures (exceto integration test que requer DB).

- [ ] **Step 8: Verificar build TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 erros.

- [ ] **Step 9: Commit**

```bash
git add tests/modules/items/items.service.test.ts src/modules/items/items.service.ts src/modules/items/items.controller.ts src/modules/items/items.routes.ts
git commit -m "feat: ItemsService com friends_only — bloqueio e verificação de amizade"
```

---

### Task 10: Wiring DI em app.ts

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Atualizar app.ts com DI e rotas do módulo friends**

Substituir o conteúdo completo de `src/app.ts`:

```typescript
// src/app.ts
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'
import fastifyCors from '@fastify/cors'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { env } from './config/env.js'
import { createDatabaseClient } from './shared/infra/database/postgres.client.js'
import { UserRepository } from './modules/auth/auth.repository.js'
import { UsersRepository } from './modules/users/users.repository.js'
import { FieldDefinitionRepository } from './modules/field-definitions/field-definitions.repository.js'
import { seedFieldDefinitions } from './shared/infra/database/seeds/field-definitions.seed.js'
import { S3Adapter } from './shared/infra/storage/s3.adapter.js'
import { SESAdapter } from './shared/infra/email/ses.adapter.js'
import { AuthService } from './modules/auth/auth.service.js'
import { UsersService } from './modules/users/users.service.js'
import { FieldDefinitionsService } from './modules/field-definitions/field-definitions.service.js'
import { fieldDefinitionsRoutes } from './modules/field-definitions/field-definitions.routes.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { usersRoutes } from './modules/users/users.routes.js'
import { CollectionsRepository } from './modules/collections/collections.repository.js'
import { CollectionsService } from './modules/collections/collections.service.js'
import { collectionsRoutes, collectionsPublicRoutes } from './modules/collections/collections.routes.js'
import { ItemsRepository } from './modules/items/items.repository.js'
import { ItemsService } from './modules/items/items.service.js'
import { itemsRoutes, itemsPublicRoutes } from './modules/items/items.routes.js'
import { FriendsRepository } from './modules/friends/friends.repository.js'
import { FriendsService } from './modules/friends/friends.service.js'
import { friendsRoutes, blocksRoutes } from './modules/friends/friends.routes.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(fastifyCors, { origin: env.FRONTEND_URL, credentials: true })
  await app.register(fastifyJwt, { secret: env.JWT_SECRET })
  await app.register(fastifyCookie)
  await app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024 } })

  const db = createDatabaseClient(env.DATABASE_URL)

  await migrate(db, { migrationsFolder: join(__dirname, 'shared/infra/database/migrations') })

  const fieldDefinitionRepository = new FieldDefinitionRepository(db)
  await seedFieldDefinitions(fieldDefinitionRepository)
  const fieldDefinitionsService = new FieldDefinitionsService(fieldDefinitionRepository)

  const userRepository = new UserRepository(db)
  const usersRepository = new UsersRepository(db)
  const storageService = new S3Adapter(
    env.S3_BUCKET_NAME, env.AWS_REGION,
    env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY,
  )
  const emailService = new SESAdapter(
    env.SES_FROM_EMAIL, env.AWS_REGION,
    env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY,
  )
  const authService = new AuthService(userRepository, emailService, {
    appUrl: env.APP_URL,
    jwtSecret: env.JWT_SECRET,
    refreshTokenExpiresDays: env.REFRESH_TOKEN_EXPIRES_DAYS,
  })

  const friendsRepository = new FriendsRepository(db)
  const friendsService = new FriendsService(friendsRepository)

  const usersService = new UsersService(usersRepository, storageService, friendsRepository)

  const collectionsRepository = new CollectionsRepository(db)
  const collectionsService = new CollectionsService(
    collectionsRepository,
    fieldDefinitionRepository,
    storageService,
    friendsRepository,
  )

  const itemsRepository = new ItemsRepository(db)
  const itemsService = new ItemsService(itemsRepository, collectionsRepository, storageService, friendsRepository)

  await app.register(authRoutes, { prefix: '/auth', authService })
  await app.register(usersRoutes, { prefix: '/users', usersService })
  await app.register(fieldDefinitionsRoutes, { prefix: '/field-definitions', fieldDefinitionsService })
  await app.register(collectionsRoutes, { prefix: '/collections', collectionsService })
  await app.register(collectionsPublicRoutes, { prefix: '/users', collectionsService })
  await app.register(itemsRoutes, { prefix: '/collections', itemsService })
  await app.register(itemsPublicRoutes, { prefix: '/users', itemsService })
  await app.register(friendsRoutes, { prefix: '/friends', friendsService })
  await app.register(blocksRoutes, { prefix: '/blocks', friendsService })

  if (env.KEYCLOAK_ENABLED && env.KEYCLOAK_URL && env.KEYCLOAK_REALM && env.KEYCLOAK_CLIENT_ID && env.KEYCLOAK_CLIENT_SECRET) {
    const { registerKeycloakRoutes } = await import('./modules/auth/keycloak.strategy.js')
    await registerKeycloakRoutes(app, authService, {
      keycloakUrl: env.KEYCLOAK_URL,
      realm: env.KEYCLOAK_REALM,
      clientId: env.KEYCLOAK_CLIENT_ID,
      clientSecret: env.KEYCLOAK_CLIENT_SECRET,
      appUrl: env.APP_URL,
      frontendUrl: env.FRONTEND_URL,
    })
  }

  return app
}
```

- [ ] **Step 2: Verificar build TypeScript completo**

```bash
npx tsc --noEmit
```

Expected: 0 erros.

- [ ] **Step 3: Verificar todos os testes passam**

```bash
npx vitest run
```

Expected: ≥60 testes passando, 0 failures (exceto integration test que requer DB).

- [ ] **Step 4: Commit**

```bash
git add src/app.ts
git commit -m "feat: wiring DI — FriendsRepository injetado em UsersService, CollectionsService, ItemsService e app.ts"
```
