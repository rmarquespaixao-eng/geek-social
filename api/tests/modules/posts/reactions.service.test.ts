import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactionsService } from '../../../src/modules/posts/reactions.service.js'
import type { IReactionsRepository, Reaction, ReactionCounts } from '../../../src/shared/contracts/reactions.repository.contract.js'
import type { IPostsRepository, Post } from '../../../src/shared/contracts/posts.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockReactionsRepo(): IReactionsRepository {
  return {
    upsert: vi.fn(),
    delete: vi.fn(),
    findByPostAndUser: vi.fn(),
    countsByPostId: vi.fn(),
  }
}

function createMockPostsRepo(): IPostsRepository {
  return {
    create: vi.fn(), findById: vi.fn(), update: vi.fn(), delete: vi.fn(),
    addMedia: vi.fn(), removeMedia: vi.fn(), findMediaById: vi.fn(), countMedia: vi.fn(),
  }
}

function createMockFriendsRepo(): IFriendsRepository {
  return {
    createRequest: vi.fn(), findRequestById: vi.fn(), findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(), findSentRequests: vi.fn(), updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(), areFriends: vi.fn(), removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(), deleteBlock: vi.fn(), isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(), findBlocksByBlocker: vi.fn(),
    findAllBlockRelationUserIds: vi.fn(),
  }
}

const emptyCounts: ReactionCounts = { power_up: 0, epic: 0, critical: 0, loot: 0, gg: 0 }

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1', userId: 'author-1', type: 'manual', content: 'texto',
    visibility: 'public', itemId: null, collectionId: null, media: [],
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

function makeReaction(overrides: Partial<Reaction> = {}): Reaction {
  return { id: 'r-1', postId: 'post-1', userId: 'user-2', type: 'epic', createdAt: new Date(), ...overrides }
}

describe('ReactionsService', () => {
  let reactionsRepo: IReactionsRepository
  let postsRepo: IPostsRepository
  let friendsRepo: IFriendsRepository
  let service: ReactionsService

  beforeEach(() => {
    reactionsRepo = createMockReactionsRepo()
    postsRepo = createMockPostsRepo()
    friendsRepo = createMockFriendsRepo()
    service = new ReactionsService(reactionsRepo, postsRepo, friendsRepo)
    vi.clearAllMocks()
  })

  describe('react', () => {
    it('deve adicionar reação em post de terceiro', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(reactionsRepo.upsert).mockResolvedValue(makeReaction({ type: 'epic' }))
      vi.mocked(reactionsRepo.countsByPostId).mockResolvedValue({ ...emptyCounts, epic: 1 })

      const result = await service.react('user-2', 'post-1', 'epic')

      expect(reactionsRepo.upsert).toHaveBeenCalledWith('post-1', 'user-2', 'epic')
      expect(result.epic).toBe(1)
    })

    it('deve trocar reação (upsert)', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(reactionsRepo.upsert).mockResolvedValue(makeReaction({ type: 'gg' }))
      vi.mocked(reactionsRepo.countsByPostId).mockResolvedValue({ ...emptyCounts, gg: 1 })

      const result = await service.react('user-2', 'post-1', 'gg')

      expect(reactionsRepo.upsert).toHaveBeenCalledWith('post-1', 'user-2', 'gg')
      expect(result.gg).toBe(1)
    })

    it('deve lançar SELF_REACTION ao reagir no próprio post', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))

      await expect(service.react('user-1', 'post-1', 'epic')).rejects.toThrow('SELF_REACTION')
      expect(reactionsRepo.upsert).not.toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND para post de usuário bloqueado', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.react('user-2', 'post-1', 'epic')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('removeReaction', () => {
    it('deve remover reação existente', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost())
      vi.mocked(reactionsRepo.delete).mockResolvedValue()

      await service.removeReaction('user-2', 'post-1')

      expect(reactionsRepo.delete).toHaveBeenCalledWith('post-1', 'user-2')
    })
  })

  describe('getReactions', () => {
    it('deve retornar contagens e reação do viewer', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost())
      vi.mocked(reactionsRepo.countsByPostId).mockResolvedValue({ ...emptyCounts, power_up: 3 })
      vi.mocked(reactionsRepo.findByPostAndUser).mockResolvedValue(makeReaction({ type: 'power_up' }))

      const result = await service.getReactions('post-1', 'user-2')

      expect(result.counts.power_up).toBe(3)
      expect(result.myReaction).toBe('power_up')
    })

    it('deve retornar myReaction null para viewer não autenticado', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost())
      vi.mocked(reactionsRepo.countsByPostId).mockResolvedValue({ ...emptyCounts })

      const result = await service.getReactions('post-1', null)

      expect(result.myReaction).toBeNull()
      expect(reactionsRepo.findByPostAndUser).not.toHaveBeenCalled()
    })
  })
})
