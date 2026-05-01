import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-webp')),
  })),
}))

import { PostsService } from '../../../src/modules/posts/posts.service.js'
import type { IPostsRepository, Post, PostMedia } from '../../../src/shared/contracts/posts.repository.contract.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockPostsRepository(): IPostsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMedia: vi.fn(),
    removeMedia: vi.fn(),
    findMediaById: vi.fn(),
    countMedia: vi.fn(),
    maxMediaOrder: vi.fn(),
  }
}

function createMockFriendsRepository(): IFriendsRepository {
  return {
    createRequest: vi.fn(), findRequestById: vi.fn(), findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(), findSentRequests: vi.fn(), updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(), areFriends: vi.fn(), removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(), deleteBlock: vi.fn(), isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(), findBlocksByBlocker: vi.fn(),
    findAllBlockRelationUserIds: vi.fn(),
  }
}

function createMockStorageService(): IStorageService {
  return {
    upload: vi.fn(),
    delete: vi.fn(),
    keyFromUrl: vi.fn().mockReturnValue(null),
  }
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    userId: 'user-1',
    type: 'manual',
    content: 'Olá geeks!',
    visibility: 'public',
    itemId: null,
    collectionId: null,
    media: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('PostsService', () => {
  let repo: IPostsRepository
  let storage: IStorageService
  let friendsRepo: IFriendsRepository
  let service: PostsService

  beforeEach(() => {
    repo = createMockPostsRepository()
    storage = createMockStorageService()
    friendsRepo = createMockFriendsRepository()
    service = new PostsService(repo, storage, friendsRepo)
    vi.clearAllMocks()
  })

  describe('createPost', () => {
    it('deve criar post manual com visibilidade public', async () => {
      vi.mocked(repo.create).mockResolvedValue(makePost())

      const result = await service.createPost('user-1', { content: 'Olá geeks!', visibility: 'public' })

      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'manual',
        content: 'Olá geeks!',
        visibility: 'public',
        itemId: null,
        collectionId: null,
      })
      expect(result.type).toBe('manual')
    })

    it('deve criar post com visibilidade friends_only', async () => {
      vi.mocked(repo.create).mockResolvedValue(makePost({ visibility: 'friends_only' }))

      await service.createPost('user-1', { visibility: 'friends_only' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'friends_only' }))
    })
  })

  describe('createItemShare', () => {
    it('deve criar post item_share com visibilidade da coleção', async () => {
      vi.mocked(repo.create).mockResolvedValue(makePost({ type: 'item_share', visibility: 'public' }))

      await service.createItemShare({
        userId: 'user-1',
        itemId: 'item-1',
        collectionId: 'col-1',
        collectionVisibility: 'public',
      })

      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'item_share',
        content: null,
        visibility: 'public',
        itemId: 'item-1',
        collectionId: 'col-1',
      })
    })

    it('deve criar item_share com friends_only quando coleção é friends_only', async () => {
      vi.mocked(repo.create).mockResolvedValue(makePost({ type: 'item_share', visibility: 'friends_only' }))

      await service.createItemShare({
        userId: 'user-1',
        itemId: 'item-1',
        collectionId: 'col-1',
        collectionVisibility: 'friends_only',
      })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'friends_only' }))
    })

    it('não deve criar post quando coleção é private', async () => {
      await service.createItemShare({
        userId: 'user-1',
        itemId: 'item-1',
        collectionId: 'col-1',
        collectionVisibility: 'private',
      })

      expect(repo.create).not.toHaveBeenCalled()
    })
  })

  describe('getPost', () => {
    it('deve retornar post existente para o próprio autor (private)', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ visibility: 'private', userId: 'user-1' }))

      const result = await service.getPost('post-1', 'user-1')

      expect(result.id).toBe('post-1')
    })

    it('deve lançar NOT_FOUND para post private de outro usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ visibility: 'private', userId: 'user-1' }))

      await expect(service.getPost('post-1', 'user-2')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND para post inexistente', async () => {
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(service.getPost('nao-existe', 'user-1')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND para post de usuário bloqueado', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-other', visibility: 'public' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.getPost('post-1', 'user-1')).rejects.toThrow('NOT_FOUND')
    })

    it('deve retornar post friends_only quando viewer é amigo do autor', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-other', visibility: 'friends_only' }))
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)

      const result = await service.getPost('post-1', 'user-1')

      expect(result.id).toBe('post-1')
      expect(friendsRepo.areFriends).toHaveBeenCalledWith('user-1', 'user-other')
    })

    it('deve lançar NOT_FOUND para post friends_only quando viewer não é amigo', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-other', visibility: 'friends_only' }))
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)

      await expect(service.getPost('post-1', 'user-1')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('updatePost', () => {
    it('deve editar conteúdo do post manual', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1', type: 'manual' }))
      vi.mocked(repo.update).mockResolvedValue(makePost({ content: 'novo conteúdo' }))

      const result = await service.updatePost('user-1', 'post-1', { content: 'novo conteúdo' })

      expect(repo.update).toHaveBeenCalledWith('post-1', { content: 'novo conteúdo' })
      expect(result.content).toBe('novo conteúdo')
    })

    it('deve lançar NOT_FOUND para post de outro usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))

      await expect(service.updatePost('user-2', 'post-1', {})).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar CANNOT_EDIT_ITEM_SHARE para posts automáticos', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1', type: 'item_share' }))

      await expect(service.updatePost('user-1', 'post-1', {})).rejects.toThrow('CANNOT_EDIT_ITEM_SHARE')
    })
  })

  describe('deletePost', () => {
    it('deve deletar post do próprio autor', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))
      vi.mocked(repo.delete).mockResolvedValue()

      await service.deletePost('user-1', 'post-1')

      expect(repo.delete).toHaveBeenCalledWith('post-1')
    })

    it('deve lançar NOT_FOUND para post de outro usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))

      await expect(service.deletePost('user-2', 'post-1')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('addMedia', () => {
    it('deve fazer upload e adicionar mídia ao post', async () => {
      vi.mocked(repo.findById)
        .mockResolvedValueOnce(makePost({ userId: 'user-1' }))
        .mockResolvedValueOnce(makePost({ userId: 'user-1', media: [{ id: 'm-1', postId: 'post-1', url: 'https://s3/img.webp', displayOrder: 0 }] }))
      vi.mocked(repo.countMedia).mockResolvedValue(0)
      vi.mocked(repo.maxMediaOrder).mockResolvedValue(-1)
      vi.mocked(storage.upload).mockResolvedValue('https://s3/img.webp')
      vi.mocked(repo.addMedia).mockResolvedValue({ id: 'm-1', postId: 'post-1', url: 'https://s3/img.webp', displayOrder: 0 })

      const result = await service.addMedia('user-1', 'post-1', [
        { buffer: Buffer.from('fake-image'), mimeType: 'image/jpeg', filename: 'test.jpg' }
      ])

      expect(storage.upload).toHaveBeenCalledTimes(1)
      expect(repo.addMedia).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })

    it('deve lançar MEDIA_LIMIT_EXCEEDED ao tentar adicionar a 5ª imagem', async () => {
      vi.mocked(repo.findById).mockResolvedValueOnce(makePost({ userId: 'user-1' }))
      vi.mocked(repo.countMedia).mockResolvedValue(8)

      await expect(
        service.addMedia('user-1', 'post-1', [{ buffer: Buffer.from('img'), mimeType: 'image/jpeg', filename: 'test.jpg' }])
      ).rejects.toThrow('MEDIA_LIMIT_EXCEEDED')

      expect(storage.upload).not.toHaveBeenCalled()
    })

    it('deve rejeitar MIME type de imagem não suportado', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))
      vi.mocked(repo.countMedia).mockResolvedValue(0)

      await expect(
        service.addMedia('user-1', 'post-1', [{ buffer: Buffer.from('img'), mimeType: 'application/pdf', filename: 'test.pdf' }])
      ).rejects.toThrow('UNSUPPORTED_MEDIA_FORMAT')

      expect(storage.upload).not.toHaveBeenCalled()
    })

    it('deve rejeitar imagem acima de 5MB', async () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024)
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))
      vi.mocked(repo.countMedia).mockResolvedValue(0)

      await expect(
        service.addMedia('user-1', 'post-1', [{ buffer: largeBuffer, mimeType: 'image/jpeg', filename: 'large.jpg' }])
      ).rejects.toThrow('MEDIA_TOO_LARGE')

      expect(storage.upload).not.toHaveBeenCalled()
    })

    it('deve permitir imagens nos formatos: jpeg, png, gif, webp', async () => {
      const mimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      for (const mimeType of mimeTypes) {
        vi.mocked(repo.findById)
          .mockResolvedValueOnce(makePost({ userId: 'user-1' }))
          .mockResolvedValueOnce(makePost({ userId: 'user-1', media: [] }))
        vi.mocked(repo.countMedia).mockResolvedValue(0)
        vi.mocked(repo.maxMediaOrder).mockResolvedValue(-1)
        vi.mocked(storage.upload).mockResolvedValue('https://s3/img.webp')
        vi.mocked(repo.addMedia).mockResolvedValue({ id: 'm-1', postId: 'post-1', url: 'https://s3/img.webp', displayOrder: 0 })

        await expect(
          service.addMedia('user-1', 'post-1', [{ buffer: Buffer.from('img'), mimeType, filename: 'test' }])
        ).resolves.toBeDefined()
      }
    })
  })

  describe('removeMedia', () => {
    it('deve remover mídia quando post e mídia pertencem ao usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))
      vi.mocked(repo.findMediaById).mockResolvedValue({ id: 'media-1', postId: 'post-1', url: 'https://s3/img.webp', displayOrder: 0 })
      vi.mocked(repo.removeMedia).mockResolvedValue()

      await service.removeMedia('user-1', 'post-1', 'media-1')

      expect(repo.removeMedia).toHaveBeenCalledWith('media-1')
    })

    it('deve lançar NOT_FOUND quando post pertence a outro usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))

      await expect(service.removeMedia('user-2', 'post-1', 'media-1')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND quando mídia não pertence ao post', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))
      vi.mocked(repo.findMediaById).mockResolvedValue({ id: 'media-1', postId: 'outro-post', url: 'https://s3/img.webp', displayOrder: 0 })

      await expect(service.removeMedia('user-1', 'post-1', 'media-1')).rejects.toThrow('NOT_FOUND')
    })
  })
})
