import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { MembersRepository } from './members.repository.js'
import type { MemberRow, MemberWithUser } from './communities.repository.js'
import type { CommunitiesRepository } from './communities.repository.js'
import type { JoinRequestsService } from './join-requests.service.js'
import type { JoinRequestRow } from './communities.repository.js'
import { CommunitiesError } from './communities.errors.js'

export class MembersService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly membersRepo: MembersRepository,
    private readonly communitiesRepo: CommunitiesRepository,
    private readonly joinRequestsService: JoinRequestsService,
  ) {}

  async joinCommunity(
    viewerId: string,
    communityId: string,
  ): Promise<{ status: 'active'; membership: MemberRow } | { status: 'pending'; request: JoinRequestRow }> {
    const community = await this.communitiesRepo.findById(communityId)
    if (!community) throw new CommunitiesError('COMMUNITY_NOT_FOUND')
    if (community.deletedAt) throw new CommunitiesError('COMMUNITY_DELETED')
    if (community.visibility === 'private') throw new CommunitiesError('NOT_MEMBER')

    const existing = await this.membersRepo.findByCommunityAndUser(communityId, viewerId)
    if (existing) {
      if (existing.status === 'active') throw new CommunitiesError('ALREADY_MEMBER')
      if (existing.status === 'banned') throw new CommunitiesError('BANNED')
      if (existing.status === 'pending') throw new CommunitiesError('ALREADY_PENDING')
    }

    if (community.visibility === 'public') {
      const membership = await this.db.transaction(async (tx) => {
        const exec = tx as unknown as DatabaseClient
        const member = await this.membersRepo.insertMember(
          { communityId, userId: viewerId, role: 'member', status: 'active' },
          exec,
        )
        await this.communitiesRepo.incrementMemberCount(communityId, exec)
        return member
      })
      return { status: 'active', membership }
    }

    // restricted
    const request = await this.joinRequestsService.requestJoin(viewerId, communityId)
    return { status: 'pending', request }
  }

  async leaveCommunity(viewerId: string, communityId: string): Promise<void> {
    const community = await this.communitiesRepo.findById(communityId)
    if (!community) throw new CommunitiesError('COMMUNITY_NOT_FOUND')

    const membership = await this.membersRepo.findByCommunityAndUser(communityId, viewerId)
    if (!membership) throw new CommunitiesError('MEMBERSHIP_NOT_FOUND')
    if (membership.role === 'owner') throw new CommunitiesError('OWNER_CANNOT_LEAVE')

    await this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient
      await this.membersRepo.deleteByCommunityAndUser(communityId, viewerId, exec)
      if (membership.status === 'active') {
        await this.communitiesRepo.decrementMemberCount(communityId, exec)
      }
    })
  }

  async listMembers(
    communityId: string,
    query: { role?: 'owner' | 'moderator' | 'member'; status?: 'pending' | 'active' | 'banned'; limit?: number; cursor?: string },
    viewerCanSeePending = false,
  ): Promise<{ members: MemberWithUser[]; nextCursor: string | null }> {
    const status = viewerCanSeePending ? query.status : (query.status ?? 'active')
    return this.membersRepo.listByCommunity(communityId, {
      role: query.role,
      status,
      limit: query.limit,
      cursor: query.cursor,
    })
  }

  async getMembership(communityId: string, userId: string): Promise<MemberRow | null> {
    return this.membersRepo.findByCommunityAndUser(communityId, userId)
  }
}
