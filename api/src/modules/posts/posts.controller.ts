import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PostsService } from './posts.service.js'
import { PostsError } from './posts.service.js'
import type { CreatePostInput, UpdatePostInput } from './posts.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class PostsController {
  constructor(private readonly service: PostsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof PostsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Não encontrado' })
      if (error.code === 'CANNOT_EDIT_ITEM_SHARE') return reply.status(400).send({ error: 'Posts automáticos não podem ser editados' })
      if (error.code === 'MEDIA_LIMIT_EXCEEDED') return reply.status(400).send({ error: 'Máximo de 4 imagens por post' })
      if (error.code === 'MEDIA_TOO_LARGE') return reply.status(400).send({ error: 'Mídia muito grande' })
      if (error.code === 'UNSUPPORTED_MEDIA_FORMAT') return reply.status(400).send({ error: 'Tipo de mídia não suportado' })
      if (error.code === 'STORAGE_NOT_CONFIGURED') return reply.status(503).send({ error: 'Armazenamento indisponível' })
    }
    throw error
  }

  async createPost(request: FastifyRequest<{ Body: CreatePostInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const post = await this.service.createPost(userId, request.body)
      return reply.status(201).send(post)
    } catch (error) { return this.handleError(error, reply) }
  }

  async getPost(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const post = await this.service.getPost(request.params.id, userId)
      return reply.send(post)
    } catch (error) { return this.handleError(error, reply) }
  }

  async updatePost(request: FastifyRequest<{ Params: { id: string }; Body: UpdatePostInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const post = await this.service.updatePost(userId, request.params.id, request.body)
      return reply.send(post)
    } catch (error) { return this.handleError(error, reply) }
  }

  async deletePost(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.deletePost(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async addMedia(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
      const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
      const IMAGE_MAX = 5 * 1024 * 1024

      const parts = request.files({ limits: { fileSize: 50 * 1024 * 1024 } })
      const files: Array<{ buffer: Buffer; mimeType: string; filename: string }> = []
      for await (const part of parts) {
        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk)
        const buffer = Buffer.concat(chunks)

        const declaredMimeType = part.mimetype
        const isImage = ALLOWED_IMAGE.has(declaredMimeType)
        const isVideo = ALLOWED_VIDEO.has(declaredMimeType)

        if (!isImage && !isVideo) {
          return reply.status(400).send({ error: 'Tipo de mídia não suportado' })
        }

        const actualMimeType = this.detectMimeType(buffer)
        if (!actualMimeType) {
          return reply.status(400).send({ error: 'Tipo de mídia não suportado' })
        }

        if (isImage && buffer.length > IMAGE_MAX) {
          return reply.status(400).send({ error: 'Imagem muito grande (máx 5MB)' })
        }

        files.push({
          buffer,
          mimeType: actualMimeType,
          filename: part.filename,
        })
      }
      if (files.length === 0) return reply.status(400).send({ error: 'Nenhuma mídia enviada' })
      const media = await this.service.addMedia(userId, request.params.id, files)
      return reply.send(media)
    } catch (error) { return this.handleError(error, reply) }
  }

  private detectMimeType(buffer: Buffer): string | null {
    if (buffer.length < 4) return null

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif'
    if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp'
    }
    if (buffer.length >= 8 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return 'video/mp4'

    return null
  }

  async removeMedia(request: FastifyRequest<{ Params: { id: string; mediaId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.removeMedia(userId, request.params.id, request.params.mediaId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }
}
