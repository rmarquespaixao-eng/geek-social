# Chat — Fase B: DM Requests (TDD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o fluxo de pedidos de DM entre não-amigos: enviar, aceitar e rejeitar pedidos.

**Architecture:** Service recebe 3 repositórios via construtor. Erro compartilhado `ChatError` (message === code). TDD com Vitest + mocks manuais.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM

**Pré-requisito:** Fase A completa (contratos criados, schema atualizado).

---

### Task 1: ChatError + DmRequestsService (TDD)

**Files:**
- Create: `src/modules/chat/chat.errors.ts`
- Create: `tests/modules/chat/dm-requests.service.test.ts`
- Create: `src/modules/chat/dm-requests.service.ts`

- [ ] **Criar chat.errors.ts**

```typescript
export class ChatError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ChatError'
  }
}
```

- [ ] **Escrever o teste antes da implementação**

Criar `tests/modules/chat/dm-requests.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DmRequestsService } from '../../../src/modules/chat/dm-requests.service.js'
import type { IDmRequestsRepository, DmRequest } from '../../../src/shared/contracts/dm-requests.repository.contract.js'
import type { IConversationsRepository, Conversation, ConversationMember } from '../../../src/shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockDmRequestsRepository(): IDmRequestsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findExisting: vi.fn(),
    findReceivedPending: vi.fn(),
    updateStatus: vi.fn(),
  }
}

function createMockConversationsRepository(): IConversationsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMember: vi.fn(),
    findMember: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
    findMembers: vi.fn(),
    findMembersByUserId: vi.fn(),
    findExistingDm: vi.fn(),
    findUserConversations: vi.fn(),
    updateLastReadAt: vi.fn(),
  }
}

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
    findAllBlockRelationUserIds: vi.fn(),
  }
}

function makeDmRequest(overrides: Partial<DmRequest> = {}): DmRequest {
  return {
    id: 'req-1',
    senderId: 'user-a',
    receiverId: 'user-b',
    status: 'pending',
    conversationId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    type: 'dm',
    name: null,
    description: null,
    coverUrl: null,
    createdBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeMember(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    id: 'mem-1',
    conversationId: 'conv-1',
    userId: 'user-a',
    role: 'member',
    permissions: { can_send_messages: true, can_send_files: true },
    joinedAt: new Date('2026-01-01'),
    lastReadAt: null,
    ...overrides,
  }
}

describe('DmRequestsService', () => {
  let repo: ReturnType<typeof createMockDmRequestsRepository>
  let conversationsRepo: ReturnType<typeof createMockConversationsRepository>
  let friendsRepo: ReturnType<typeof createMockFriendsRepository>
  let service: DmRequestsService

  beforeEach(() => {
    repo = createMockDmRequestsRepository()
    conversationsRepo = createMockConversationsRepository()
    friendsRepo = createMockFriendsRepository()
    service = new DmRequestsService(repo, conversationsRepo, friendsRepo)
    vi.clearAllMocks()
  })

  describe('sendRequest', () => {
    it('deve enviar pedido de DM para não-amigo', async () => {
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)
      vi.mocked(repo.findExisting).mockResolvedValue(null)
      vi.mocked(repo.create).mockResolvedValue(makeDmRequest())

      const result = await service.sendRequest('user-a', 'user-b')

      expect(repo.create).toHaveBeenCalledWith('user-a', 'user-b')
      expect(result.status).toBe('pending')
    })

    it('deve lançar FRIENDS_USE_DM ao enviar pedido para amigo', async () => {
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)

      await expect(service.sendRequest('user-a', 'user-b')).rejects.toThrow('FRIENDS_USE_DM')
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND para usuário bloqueado', async () => {
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.sendRequest('user-a', 'user-b')).rejects.toThrow('NOT_FOUND')
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('deve lançar ALREADY_EXISTS se pedido já existe', async () => {
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)
      vi.mocked(repo.findExisting).mockResolvedValue(makeDmRequest())

      await expect(service.sendRequest('user-a', 'user-b')).rejects.toThrow('ALREADY_EXISTS')
    })

    it('deve lançar SELF_REQUEST ao enviar pedido para si mesmo', async () => {
      await expect(service.sendRequest('user-a', 'user-a')).rejects.toThrow('SELF_REQUEST')
      expect(repo.create).not.toHaveBeenCalled()
    })
  })

  describe('acceptRequest', () => {
    it('deve aceitar pedido, criar conversa DM e adicionar ambos como membros', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeDmRequest({ receiverId: 'user-b' }))
      vi.mocked(conversationsRepo.create).mockResolvedValue(makeConversation())
      vi.mocked(conversationsRepo.addMember).mockResolvedValue(makeMember())
      vi.mocked(repo.updateStatus).mockResolvedValue(makeDmRequest({ status: 'accepted', conversationId: 'conv-1' }))

      const result = await service.acceptRequest('req-1', 'user-b')

      expect(conversationsRepo.create).toHaveBeenCalledWith({ type: 'dm' })
      expect(conversationsRepo.addMember).toHaveBeenCalledTimes(2)
      expect(conversationsRepo.addMember).toHaveBeenCalledWith('conv-1', 'user-a', 'member')
      expect(conversationsRepo.addMember).toHaveBeenCalledWith('conv-1', 'user-b', 'member')
      expect(repo.updateStatus).toHaveBeenCalledWith('req-1', 'accepted', 'conv-1')
      expect(result.type).toBe('dm')
    })

    it('deve lançar NOT_FOUND se pedido não existe', async () => {
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(service.acceptRequest('req-1', 'user-b')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND se receiver não é o usuário atual', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeDmRequest({ receiverId: 'user-b' }))

      await expect(service.acceptRequest('req-1', 'user-c')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_PENDING se pedido já foi aceito', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeDmRequest({ status: 'accepted', receiverId: 'user-b' }))

      await expect(service.acceptRequest('req-1', 'user-b')).rejects.toThrow('NOT_PENDING')
    })

    it('deve lançar NOT_PENDING se pedido já foi rejeitado', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeDmRequest({ status: 'rejected', receiverId: 'user-b' }))

      await expect(service.acceptRequest('req-1', 'user-b')).rejects.toThrow('NOT_PENDING')
    })
  })

  describe('rejectRequest', () => {
    it('deve rejeitar pedido pendente', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeDmRequest({ receiverId: 'user-b' }))
      vi.mocked(repo.updateStatus).mockResolvedValue(makeDmRequest({ status: 'rejected' }))

      await service.rejectRequest('req-1', 'user-b')

      expect(repo.updateStatus).toHaveBeenCalledWith('req-1', 'rejected')
    })

    it('deve lançar NOT_FOUND se receiver não é o usuário atual', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeDmRequest({ receiverId: 'user-b' }))

      await expect(service.rejectRequest('req-1', 'user-c')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_PENDING se pedido já foi rejeitado', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeDmRequest({ status: 'rejected', receiverId: 'user-b' }))

      await expect(service.rejectRequest('req-1', 'user-b')).rejects.toThrow('NOT_PENDING')
    })
  })
})
```

- [ ] **Rodar testes para verificar que falham**

```bash
npx vitest run tests/modules/chat/dm-requests.service.test.ts
```

Expected: FAIL com "Cannot find module".

- [ ] **Implementar dm-requests.service.ts**

Criar `src/modules/chat/dm-requests.service.ts`:

```typescript
import type { IDmRequestsRepository, DmRequest } from '../../shared/contracts/dm-requests.repository.contract.js'
import type { IConversationsRepository, Conversation } from '../../shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import { ChatError } from './chat.errors.js'

export class DmRequestsService {
  constructor(
    private readonly repo: IDmRequestsRepository,
    private readonly conversationsRepo: IConversationsRepository,
    private readonly friendsRepo: IFriendsRepository,
  ) {}

  async sendRequest(senderId: string, receiverId: string): Promise<DmRequest> {
    if (senderId === receiverId) throw new ChatError('SELF_REQUEST')
    const blocked = await this.friendsRepo.isBlockedEitherDirection(senderId, receiverId)
    if (blocked) throw new ChatError('NOT_FOUND')
    const areFriends = await this.friendsRepo.areFriends(senderId, receiverId)
    if (areFriends) throw new ChatError('FRIENDS_USE_DM')
    const existing = await this.repo.findExisting(senderId, receiverId)
    if (existing) throw new ChatError('ALREADY_EXISTS')
    return this.repo.create(senderId, receiverId)
  }

  async acceptRequest(requestId: string, userId: string): Promise<Conversation> {
    const request = await this.repo.findById(requestId)
    if (!request || request.receiverId !== userId) throw new ChatError('NOT_FOUND')
    if (request.status !== 'pending') throw new ChatError('NOT_PENDING')
    const conversation = await this.conversationsRepo.create({ type: 'dm' })
    await this.conversationsRepo.addMember(conversation.id, request.senderId, 'member')
    await this.conversationsRepo.addMember(conversation.id, request.receiverId, 'member')
    await this.repo.updateStatus(requestId, 'accepted', conversation.id)
    return conversation
  }

  async rejectRequest(requestId: string, userId: string): Promise<void> {
    const request = await this.repo.findById(requestId)
    if (!request || request.receiverId !== userId) throw new ChatError('NOT_FOUND')
    if (request.status !== 'pending') throw new ChatError('NOT_PENDING')
    await this.repo.updateStatus(requestId, 'rejected')
  }

  async listReceivedPending(userId: string): Promise<DmRequest[]> {
    return this.repo.findReceivedPending(userId)
  }
}
```

- [ ] **Rodar testes para verificar que passam**

```bash
npx vitest run tests/modules/chat/dm-requests.service.test.ts
```

Expected: todos os testes PASS.

- [ ] **Commit**

```bash
git add src/modules/chat/chat.errors.ts \
        src/modules/chat/dm-requests.service.ts \
        tests/modules/chat/dm-requests.service.test.ts
git commit -m "feat: DmRequestsService com TDD — enviar, aceitar e rejeitar pedidos de DM"
```

---

### Task 2: DmRequestsRepository

**Files:**
- Create: `src/modules/chat/dm-requests.repository.ts`

- [ ] **Implementar DmRequestsRepository**

Criar `src/modules/chat/dm-requests.repository.ts`:

```typescript
import { eq, and, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { dmRequests } from '../../shared/infra/database/schema.js'
import type { IDmRequestsRepository, DmRequest } from '../../shared/contracts/dm-requests.repository.contract.js'

export class DmRequestsRepository implements IDmRequestsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(senderId: string, receiverId: string): Promise<DmRequest> {
    const [row] = await this.db.insert(dmRequests).values({ senderId, receiverId }).returning()
    return this.map(row)
  }

  async findById(id: string): Promise<DmRequest | null> {
    const [row] = await this.db.select().from(dmRequests).where(eq(dmRequests.id, id)).limit(1)
    return row ? this.map(row) : null
  }

  async findExisting(senderId: string, receiverId: string): Promise<DmRequest | null> {
    const [row] = await this.db.select().from(dmRequests).where(
      or(
        and(eq(dmRequests.senderId, senderId), eq(dmRequests.receiverId, receiverId)),
        and(eq(dmRequests.senderId, receiverId), eq(dmRequests.receiverId, senderId)),
      )
    ).limit(1)
    return row ? this.map(row) : null
  }

  async findReceivedPending(receiverId: string): Promise<DmRequest[]> {
    const rows = await this.db.select().from(dmRequests).where(
      and(eq(dmRequests.receiverId, receiverId), eq(dmRequests.status, 'pending'))
    )
    return rows.map(r => this.map(r))
  }

  async updateStatus(id: string, status: 'accepted' | 'rejected', conversationId?: string): Promise<DmRequest> {
    const [row] = await this.db.update(dmRequests)
      .set({ status, conversationId: conversationId ?? null, updatedAt: new Date() })
      .where(eq(dmRequests.id, id))
      .returning()
    return this.map(row)
  }

  private map(row: typeof dmRequests.$inferSelect): DmRequest {
    return {
      id: row.id,
      senderId: row.senderId,
      receiverId: row.receiverId,
      status: row.status,
      conversationId: row.conversationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/modules/chat/dm-requests.repository.ts
git commit -m "feat: DmRequestsRepository — implementação com Drizzle"
```
