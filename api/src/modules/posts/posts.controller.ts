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
      const parts = request.files()
      const files: Array<{ buffer: Buffer; mimeType: string; filename: string }> = []
      for await (const part of parts) {
        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk)
        files.push({
          buffer: Buffer.concat(chunks),
          mimeType: part.mimetype,
          filename: part.filename,
        })
      }
      if (files.length === 0) return reply.status(400).send({ error: 'Nenhuma mídia enviada' })
      const media = await this.service.addMedia(userId, request.params.id, files)
      return reply.send(media)
    } catch (error) { return this.handleError(error, reply) }
  }

  async removeMedia(request: FastifyRequest<{ Params: { id: string; mediaId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.removeMedia(userId, request.params.id, request.params.mediaId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }
}
