import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FeedService } from './feed.service.js'
import type { FeedQueryInput } from './posts.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class FeedController {
  constructor(private readonly service: FeedService) {}

  async getFeed(request: FastifyRequest<{ Querystring: FeedQueryInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const { cursor, limit } = request.query
    const result = await this.service.getFeed(userId, cursor, limit)
    return reply.send(result)
  }

  async getProfilePosts(request: FastifyRequest<{ Params: { userId: string }; Querystring: FeedQueryInput }>, reply: FastifyReply) {
    const viewerId = (request.user as AccessTokenClaims | undefined)?.userId ?? null
    const { cursor, limit } = request.query
    const result = await this.service.getProfilePosts(request.params.userId, viewerId, cursor, limit)
    return reply.send(result)
  }
}
