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
    setTemporary: vi.fn(),
    findTemporaryDms: vi.fn(),
  } as unknown as IConversationsRepository
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
    keyFromUrl: vi.fn().mockReturnValue(null),
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

  describe('getConversationIds', () => {
    it('deve retornar lista de ids das conversas do usuário', async () => {
      vi.mocked(repo.findMembersByUserId).mockResolvedValue([
        makeMember({ conversationId: 'conv-1' }),
        makeMember({ id: 'mem-2', conversationId: 'conv-2' }),
      ])

      const result = await service.getConversationIds('user-1')

      expect(repo.findMembersByUserId).toHaveBeenCalledWith('user-1')
      expect(result).toEqual(['conv-1', 'conv-2'])
    })
  })

  describe('getConversationMembers', () => {
    it('deve retornar membros de uma conversa', async () => {
      vi.mocked(repo.findMembers).mockResolvedValue([makeMember(), makeMember({ id: 'mem-2', userId: 'user-2' })])

      const result = await service.getConversationMembers('conv-1')

      expect(repo.findMembers).toHaveBeenCalledWith('conv-1')
      expect(result).toHaveLength(2)
    })
  })

  describe('listConversations', () => {
    it('deve delegar para repo.findUserConversations', async () => {
      vi.mocked(repo.findUserConversations).mockResolvedValue([])

      const result = await service.listConversations('user-1')

      expect(repo.findUserConversations).toHaveBeenCalledWith('user-1')
      expect(result).toEqual([])
    })
  })

  describe('markAsRead', () => {
    it('deve atualizar last_read_at quando usuário é membro', async () => {
      vi.mocked(repo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.updateLastReadAt).mockResolvedValue(undefined)

      await service.markAsRead('conv-1', 'user-1')

      expect(repo.updateLastReadAt).toHaveBeenCalledWith('conv-1', 'user-1')
    })

    it('deve lançar NOT_FOUND se usuário não é membro', async () => {
      vi.mocked(repo.findMember).mockResolvedValue(null)

      await expect(service.markAsRead('conv-1', 'user-1')).rejects.toThrow('NOT_FOUND')
    })
  })
})
