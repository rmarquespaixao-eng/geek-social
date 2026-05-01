import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ReactionsService } from './reactions.service.js'
import { ReactionsError } from './reactions.service.js'
import type { AddReactionInput } from './posts.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class ReactionsController {
  constructor(private readonly service: ReactionsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof ReactionsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Não encontrado' })
      if (error.code === 'SELF_REACTION') return reply.status(400).send({ error: 'Não é possível reagir ao próprio post' })
    }
    throw error
  }

  async react(request: FastifyRequest<{ Params: { postId: string }; Body: AddReactionInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const counts = await this.service.react(userId, request.params.postId, request.body.type)
      return reply.send({ counts })
    } catch (error) { return this.handleError(error, reply) }
  }

  async removeReaction(request: FastifyRequest<{ Params: { postId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.removeReaction(userId, request.params.postId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async getReactions(request: FastifyRequest<{ Params: { postId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const result = await this.service.getReactions(request.params.postId, userId)
      return reply.send(result)
    } catch (error) { return this.handleError(error, reply) }
  }
}
