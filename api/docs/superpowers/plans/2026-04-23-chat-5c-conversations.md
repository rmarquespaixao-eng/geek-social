# Chat — Fase C: Conversations (TDD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar criação e gerenciamento de conversas DM e grupos: criar, editar, deletar, convidar/remover membros, alterar roles, sair da conversa.

**Architecture:** ConversationsService recebe IConversationsRepository + IFriendsRepository + IStorageService. Toda lógica de role/permissão fica no service. Repositório só faz CRUD.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, Sharp + S3

**Pré-requisito:** Fases A e B completas.

---

### Task 1: ConversationsService (TDD)

**Files:**
- Create: `tests/modules/chat/conversations.service.test.ts`
- Create: `src/modules/chat/conversations.service.ts`

- [ ] **Escrever o teste antes da implementação**

Criar `tests/modules/chat/conversations.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationsService } from '../../../src/modules/chat/conversations.service.js'
import type { IConversationsRepository, Conversation, ConversationMember, MemberRole } from '../../../src/shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'

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

function createMockStorageService(): IStorageService {
  return {
    upload: vi.fn().mockResolvedValue('https://s3.amazonaws.com/bucket/cover.webp'),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    type: 'group',
    name: 'Meu Grupo',
    description: null,
    coverUrl: null,
    createdBy: 'user-owner',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function makeMember(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    id: 'mem-1',
    conversationId: 'conv-1',
    userId: 'user-owner',
    role: 'owner',
    permissions: { can_send_messages: true, can_send_files: true },
    joinedAt: new Date('2026-01-01'),
    lastReadAt: null,
    ...overrides,
  }
}

describe('ConversationsService', () => {
  let repo: ReturnType<typeof createMockConversationsRepository>
  let friendsRepo: ReturnType<typeof createMockFriendsRepository>
  let storageService: ReturnType<typeof createMockStorageService>
  let service: ConversationsService

  beforeEach(() => {
    repo = createMockConversationsRepository()
    friendsRepo = createMockFriendsRepository()
    storageService = createMockStorageService()
    service = new ConversationsService(repo, friendsRepo, storageService)
    vi.clearAllMocks()
  })

  describe('createGroup', () => {
    it('deve criar sala de grupo e adicionar criador como owner', async () => {
      const conv = makeConversation()
      vi.mocked(repo.create).mockResolvedValue(conv)
      vi.mocked(repo.addMember).mockResolvedValue(makeMember())

      const result = await service.createGroup('user-owner', { name: 'Meu Grupo' })

      expect(repo.create).toHaveBeenCalledWith({
        type: 'group',
        name: 'Meu Grupo',
        description: undefined,
        createdBy: 'user-owner',
      })
      expect(repo.addMember).toHaveBeenCalledWith('conv-1', 'user-owner', 'owner')
      expect(result.type).toBe('group')
    })
  })

  describe('openDirectDm', () => {
    it('deve abrir DM direto entre amigos', async () => {
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(repo.findExistingDm).mockResolvedValue(null)
      const conv = makeConversation({ type: 'dm', name: null })
      vi.mocked(repo.create).mockResolvedValue(conv)
      vi.mocked(repo.addMember).mockResolvedValue(makeMember())

      const result = await service.openDirectDm('user-a', 'user-b')

      expect(repo.create).toHaveBeenCalledWith({ type: 'dm' })
      expect(repo.addMember).toHaveBeenCalledTimes(2)
      expect(result.type).toBe('dm')
    })

    it('deve retornar DM existente sem criar novo', async () => {
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      const existingDm = makeConversation({ type: 'dm', name: null })
      vi.mocked(repo.findExistingDm).mockResolvedValue(existingDm)

      const result = await service.openDirectDm('user-a', 'user-b')

      expect(repo.create).not.toHaveBeenCalled()
      expect(result.id).toBe('conv-1')
    })

    it('deve lançar NOT_FRIENDS ao abrir DM com não-amigo', async () => {
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)

      await expect(service.openDirectDm('user-a', 'user-b')).rejects.toThrow('NOT_FRIENDS')
    })

    it('deve lançar NOT_FOUND para usuário bloqueado', async () => {
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.openDirectDm('user-a', 'user-b')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('updateGroup', () => {
    it('deve permitir owner atualizar a sala', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ role: 'owner' }))
      vi.mocked(repo.update).mockResolvedValue(makeConversation({ name: 'Novo Nome' }))

      const result = await service.updateGroup('conv-1', 'user-owner', { name: 'Novo Nome' })

      expect(repo.update).toHaveBeenCalledWith('conv-1', { name: 'Novo Nome' })
      expect(result.name).toBe('Novo Nome')
    })

    it('deve permitir admin atualizar a sala', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-admin', role: 'admin' }))
      vi.mocked(repo.update).mockResolvedValue(makeConversation())

      await service.updateGroup('conv-1', 'user-admin', { name: 'Mudado' })

      expect(repo.update).toHaveBeenCalled()
    })

    it('deve lançar FORBIDDEN para membro comum', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-member', role: 'member' }))

      await expect(service.updateGroup('conv-1', 'user-member', { name: 'X' })).rejects.toThrow('FORBIDDEN')
    })

    it('deve lançar NOT_FOUND para sala inexistente', async () => {
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(service.updateGroup('conv-x', 'user-owner', { name: 'X' })).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('deleteGroup', () => {
    it('deve permitir owner deletar a sala', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ role: 'owner' }))
      vi.mocked(repo.delete).mockResolvedValue(undefined)

      await service.deleteGroup('conv-1', 'user-owner')

      expect(repo.delete).toHaveBeenCalledWith('conv-1')
    })

    it('deve lançar FORBIDDEN para não-owner', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-admin', role: 'admin' }))

      await expect(service.deleteGroup('conv-1', 'user-admin')).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('inviteMember', () => {
    it('deve permitir admin convidar membro', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember)
        .mockResolvedValueOnce(makeMember({ userId: 'user-admin', role: 'admin' })) // caller
        .mockResolvedValueOnce(null) // target not yet member
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(repo.addMember).mockResolvedValue(makeMember({ userId: 'user-new', role: 'member' }))

      await service.inviteMember('conv-1', 'user-admin', 'user-new')

      expect(repo.addMember).toHaveBeenCalledWith('conv-1', 'user-new', 'member')
    })

    it('deve lançar FORBIDDEN para membro comum tentando convidar', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-member', role: 'member' }))

      await expect(service.inviteMember('conv-1', 'user-member', 'user-new')).rejects.toThrow('FORBIDDEN')
    })

    it('deve lançar NOT_FOUND para usuário bloqueado', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-admin', role: 'admin' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.inviteMember('conv-1', 'user-admin', 'user-blocked')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar ALREADY_MEMBER se usuário já é membro', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember)
        .mockResolvedValueOnce(makeMember({ userId: 'user-admin', role: 'admin' })) // caller
        .mockResolvedValueOnce(makeMember({ userId: 'user-new' })) // target already member
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)

      await expect(service.inviteMember('conv-1', 'user-admin', 'user-new')).rejects.toThrow('ALREADY_MEMBER')
    })
  })

  describe('removeMember', () => {
    it('deve permitir owner remover admin', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember)
        .mockResolvedValueOnce(makeMember({ userId: 'user-owner', role: 'owner' }))
        .mockResolvedValueOnce(makeMember({ userId: 'user-admin', role: 'admin' }))
      vi.mocked(repo.removeMember).mockResolvedValue(undefined)

      await service.removeMember('conv-1', 'user-owner', 'user-admin')

      expect(repo.removeMember).toHaveBeenCalledWith('conv-1', 'user-admin')
    })

    it('deve permitir admin remover membro comum', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember)
        .mockResolvedValueOnce(makeMember({ userId: 'user-admin', role: 'admin' }))
        .mockResolvedValueOnce(makeMember({ userId: 'user-member', role: 'member' }))
      vi.mocked(repo.removeMember).mockResolvedValue(undefined)

      await service.removeMember('conv-1', 'user-admin', 'user-member')

      expect(repo.removeMember).toHaveBeenCalledWith('conv-1', 'user-member')
    })

    it('deve lançar FORBIDDEN quando admin tenta remover outro admin', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember)
        .mockResolvedValueOnce(makeMember({ userId: 'user-admin', role: 'admin' }))
        .mockResolvedValueOnce(makeMember({ userId: 'user-admin2', role: 'admin' }))

      await expect(service.removeMember('conv-1', 'user-admin', 'user-admin2')).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('updateMemberRole', () => {
    it('deve transferir ownership quando role é owner — ex-owner vira admin', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember)
        .mockResolvedValueOnce(makeMember({ userId: 'user-owner', role: 'owner' })) // caller
        .mockResolvedValueOnce(makeMember({ userId: 'user-admin', role: 'admin' })) // target
      vi.mocked(repo.updateMember).mockResolvedValue(makeMember())

      await service.updateMemberRole('conv-1', 'user-owner', 'user-admin', 'owner')

      expect(repo.updateMember).toHaveBeenCalledWith('conv-1', 'user-admin', { role: 'owner' })
      expect(repo.updateMember).toHaveBeenCalledWith('conv-1', 'user-owner', { role: 'admin' })
    })

    it('deve lançar FORBIDDEN se caller não é owner', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-admin', role: 'admin' }))

      await expect(service.updateMemberRole('conv-1', 'user-admin', 'user-other', 'owner')).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('updateMemberPermissions', () => {
    it('deve permitir admin alterar permissões de membro', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember)
        .mockResolvedValueOnce(makeMember({ userId: 'user-admin', role: 'admin' }))
        .mockResolvedValueOnce(makeMember({ userId: 'user-member', role: 'member' }))
      vi.mocked(repo.updateMember).mockResolvedValue(makeMember())

      await service.updateMemberPermissions('conv-1', 'user-admin', 'user-member', { can_send_messages: false, can_send_files: true })

      expect(repo.updateMember).toHaveBeenCalledWith('conv-1', 'user-member', {
        permissions: { can_send_messages: false, can_send_files: true },
      })
    })

    it('deve lançar FORBIDDEN se caller é membro comum', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-member', role: 'member' }))

      await expect(
        service.updateMemberPermissions('conv-1', 'user-member', 'user-other', { can_send_messages: false, can_send_files: false })
      ).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('leaveConversation', () => {
    it('deve deletar sala quando owner sai e é o único membro', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-owner', role: 'owner' }))
      vi.mocked(repo.findMembers).mockResolvedValue([makeMember({ userId: 'user-owner', role: 'owner' })])
      vi.mocked(repo.delete).mockResolvedValue(undefined)

      await service.leaveConversation('conv-1', 'user-owner')

      expect(repo.delete).toHaveBeenCalledWith('conv-1')
    })

    it('deve promover admin mais antigo a owner quando owner sai', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-owner', role: 'owner' }))
      vi.mocked(repo.findMembers).mockResolvedValue([
        makeMember({ userId: 'user-owner', role: 'owner', joinedAt: new Date('2026-01-01') }),
        makeMember({ id: 'mem-2', userId: 'user-admin', role: 'admin', joinedAt: new Date('2026-01-02') }),
        makeMember({ id: 'mem-3', userId: 'user-member', role: 'member', joinedAt: new Date('2026-01-03') }),
      ])
      vi.mocked(repo.updateMember).mockResolvedValue(makeMember())
      vi.mocked(repo.removeMember).mockResolvedValue(undefined)

      await service.leaveConversation('conv-1', 'user-owner')

      expect(repo.updateMember).toHaveBeenCalledWith('conv-1', 'user-admin', { role: 'owner' })
      expect(repo.removeMember).toHaveBeenCalledWith('conv-1', 'user-owner')
      expect(repo.delete).not.toHaveBeenCalled()
    })

    it('deve promover membro mais antigo a owner quando owner sai e não há admins', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-owner', role: 'owner' }))
      vi.mocked(repo.findMembers).mockResolvedValue([
        makeMember({ userId: 'user-owner', role: 'owner', joinedAt: new Date('2026-01-01') }),
        makeMember({ id: 'mem-2', userId: 'user-member', role: 'member', joinedAt: new Date('2026-01-02') }),
      ])
      vi.mocked(repo.updateMember).mockResolvedValue(makeMember())
      vi.mocked(repo.removeMember).mockResolvedValue(undefined)

      await service.leaveConversation('conv-1', 'user-owner')

      expect(repo.updateMember).toHaveBeenCalledWith('conv-1', 'user-member', { role: 'owner' })
    })

    it('deve apenas remover membro não-owner da sala', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeConversation())
      vi.mocked(repo.findMember).mockResolvedValue(makeMember({ userId: 'user-member', role: 'member' }))
      vi.mocked(repo.removeMember).mockResolvedValue(undefined)

      await service.leaveConversation('conv-1', 'user-member')

      expect(repo.removeMember).toHaveBeenCalledWith('conv-1', 'user-member')
      expect(repo.delete).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Rodar testes para verificar que falham**

```bash
npx vitest run tests/modules/chat/conversations.service.test.ts
```

Expected: FAIL com "Cannot find module".

- [ ] **Implementar conversations.service.ts**

Criar `src/modules/chat/conversations.service.ts`:

```typescript
import type { IConversationsRepository, Conversation, ConversationMember, MemberPermissions, MemberRole, ConversationWithMeta } from '../../shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import { ChatError } from './chat.errors.js'

export class ConversationsService {
  constructor(
    private readonly repo: IConversationsRepository,
    private readonly friendsRepo: IFriendsRepository,
    private readonly storageService: IStorageService,
  ) {}

  async createGroup(userId: string, data: { name: string; description?: string }): Promise<Conversation> {
    const conversation = await this.repo.create({ type: 'group', name: data.name, description: data.description, createdBy: userId })
    await this.repo.addMember(conversation.id, userId, 'owner')
    return conversation
  }

  async openDirectDm(userId: string, friendId: string): Promise<Conversation> {
    const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, friendId)
    if (blocked) throw new ChatError('NOT_FOUND')
    const areFriends = await this.friendsRepo.areFriends(userId, friendId)
    if (!areFriends) throw new ChatError('NOT_FRIENDS')
    const existing = await this.repo.findExistingDm(userId, friendId)
    if (existing) return existing
    const conversation = await this.repo.create({ type: 'dm' })
    await this.repo.addMember(conversation.id, userId, 'member')
    await this.repo.addMember(conversation.id, friendId, 'member')
    return conversation
  }

  async getConversation(conversationId: string, userId: string): Promise<Conversation> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    return conversation
  }

  async updateGroup(conversationId: string, userId: string, data: { name?: string; description?: string }): Promise<Conversation> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member || !['owner', 'admin'].includes(member.role)) throw new ChatError('FORBIDDEN')
    return this.repo.update(conversationId, data)
  }

  async deleteGroup(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member || member.role !== 'owner') throw new ChatError('FORBIDDEN')
    await this.repo.delete(conversationId)
  }

  async uploadGroupCover(conversationId: string, userId: string, fileBuffer: Buffer, mimeType: string): Promise<Conversation> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member || !['owner', 'admin'].includes(member.role)) throw new ChatError('FORBIDDEN')
    const key = `chat/covers/${conversationId}.webp`
    const url = await this.storageService.upload(key, fileBuffer, 'image/webp')
    return this.repo.update(conversationId, { coverUrl: url })
  }

  async inviteMember(conversationId: string, callerId: string, targetUserId: string): Promise<ConversationMember> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const caller = await this.repo.findMember(conversationId, callerId)
    if (!caller || !['owner', 'admin'].includes(caller.role)) throw new ChatError('FORBIDDEN')
    const blocked = await this.friendsRepo.isBlockedEitherDirection(callerId, targetUserId)
    if (blocked) throw new ChatError('NOT_FOUND')
    const existingTarget = await this.repo.findMember(conversationId, targetUserId)
    if (existingTarget) throw new ChatError('ALREADY_MEMBER')
    return this.repo.addMember(conversationId, targetUserId, 'member')
  }

  async removeMember(conversationId: string, callerId: string, targetUserId: string): Promise<void> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const caller = await this.repo.findMember(conversationId, callerId)
    if (!caller || caller.role === 'member') throw new ChatError('FORBIDDEN')
    const target = await this.repo.findMember(conversationId, targetUserId)
    if (!target) throw new ChatError('NOT_FOUND')
    if (caller.role === 'admin' && target.role !== 'member') throw new ChatError('FORBIDDEN')
    await this.repo.removeMember(conversationId, targetUserId)
  }

  async updateMemberRole(conversationId: string, callerId: string, targetUserId: string, role: MemberRole): Promise<void> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const caller = await this.repo.findMember(conversationId, callerId)
    if (!caller || caller.role !== 'owner') throw new ChatError('FORBIDDEN')
    const target = await this.repo.findMember(conversationId, targetUserId)
    if (!target) throw new ChatError('NOT_FOUND')
    await this.repo.updateMember(conversationId, targetUserId, { role })
    if (role === 'owner') {
      await this.repo.updateMember(conversationId, callerId, { role: 'admin' })
    }
  }

  async updateMemberPermissions(conversationId: string, callerId: string, targetUserId: string, permissions: MemberPermissions): Promise<void> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const caller = await this.repo.findMember(conversationId, callerId)
    if (!caller || caller.role === 'member') throw new ChatError('FORBIDDEN')
    const target = await this.repo.findMember(conversationId, targetUserId)
    if (!target) throw new ChatError('NOT_FOUND')
    if (target.role === 'owner') throw new ChatError('FORBIDDEN')
    await this.repo.updateMember(conversationId, targetUserId, { permissions })
  }

  async leaveConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')

    if (member.role !== 'owner') {
      await this.repo.removeMember(conversationId, userId)
      return
    }

    const allMembers = await this.repo.findMembers(conversationId)
    const remaining = allMembers.filter(m => m.userId !== userId)

    if (remaining.length === 0) {
      await this.repo.delete(conversationId)
      return
    }

    const nextOwner =
      remaining.filter(m => m.role === 'admin').sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0]
      ?? remaining.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0]

    await this.repo.updateMember(conversationId, nextOwner.userId, { role: 'owner' })
    await this.repo.removeMember(conversationId, userId)
  }

  async listConversations(userId: string): Promise<ConversationWithMeta[]> {
    return this.repo.findUserConversations(userId)
  }

  async markAsRead(conversationId: string, userId: string): Promise<void> {
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    await this.repo.updateLastReadAt(conversationId, userId)
  }

  async getConversationIds(userId: string): Promise<string[]> {
    const members = await this.repo.findMembersByUserId(userId)
    return members.map(m => m.conversationId)
  }

  async getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    return this.repo.findMembers(conversationId)
  }
}
```

- [ ] **Rodar testes para verificar que passam**

```bash
npx vitest run tests/modules/chat/conversations.service.test.ts
```

Expected: todos os testes PASS.

- [ ] **Commit**

```bash
git add src/modules/chat/conversations.service.ts \
        tests/modules/chat/conversations.service.test.ts
git commit -m "feat: ConversationsService com TDD — grupos, DM direto, membros e roles"
```

---

### Task 2: ConversationsRepository

**Files:**
- Create: `src/modules/chat/conversations.repository.ts`

- [ ] **Implementar ConversationsRepository**

Criar `src/modules/chat/conversations.repository.ts`:

```typescript
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { conversations, conversationMembers, messages } from '../../shared/infra/database/schema.js'
import type {
  IConversationsRepository, Conversation, ConversationMember,
  MemberRole, MemberPermissions, ConversationWithMeta,
} from '../../shared/contracts/conversations.repository.contract.js'

export class ConversationsRepository implements IConversationsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: { type: 'dm' | 'group'; name?: string; description?: string; createdBy?: string }): Promise<Conversation> {
    const [row] = await this.db.insert(conversations).values({
      type: data.type,
      name: data.name ?? null,
      description: data.description ?? null,
      createdBy: data.createdBy ?? null,
    }).returning()
    return this.mapConv(row)
  }

  async findById(id: string): Promise<Conversation | null> {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.id, id)).limit(1)
    return row ? this.mapConv(row) : null
  }

  async update(id: string, data: { name?: string; description?: string; coverUrl?: string }): Promise<Conversation> {
    const [row] = await this.db.update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning()
    return this.mapConv(row)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(conversations).where(eq(conversations.id, id))
  }

  async addMember(conversationId: string, userId: string, role: MemberRole): Promise<ConversationMember> {
    const [row] = await this.db.insert(conversationMembers).values({ conversationId, userId, role }).returning()
    return this.mapMember(row)
  }

  async findMember(conversationId: string, userId: string): Promise<ConversationMember | null> {
    const [row] = await this.db.select().from(conversationMembers).where(
      and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId))
    ).limit(1)
    return row ? this.mapMember(row) : null
  }

  async updateMember(conversationId: string, userId: string, data: { role?: MemberRole; permissions?: MemberPermissions }): Promise<ConversationMember> {
    const [row] = await this.db.update(conversationMembers)
      .set(data)
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
      .returning()
    return this.mapMember(row)
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    await this.db.delete(conversationMembers).where(
      and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId))
    )
  }

  async findMembers(conversationId: string): Promise<ConversationMember[]> {
    const rows = await this.db.select().from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
    return rows.map(r => this.mapMember(r))
  }

  async findMembersByUserId(userId: string): Promise<ConversationMember[]> {
    const rows = await this.db.select().from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))
    return rows.map(r => this.mapMember(r))
  }

  async findExistingDm(userAId: string, userBId: string): Promise<Conversation | null> {
    const memberA = await this.db.select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers).where(eq(conversationMembers.userId, userAId))
    const memberB = await this.db.select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers).where(eq(conversationMembers.userId, userBId))
    const idsA = new Set(memberA.map(m => m.conversationId))
    const sharedId = memberB.map(m => m.conversationId).find(id => idsA.has(id))
    if (!sharedId) return null
    const [conv] = await this.db.select().from(conversations)
      .where(and(eq(conversations.id, sharedId), eq(conversations.type, 'dm'))).limit(1)
    return conv ? this.mapConv(conv) : null
  }

  async findUserConversations(userId: string): Promise<ConversationWithMeta[]> {
    const members = await this.db.select().from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))
    if (members.length === 0) return []

    const convIds = members.map(m => m.conversationId)
    const convRows = await this.db.select().from(conversations).where(inArray(conversations.id, convIds))

    const results: ConversationWithMeta[] = []
    for (const conv of convRows) {
      const member = members.find(m => m.conversationId === conv.id)!
      const [lastMsg] = await this.db.select({ content: messages.content, createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(sql`${messages.createdAt} DESC`)
        .limit(1)

      const unreadCount = member.lastReadAt
        ? await this.db.$count(messages, and(
            eq(messages.conversationId, conv.id),
            sql`${messages.createdAt} > ${member.lastReadAt}`,
            sql`${messages.deletedAt} IS NULL`,
          ))
        : await this.db.$count(messages, and(
            eq(messages.conversationId, conv.id),
            sql`${messages.deletedAt} IS NULL`,
          ))

      results.push({
        ...this.mapConv(conv),
        lastMessage: lastMsg ? { content: lastMsg.content, createdAt: lastMsg.createdAt } : null,
        unreadCount: Number(unreadCount),
      })
    }
    return results
  }

  async updateLastReadAt(conversationId: string, userId: string): Promise<void> {
    await this.db.update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
  }

  private mapConv(row: typeof conversations.$inferSelect): Conversation {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description,
      coverUrl: row.coverUrl,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private mapMember(row: typeof conversationMembers.$inferSelect): ConversationMember {
    return {
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      role: row.role,
      permissions: row.permissions as { can_send_messages: boolean; can_send_files: boolean },
      joinedAt: row.joinedAt,
      lastReadAt: row.lastReadAt,
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
git add src/modules/chat/conversations.repository.ts
git commit -m "feat: ConversationsRepository — implementação com Drizzle"
```
