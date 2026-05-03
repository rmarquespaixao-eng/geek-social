import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CommentsService } from './comments.service.js'
import { CommentsError } from './comments.service.js'
import type { AddCommentInput, UpdateCommentInput } from './posts.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof CommentsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Não encontrado' })
      if (error.code === 'FORBIDDEN') return reply.status(403).send({ error: 'Sem permissão' })
    }
    throw error
  }

  async addComment(request: FastifyRequest<{ Params: { postId: string }; Body: AddCommentInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const comment = await this.service.addComment(userId, request.params.postId, request.body.content)
      return reply.status(201).send(comment)
    } catch (error) { return this.handleError(error, reply) }
  }

  async listComments(request: FastifyRequest<{ Params: { postId: string }; Querystring: { cursor?: string; limit?: number } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const result = await this.service.listComments(userId, request.params.postId, request.query.cursor, request.query.limit ?? 20)
      return reply.send(result)
    } catch (error) { return this.handleError(error, reply) }
  }

  async updateComment(request: FastifyRequest<{ Params: { postId: string; id: string }; Body: UpdateCommentInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const comment = await this.service.updateComment(userId, request.params.postId, request.params.id, request.body.content)
      return reply.send(comment)
    } catch (error) { return this.handleError(error, reply) }
  }

  async deleteComment(request: FastifyRequest<{ Params: { postId: string; id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.deleteComment(userId, request.params.postId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }
}
