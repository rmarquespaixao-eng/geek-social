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

  async promote(request: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const { userId: viewerId } = request.user as AccessTokenClaims
    try {
      const member = await this.service.promoteMember(viewerId, request.params.id, request.params.userId)
      return reply.send({ member: serializeMember(member) })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async demote(request: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const { userId: viewerId } = request.user as AccessTokenClaims
    try {
      const member = await this.service.demoteMember(viewerId, request.params.id, request.params.userId)
      return reply.send({ member: serializeMember(member) })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async ban(request: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const { userId: viewerId } = request.user as AccessTokenClaims
    try {
      const reason = (request.body as Record<string, unknown> | null)?.reason as string | undefined
      const member = await this.service.banMember(viewerId, request.params.id, request.params.userId, reason)
      return reply.send({ member: serializeMember(member) })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async unban(request: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const { userId: viewerId } = request.user as AccessTokenClaims
    try {
      const member = await this.service.unbanMember(viewerId, request.params.id, request.params.userId)
      return reply.send({ member: serializeMember(member) })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async kick(request: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const { userId: viewerId } = request.user as AccessTokenClaims
    try {
      await this.service.kickMember(viewerId, request.params.id, request.params.userId)
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

      let viewerMembership: Awaited<ReturnType<typeof this.service.getMembership>> = null
      if (viewerId) {
        viewerMembership = await this.service.getMembership(community.id, viewerId)
      }

      const { members, nextCursor } = await this.service.listMembers(
        request.params.id,
        { role, status, limit: limit ?? 50, cursor },
        viewerMembership,
      )
      return reply.send({ members: members.map(serializeMemberWithUser), nextCursor })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }
}
