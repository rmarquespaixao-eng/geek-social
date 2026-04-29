import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommentsService } from '../../../src/modules/posts/comments.service.js'
import type { ICommentsRepository, Comment } from '../../../src/shared/contracts/comments.repository.contract.js'
import type { IPostsRepository, Post } from '../../../src/shared/contracts/posts.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockCommentsRepo(): ICommentsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByPostId: vi.fn(),
  }
}

function createMockPostsRepo(): IPostsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMedia: vi.fn(),
    removeMedia: vi.fn(),
    findMediaById: vi.fn(),
    countMedia: vi.fn(),
  }
}

function createMockFriendsRepo(): IFriendsRepository {
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

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1', userId: 'author-1', type: 'manual', content: 'texto',
    visibility: 'public', itemId: null, collectionId: null, media: [],
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-1', postId: 'post-1', userId: 'commenter-1',
    content: 'ótimo post!', createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

describe('CommentsService', () => {
  let commentsRepo: ICommentsRepository
  let postsRepo: IPostsRepository
  let friendsRepo: IFriendsRepository
  let service: CommentsService

  beforeEach(() => {
    commentsRepo = createMockCommentsRepo()
    postsRepo = createMockPostsRepo()
    friendsRepo = createMockFriendsRepo()
    service = new CommentsService(commentsRepo, postsRepo, friendsRepo)
    vi.clearAllMocks()
  })

  describe('addComment', () => {
    it('deve adicionar comentário em post público', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost())
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(commentsRepo.create).mockResolvedValue(makeComment())

      const result = await service.addComment('commenter-1', 'post-1', 'ótimo post!')

      expect(commentsRepo.create).toHaveBeenCalledWith('post-1', 'commenter-1', 'ótimo post!')
      expect(result.content).toBe('ótimo post!')
    })

    it('deve lançar NOT_FOUND para post private de outro usuário', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ visibility: 'private', userId: 'author-1' }))

      await expect(service.addComment('commenter-1', 'post-1', 'oi')).rejects.toThrow('NOT_FOUND')
      expect(commentsRepo.create).not.toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND para post de usuário bloqueado', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.addComment('commenter-1', 'post-1', 'oi')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND para post inexistente', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(null)

      await expect(service.addComment('commenter-1', 'nao-existe', 'oi')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('updateComment', () => {
    it('deve editar comentário do próprio autor', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))
      vi.mocked(commentsRepo.update).mockResolvedValue(makeComment({ content: 'editado' }))

      const result = await service.updateComment('commenter-1', 'post-1', 'comment-1', 'editado')

      expect(commentsRepo.update).toHaveBeenCalledWith('comment-1', 'editado')
      expect(result.content).toBe('editado')
    })

    it('deve lançar FORBIDDEN para comentário de outro usuário', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))

      await expect(service.updateComment('outro-user', 'post-1', 'comment-1', 'editado')).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('listComments', () => {
    it('deve listar comentários de post público sem cursor', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ visibility: 'public', userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(commentsRepo.findByPostId).mockResolvedValue({
        comments: [makeComment()],
        nextCursor: null,
      })

      const result = await service.listComments('viewer-1', 'post-1', undefined, 20)

      expect(commentsRepo.findByPostId).toHaveBeenCalledWith('post-1', undefined, 20)
      expect(result.comments).toHaveLength(1)
      expect(result.nextCursor).toBeNull()
    })

    it('deve decodificar cursor e retornar nextCursor codificado', async () => {
      const cursorDate = new Date('2026-01-01T10:00:00Z')
      const cursorId = 'comment-abc'
      const cursorToken = Buffer.from(JSON.stringify({ createdAt: cursorDate.toISOString(), id: cursorId })).toString('base64')

      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ visibility: 'public', userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(commentsRepo.findByPostId).mockResolvedValue({
        comments: [],
        nextCursor: { createdAt: cursorDate, id: 'next-comment' },
      })

      const result = await service.listComments('viewer-1', 'post-1', cursorToken, 20)

      expect(commentsRepo.findByPostId).toHaveBeenCalledWith(
        'post-1',
        { createdAt: cursorDate, id: cursorId },
        20,
      )
      const decoded = JSON.parse(Buffer.from(result.nextCursor!, 'base64').toString())
      expect(decoded.id).toBe('next-comment')
    })

    it('deve lançar NOT_FOUND para post de usuário bloqueado', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.listComments('viewer-1', 'post-1')).rejects.toThrow('NOT_FOUND')
      expect(commentsRepo.findByPostId).not.toHaveBeenCalled()
    })
  })

  describe('deleteComment', () => {
    it('deve deletar comentário pelo próprio autor', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(commentsRepo.delete).mockResolvedValue()

      await service.deleteComment('commenter-1', 'post-1', 'comment-1')

      expect(commentsRepo.delete).toHaveBeenCalledWith('comment-1')
    })

    it('deve deletar comentário pelo autor do post', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(commentsRepo.delete).mockResolvedValue()

      await service.deleteComment('author-1', 'post-1', 'comment-1')

      expect(commentsRepo.delete).toHaveBeenCalledWith('comment-1')
    })

    it('deve lançar FORBIDDEN para terceiro', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))

      await expect(service.deleteComment('terceiro', 'post-1', 'comment-1')).rejects.toThrow('FORBIDDEN')
    })
  })
})
