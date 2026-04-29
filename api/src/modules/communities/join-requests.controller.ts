import type { FastifyRequest, FastifyReply } from 'fastify'
import type { JoinRequestsService } from './join-requests.service.js'
import { mapCommunitiesError } from './communities.controller.js'
import { serializeJoinRequestWithUser } from './communities.serializer.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class JoinRequestsController {
  constructor(private readonly service: JoinRequestsService) {}

  async listPending(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const requests = await this.service.listPending(userId, request.params.id)
      return reply.send({ requests: requests.map(serializeJoinRequestWithUser), nextCursor: null })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async approve(
    request: FastifyRequest<{ Params: { id: string; userId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId: actorId } = request.user as AccessTokenClaims
    try {
      const membership = await this.service.approve(actorId, request.params.id, request.params.userId)
      return reply.send({
        membership: {
          id: membership.id,
          communityId: membership.communityId,
          userId: membership.userId,
          role: membership.role,
          status: membership.status,
          banReason: membership.banReason,
          joinedAt: membership.joinedAt.toISOString(),
          approvedAt: membership.approvedAt ? membership.approvedAt.toISOString() : null,
        },
      })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async reject(
    request: FastifyRequest<{ Params: { id: string; userId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId: actorId } = request.user as AccessTokenClaims
    try {
      await this.service.reject(actorId, request.params.id, request.params.userId)
      return reply.status(204).send()
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }
}
