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

    it('deve lançar NOT_FOUND se pedido não existe', async () => {
      vi.mocked(repo.findById).mockResolvedValue(null)
      await expect(service.rejectRequest('req-1', 'user-b')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('listReceivedPending', () => {
    it('deve retornar lista de pedidos pendentes recebidos', async () => {
      const requests = [makeDmRequest(), makeDmRequest({ id: 'req-2' })]
      vi.mocked(repo.findReceivedPending).mockResolvedValue(requests)

      const result = await service.listReceivedPending('user-b')

      expect(repo.findReceivedPending).toHaveBeenCalledWith('user-b')
      expect(result).toHaveLength(2)
    })

    it('deve retornar lista vazia quando não há pedidos', async () => {
      vi.mocked(repo.findReceivedPending).mockResolvedValue([])

      const result = await service.listReceivedPending('user-b')

      expect(result).toHaveLength(0)
    })
  })
})
