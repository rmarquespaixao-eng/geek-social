import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeedService } from '../../../src/modules/posts/feed.service.js'
import type { IFeedRepository, FeedCursor } from '../../../src/shared/contracts/feed.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'
import type { Post } from '../../../src/shared/contracts/posts.repository.contract.js'

function createMockFeedRepo(): IFeedRepository {
  return {
    getFeed: vi.fn(),
    getProfilePosts: vi.fn(),
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

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1', userId: 'user-1', type: 'manual', content: 'texto',
    visibility: 'public', itemId: null, collectionId: null, media: [],
    createdAt: new Date('2026-01-01T10:00:00Z'), updatedAt: new Date(), ...overrides,
  }
}

describe('FeedService', () => {
  let feedRepo: IFeedRepository
  let friendsRepo: IFriendsRepository
  let service: FeedService

  beforeEach(() => {
    feedRepo = createMockFeedRepo()
    friendsRepo = createMockFriendsRepo()
    service = new FeedService(feedRepo, friendsRepo)
    vi.clearAllMocks()
  })

  describe('getFeed', () => {
    it('deve repassar friendIds e blockedIds ao repositório', async () => {
      vi.mocked(friendsRepo.findFriendIds).mockResolvedValue(['friend-1'])
      vi.mocked(friendsRepo.findAllBlockRelationUserIds).mockResolvedValue(['blocked-1'])
      vi.mocked(feedRepo.getFeed).mockResolvedValue({ posts: [makePost()], nextCursor: null })

      const result = await service.getFeed('viewer-1', undefined, 20)

      expect(feedRepo.getFeed).toHaveBeenCalledWith({
        viewerId: 'viewer-1',
        friendIds: ['friend-1'],
        blockedIds: ['blocked-1'],
        cursor: undefined,
        limit: 20,
      })
      expect(result.posts).toHaveLength(1)
      expect(result.nextCursor).toBeNull()
    })

    it('deve decodificar cursor e repassar ao repositório', async () => {
      const cursor: FeedCursor = { createdAt: new Date('2026-01-01T10:00:00Z'), id: 'post-abc' }
      const token = Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString('base64')

      vi.mocked(friendsRepo.findFriendIds).mockResolvedValue([])
      vi.mocked(friendsRepo.findAllBlockRelationUserIds).mockResolvedValue([])
      vi.mocked(feedRepo.getFeed).mockResolvedValue({ posts: [], nextCursor: null })

      await service.getFeed('viewer-1', token, 20)

      expect(feedRepo.getFeed).toHaveBeenCalledWith(expect.objectContaining({
        cursor: { createdAt: cursor.createdAt, id: cursor.id },
      }))
    })

    it('deve retornar nextCursor codificado em base64', async () => {
      const nextCursor: FeedCursor = { createdAt: new Date('2026-01-01T09:00:00Z'), id: 'post-xyz' }
      vi.mocked(friendsRepo.findFriendIds).mockResolvedValue([])
      vi.mocked(friendsRepo.findAllBlockRelationUserIds).mockResolvedValue([])
      vi.mocked(feedRepo.getFeed).mockResolvedValue({ posts: [], nextCursor })

      const result = await service.getFeed('viewer-1', undefined, 20)

      const expected = Buffer.from(JSON.stringify({ createdAt: nextCursor.createdAt.toISOString(), id: nextCursor.id })).toString('base64')
      expect(result.nextCursor).toBe(expected)
    })
  })

  describe('getProfilePosts', () => {
    it('deve passar viewerIsFriend=true para amigos confirmados', async () => {
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)
      vi.mocked(feedRepo.getProfilePosts).mockResolvedValue({ posts: [], nextCursor: null })

      await service.getProfilePosts('owner-1', 'viewer-1', undefined, 20)

      expect(feedRepo.getProfilePosts).toHaveBeenCalledWith(expect.objectContaining({ viewerIsFriend: true }))
    })

    it('deve passar viewerIsFriend=false para não-amigos', async () => {
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)
      vi.mocked(feedRepo.getProfilePosts).mockResolvedValue({ posts: [], nextCursor: null })

      await service.getProfilePosts('owner-1', 'viewer-1', undefined, 20)

      expect(feedRepo.getProfilePosts).toHaveBeenCalledWith(expect.objectContaining({ viewerIsFriend: false }))
    })

    it('deve passar viewerIsFriend=false para viewer não autenticado', async () => {
      vi.mocked(feedRepo.getProfilePosts).mockResolvedValue({ posts: [], nextCursor: null })

      await service.getProfilePosts('owner-1', null, undefined, 20)

      expect(friendsRepo.areFriends).not.toHaveBeenCalled()
      expect(feedRepo.getProfilePosts).toHaveBeenCalledWith(expect.objectContaining({ viewerIsFriend: false }))
    })
  })
})
