import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TopicsService } from '../../../src/modules/communities/topics.service.js'
import type { TopicsRepository, TopicMetaRow } from '../../../src/modules/communities/topics.repository.js'
import type { CommunitiesService } from '../../../src/modules/communities/communities.service.js'
import type { IPostsRepository, Post } from '../../../src/shared/contracts/posts.repository.contract.js'
import type { CommunityRow } from '../../../src/modules/communities/communities.repository.js'
import { CommunitiesError } from '../../../src/modules/communities/communities.errors.js'

const NOW = new Date('2026-01-01T00:00:00Z')

function makeCommunity(overrides: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: 'c1', slug: 'test', name: 'Test', description: 'Desc', category: 'rpg-mesa',
    iconUrl: 'https://cdn/icon.webp', coverUrl: 'https://cdn/cover.webp', visibility: 'public',
    ownerId: 'owner-1', memberCount: 1, topicCount: 0, rules: null, welcomeMessage: null,
    deletedAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  }
}

function makePost(overrides = {}): Post {
  return {
    id: 'post-1', userId: 'user-1', type: 'manual', content: 'Hello community!',
    visibility: 'public', itemId: null, collectionId: null, communityId: 'c1',
    deletedAt: null, media: [], createdAt: NOW, updatedAt: NOW, ...overrides,
  }
}

function makeMeta(overrides = {}): TopicMetaRow {
  return {
    postId: 'post-1', communityId: 'c1', pinned: false, locked: false,
    pinnedAt: null, lockedAt: null, movedFromCommunityId: null, createdAt: NOW, ...overrides,
  }
}

function makeTopicRow(overrides = {}) {
  return {
    postId: 'post-1', communityId: 'c1', authorId: 'user-1', authorName: 'User One',
    authorAvatarUrl: null, content: 'Hello', pinned: false, locked: false,
    movedFromCommunityId: null, reactionCount: 0, commentCount: 0,
    createdAt: NOW, updatedAt: NOW, ...overrides,
  }
}

function mockDb() {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const exec = {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([makeMeta()]),
        set: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      }
      return fn(exec)
    }),
  }
}

function mockTopicsRepo(): TopicsRepository {
  return {
    findByCommunity: vi.fn().mockResolvedValue({ topics: [], nextCursor: null }),
    findTopicById: vi.fn().mockResolvedValue(null),
    findMetaByPostId: vi.fn().mockResolvedValue(null),
    insertMeta: vi.fn().mockResolvedValue(makeMeta()),
    setPinned: vi.fn().mockResolvedValue(makeMeta()),
    setLocked: vi.fn().mockResolvedValue(makeMeta()),
    setMovedFrom: vi.fn().mockResolvedValue(makeMeta()),
    softDeletePost: vi.fn().mockResolvedValue(undefined),
  } as unknown as TopicsRepository
}

function mockPostsRepo(): IPostsRepository {
  return {
    create: vi.fn().mockResolvedValue(makePost()),
    findById: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    delete: vi.fn(),
    addMedia: vi.fn(),
    removeMedia: vi.fn(),
    findMediaById: vi.fn(),
    countMedia: vi.fn(),
    maxMediaOrder: vi.fn(),
  }
}

function mockCommunitiesService(): CommunitiesService {
  return {
    createCommunity: vi.fn(),
    updateCommunity: vi.fn(),
    softDeleteCommunity: vi.fn(),
    getForViewer: vi.fn().mockResolvedValue(makeCommunity()),
    assertCanView: vi.fn().mockResolvedValue(undefined),
    assertNotBanned: vi.fn().mockResolvedValue(undefined),
    isPrivateNonMember: vi.fn().mockResolvedValue(false),
    listOwned: vi.fn(),
    listJoined: vi.fn(),
    listDiscover: vi.fn(),
  } as unknown as CommunitiesService
}

describe('TopicsService', () => {
  let topicsRepo: ReturnType<typeof mockTopicsRepo>
  let postsRepo: ReturnType<typeof mockPostsRepo>
  let commService: ReturnType<typeof mockCommunitiesService>
  let db: ReturnType<typeof mockDb>
  let service: TopicsService

  beforeEach(() => {
    topicsRepo = mockTopicsRepo()
    postsRepo = mockPostsRepo()
    commService = mockCommunitiesService()
    db = mockDb()
    service = new TopicsService(db as any, topicsRepo, postsRepo, commService)
  })

  describe('createTopic', () => {
    it('delegates to postsRepo.create with communityId', async () => {
      vi.mocked(postsRepo.create).mockResolvedValue(makePost())
      vi.mocked(topicsRepo.insertMeta).mockResolvedValue(makeMeta())

      await service.createTopic('user-1', 'c1', { content: 'Hello', visibility: 'public' })

      expect(postsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ communityId: 'c1', userId: 'user-1' }),
      )
    })

    it('inserts topic meta after creating post', async () => {
      vi.mocked(postsRepo.create).mockResolvedValue(makePost({ id: 'post-1' }))
      vi.mocked(topicsRepo.insertMeta).mockResolvedValue(makeMeta())

      await service.createTopic('user-1', 'c1', { content: 'Hello', visibility: 'public' })

      expect(topicsRepo.insertMeta).toHaveBeenCalledWith('post-1', 'c1', expect.anything())
    })

    it('blocks banned users (calls assertNotBanned)', async () => {
      vi.mocked(commService.assertNotBanned).mockRejectedValue(
        new CommunitiesError('BANNED'),
      )

      await expect(
        service.createTopic('banned-user', 'c1', { content: 'Hi', visibility: 'public' }),
      ).rejects.toMatchObject({ code: 'BANNED' })

      expect(postsRepo.create).not.toHaveBeenCalled()
    })
  })

  describe('listTopics', () => {
    it('returns paginated topics ordered by pinned DESC, createdAt DESC', async () => {
      const pinnedTopic = makeTopicRow({ postId: 'pinned', pinned: true, createdAt: new Date('2026-01-02') })
      const regularTopic = makeTopicRow({ postId: 'regular', pinned: false, createdAt: new Date('2026-01-01') })

      vi.mocked(topicsRepo.findByCommunity).mockResolvedValue({
        topics: [pinnedTopic, regularTopic],
        nextCursor: null,
      })

      const result = await service.listTopics('c1', 'viewer-1', { limit: 20 })

      expect(result.topics[0].pinned).toBe(true)
      expect(result.topics[1].pinned).toBe(false)
    })

    it('visibility private community → assertCanView is called', async () => {
      vi.mocked(commService.getForViewer).mockResolvedValue(makeCommunity({ visibility: 'private' }))
      vi.mocked(topicsRepo.findByCommunity).mockResolvedValue({ topics: [], nextCursor: null })

      await service.listTopics('c1', 'viewer-1', { limit: 20 })

      expect(commService.assertCanView).toHaveBeenCalled()
    })
  })

  describe('getTopicWithMeta', () => {
    it('throws TOPIC_NOT_FOUND if topic does not exist', async () => {
      vi.mocked(topicsRepo.findTopicById).mockResolvedValue(null)

      await expect(service.getTopicWithMeta('missing-id', 'viewer-1')).rejects.toMatchObject({
        code: 'TOPIC_NOT_FOUND',
      })
    })

    it('returns topic + meta', async () => {
      vi.mocked(topicsRepo.findTopicById).mockResolvedValue(makeTopicRow())
      vi.mocked(topicsRepo.findMetaByPostId).mockResolvedValue(makeMeta())

      const { topic, meta } = await service.getTopicWithMeta('post-1', 'viewer-1')

      expect(topic.postId).toBe('post-1')
      expect(meta.communityId).toBe('c1')
    })
  })
})
