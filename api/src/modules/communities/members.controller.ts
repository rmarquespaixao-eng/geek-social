import type { FastifyRequest, FastifyReply } from 'fastify'
import type { MembersService } from './members.service.js'
import { mapCommunitiesError } from './communities.controller.js'
import { serializeMember, serializeMemberWithUser } from './communities.serializer.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class MembersController {
  constructor(private readonly service: MembersService) {}

  async join(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const result = await this.service.joinCommunity(userId, request.params.id)
      if (result.status === 'active') {
        return reply.send({ status: 'active', membership: serializeMember(result.membership) })
      }
      return reply.send({
        status: 'pending',
        request: {
          id: result.request.id,
          communityId: result.request.communityId,
          userId: result.request.userId,
          status: result.request.status,
          decidedBy: result.request.decidedBy,
          decidedAt: result.request.decidedAt ? result.request.decidedAt.toISOString() : null,
          createdAt: result.request.createdAt.toISOString(),
        },
      })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async leave(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.leaveCommunity(userId, request.params.id)
      return reply.status(204).send()
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async listMembers(request: FastifyRequest<{ Params: { id: string }; Querystring: { role?: string; status?: string; limit?: number } }>, reply: FastifyReply) {
    const viewer = (request.user as AccessTokenClaims | undefined)
    const viewerId = viewer?.userId ?? null
    try {
      const { role, status, limit } = request.query as { role?: 'owner' | 'moderator' | 'member'; status?: 'pending' | 'active' | 'banned'; limit?: number }
      const members = await this.service.listMembers(
        request.params.id,
        { role, status, limit: limit ?? 50 },
      )
      return reply.send({ members: members.map(serializeMemberWithUser), nextCursor: null })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }
}
