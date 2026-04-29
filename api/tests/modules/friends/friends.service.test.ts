// tests/modules/friends/friends.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FriendsService } from '../../../src/modules/friends/friends.service.js'
import type { IFriendsRepository, Friendship, FriendUser, FriendRequestWithUser, BlockedUserInfo } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockFriendsRepository(): IFriendsRepository {
  return {
    createRequest: vi.fn(),
    findRequestById: vi.fn(),
    findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(),
    findSentRequests: vi.fn(),
    findReceivedRequestsWithUser: vi.fn(),
    findSentRequestsWithUser: vi.fn(),
    updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(),
    findFriends: vi.fn(),
    areFriends: vi.fn(),
    removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(),
    deleteBlock: vi.fn(),
    isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(),
    findBlocksByBlocker: vi.fn(),
    findBlocksByBlockerWithUser: vi.fn(),
    findAllBlockRelationUserIds: vi.fn(),
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

    it('deve lançar NOT_PENDING se o pedido já foi aceito', async () => {
      vi.mocked(repo.findRequestById).mockResolvedValue(createMockFriendship({ receiverId: 'user-b', status: 'accepted' }))

      await expect(service.rejectRequest('user-b', 'friendship-uuid-1'))
        .rejects.toThrow('NOT_PENDING')
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
    it('deve retornar lista de amigos com dados do usuário', async () => {
      const friends: FriendUser[] = [
        { id: 'user-b', displayName: 'User B', avatarUrl: null, isOnline: false, lastSeenAt: null },
      ]
      vi.mocked(repo.findFriends).mockResolvedValue(friends)

      const result = await service.listFriends('user-a')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('user-b')
    })
  })

  describe('listReceivedRequests', () => {
    it('deve retornar pedidos recebidos pendentes', async () => {
      const requests: FriendRequestWithUser[] = [
        { id: 'req-1', senderId: 'user-b', senderName: 'User B', senderAvatarUrl: null, receiverId: 'user-a', receiverName: 'User A', receiverAvatarUrl: null, status: 'pending', createdAt: new Date() },
      ]
      vi.mocked(repo.findReceivedRequestsWithUser).mockResolvedValue(requests)

      const result = await service.listReceivedRequests('user-a')

      expect(result).toHaveLength(1)
      expect(result[0].receiverId).toBe('user-a')
    })
  })

  describe('listSentRequests', () => {
    it('deve retornar pedidos enviados pendentes', async () => {
      const requests: FriendRequestWithUser[] = [
        { id: 'req-1', senderId: 'user-a', senderName: 'User A', senderAvatarUrl: null, receiverId: 'user-b', receiverName: 'User B', receiverAvatarUrl: null, status: 'pending', createdAt: new Date() },
      ]
      vi.mocked(repo.findSentRequestsWithUser).mockResolvedValue(requests)

      const result = await service.listSentRequests('user-a')

      expect(result).toHaveLength(1)
      expect(result[0].senderId).toBe('user-a')
    })
  })

  describe('listBlocks', () => {
    it('deve retornar lista de usuários bloqueados', async () => {
      const blocks: BlockedUserInfo[] = [{ id: 'user-b', displayName: 'User B', avatarUrl: null }]
      vi.mocked(repo.findBlocksByBlockerWithUser).mockResolvedValue(blocks)

      const result = await service.listBlocks('user-a')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('user-b')
    })
  })
})
