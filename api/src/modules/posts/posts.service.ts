import sharp from 'sharp'
import { extractThumbnail } from '../../shared/infra/video/video.processor.js'
import { randomUUID } from 'node:crypto'
import type { IPostsRepository, Post, PostMedia } from '../../shared/contracts/posts.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { IPostsService, ItemShareParams } from '../../shared/contracts/posts.service.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { IFeedRepository, EnrichedPost } from '../../shared/contracts/feed.repository.contract.js'
import type { CreatePostInput, UpdatePostInput } from './posts.schema.js'

export class PostsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'PostsError'
  }
}

export class PostsService implements IPostsService {
  constructor(
    private readonly repo: IPostsRepository,
    private readonly storageService?: IStorageService,
    private readonly friendsRepo?: IFriendsRepository,
    private readonly feedRepo?: IFeedRepository,
  ) {}

  async createPost(userId: string, input: CreatePostInput): Promise<EnrichedPost | Post> {
    const post = await this.repo.create({
      userId,
      type: 'manual',
      content: input.content ?? null,
      visibility: input.visibility,
      itemId: null,
      collectionId: null,
    })
    if (this.feedRepo) {
      return (await this.feedRepo.findEnrichedById(post.id, userId)) ?? post
    }
    return post
  }

  async createItemShare(params: ItemShareParams): Promise<void> {
    if (params.collectionVisibility === 'private') return
    const visibility = params.collectionVisibility === 'friends_only' ? 'friends_only' as const : 'public' as const
    await this.repo.create({
      userId: params.userId,
      type: 'item_share',
      content: null,
      visibility,
      itemId: params.itemId,
      collectionId: params.collectionId,
    })
  }

  async getPost(id: string, viewerId: string): Promise<EnrichedPost | Post> {
    const post = await this.repo.findById(id)
    if (!post) throw new PostsError('NOT_FOUND')
    if (post.visibility === 'private' && post.userId !== viewerId) throw new PostsError('NOT_FOUND')
    if (post.visibility === 'friends_only' && post.userId !== viewerId) {
      if (!this.friendsRepo) throw new PostsError('NOT_FOUND')
      const areFriends = await this.friendsRepo.areFriends(viewerId, post.userId)
      if (!areFriends) throw new PostsError('NOT_FOUND')
    }
    if (this.friendsRepo && post.userId !== viewerId) {
      const blocked = await this.friendsRepo.isBlockedEitherDirection(viewerId, post.userId)
      if (blocked) throw new PostsError('NOT_FOUND')
    }
    if (this.feedRepo) {
      return (await this.feedRepo.findEnrichedById(id, viewerId)) ?? post
    }
    return post
  }

  async updatePost(userId: string, postId: string, input: UpdatePostInput): Promise<EnrichedPost | Post> {
    const post = await this.repo.findById(postId)
    if (!post || post.userId !== userId) throw new PostsError('NOT_FOUND')
    if (post.type === 'item_share') throw new PostsError('CANNOT_EDIT_ITEM_SHARE')
    await this.repo.update(postId, input)
    if (this.feedRepo) {
      return (await this.feedRepo.findEnrichedById(postId, userId)) ?? post
    }
    return this.repo.update(postId, input)
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    const post = await this.repo.findById(postId)
    if (!post || post.userId !== userId) throw new PostsError('NOT_FOUND')
    await this.repo.delete(postId)
  }

  async addMedia(
    userId: string,
    postId: string,
    files: Array<{ buffer: Buffer; mimeType: string; filename: string }>,
  ): Promise<EnrichedPost | PostMedia[]> {
    if (!this.storageService) throw new PostsError('STORAGE_NOT_CONFIGURED')
    const post = await this.repo.findById(postId)
    if (!post || post.userId !== userId) throw new PostsError('NOT_FOUND')
    const currentCount = await this.repo.countMedia(postId)
    if (currentCount + files.length > 8) throw new PostsError('MEDIA_LIMIT_EXCEEDED')
    const maxOrder = await this.repo.maxMediaOrder(postId)

    const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
    const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
    const VIDEO_EXT: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
    }
    const IMAGE_MAX = 5 * 1024 * 1024
    const VIDEO_MAX = 50 * 1024 * 1024

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const isImage = ALLOWED_IMAGE.has(f.mimeType)
      const isVideo = ALLOWED_VIDEO.has(f.mimeType)

      let url: string
      if (isImage) {
        if (f.buffer.length > IMAGE_MAX) throw new PostsError('MEDIA_TOO_LARGE')
        const webp = await sharp(f.buffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer()
        const key = `posts/${postId}/media/${randomUUID()}.webp`
        url = await this.storageService.upload(key, webp, 'image/webp')
      } else if (isVideo) {
        if (f.buffer.length > VIDEO_MAX) throw new PostsError('MEDIA_TOO_LARGE')
        const ext = VIDEO_EXT[f.mimeType]
        const key = `posts/${postId}/media/${randomUUID()}.${ext}`
        url = await this.storageService.upload(key, f.buffer, f.mimeType)

        // Extrai thumbnail (ignora falha — vídeo já foi salvo)
        let thumbUrl: string | null = null
        try {
          const thumbBuf = await extractThumbnail(f.buffer, ext)
          if (thumbBuf) {
            const optimized = await sharp(thumbBuf)
              .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 80 })
              .toBuffer()
            const thumbKey = `posts/${postId}/media/${randomUUID()}.thumb.webp`
            thumbUrl = await this.storageService.upload(thumbKey, optimized, 'image/webp')
          }
        } catch { /* sem thumb, segue */ }

        await this.repo.addMedia(postId, url, maxOrder + 1 + i, thumbUrl)
        continue
      } else {
        throw new PostsError('UNSUPPORTED_MEDIA_FORMAT')
      }
      await this.repo.addMedia(postId, url, maxOrder + 1 + i)
    }
    if (this.feedRepo) {
      return (await this.feedRepo.findEnrichedById(postId, userId)) ?? (await this.repo.findById(postId))!.media
    }
    return (await this.repo.findById(postId))!.media
  }

  async removeMedia(userId: string, postId: string, mediaId: string): Promise<void> {
    const post = await this.repo.findById(postId)
    if (!post || post.userId !== userId) throw new PostsError('NOT_FOUND')
    const media = await this.repo.findMediaById(mediaId)
    if (!media || media.postId !== postId) throw new PostsError('NOT_FOUND')
    await this.repo.removeMedia(mediaId)
  }
}
