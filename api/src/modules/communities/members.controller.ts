import type { FastifyRequest, FastifyReply } from 'fastify'
import type { MembersService } from './members.service.js'
import type { CommunitiesService } from './communities.service.js'
import { mapCommunitiesError } from './communities.controller.js'
import { serializeMember, serializeMemberWithUser } from './communities.serializer.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class MembersController {
  constructor(
    private readonly service: MembersService,
    private readonly communitiesService: CommunitiesService,
  ) {}

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

  async listMembers(request: FastifyRequest<{ Params: { id: string }; Querystring: { role?: string; status?: string; limit?: number; cursor?: string } }>, reply: FastifyReply) {
    const viewer = (request.user as AccessTokenClaims | undefined)
    const viewerId = viewer?.userId ?? null
    try {
      const community = await this.communitiesService.getForViewer(request.params.id, viewerId)
      await this.communitiesService.assertCanView(viewerId, community)

      const { role, status, limit, cursor } = request.query as { role?: 'owner' | 'moderator' | 'member'; status?: 'pending' | 'active' | 'banned'; limit?: number; cursor?: string }

      let viewerCanSeeSensitive = false
      if (viewerId) {
        const viewerMembership = await this.service.getMembership(community.id, viewerId)
        viewerCanSeeSensitive = viewerMembership?.role === 'owner' || viewerMembership?.role === 'moderator'
      }

      const requestedStatus = status
      const effectiveStatus = (requestedStatus === 'banned' || requestedStatus === 'pending')
        ? (viewerCanSeeSensitive ? requestedStatus : undefined)
        : requestedStatus

      const { members, nextCursor } = await this.service.listMembers(
        request.params.id,
        { role, status: effectiveStatus, limit: limit ?? 50, cursor },
      )
      return reply.send({ members: members.map(serializeMemberWithUser), nextCursor })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }
}
