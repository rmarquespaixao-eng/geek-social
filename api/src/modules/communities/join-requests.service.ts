import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { JoinRequestsRepository } from './join-requests.repository.js'
import type { MembersRepository } from './members.repository.js'
import type { MemberRow } from './communities.repository.js'
import type { CommunitiesRepository } from './communities.repository.js'
import type { AuditLogRepository } from './audit-log.repository.js'
import type { JoinRequestRow } from './communities.repository.js'
import { CommunitiesError } from './communities.errors.js'

export class JoinRequestsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly joinRequestsRepo: JoinRequestsRepository,
    private readonly membersRepo: MembersRepository,
    private readonly communitiesRepo: CommunitiesRepository,
    private readonly auditLog: AuditLogRepository,
  ) {}

  /** Idempotent: returns existing pending request if one already exists. */
  async requestJoin(userId: string, communityId: string): Promise<JoinRequestRow> {
    const existing = await this.joinRequestsRepo.findPending(communityId, userId)
    if (existing) return existing
    return this.joinRequestsRepo.create(communityId, userId)
  }

  /**
   * Approve a pending join request.
   * Idempotent: if already approved, return existing membership.
   */
  async approve(actorId: string, communityId: string, userId: string): Promise<MemberRow> {
    const community = await this.communitiesRepo.findById(communityId)
    if (!community) throw new CommunitiesError('COMMUNITY_NOT_FOUND')

    const actorMembership = await this.membersRepo.findByCommunityAndUser(communityId, actorId)
    if (!actorMembership || !['owner', 'moderator'].includes(actorMembership.role)) {
      throw new CommunitiesError('NOT_MODERATOR')
    }

    const request = await this.joinRequestsRepo.findPending(communityId, userId)
    if (!request) {
      // Check if already approved (idempotent)
      const existingMember = await this.membersRepo.findByCommunityAndUser(communityId, userId)
      if (existingMember && existingMember.status === 'active') return existingMember
      throw new CommunitiesError('JOIN_REQUEST_NOT_FOUND')
    }

    return this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient
      await this.joinRequestsRepo.markDecided(request.id, 'approved', actorId, exec)

      // Insert member or activate if already exists
      const existingMember = await this.membersRepo.findByCommunityAndUser(communityId, userId, exec)
      let member: MemberRow
      if (existingMember) {
        member = await this.membersRepo.setStatus(existingMember.id, 'active', null, exec)
      } else {
        member = await this.membersRepo.insertMember(
          { communityId, userId, role: 'member', status: 'active' },
          exec,
        )
        await this.communitiesRepo.incrementMemberCount(communityId, exec)
      }

      await this.auditLog.record('member_join_approved', communityId, actorId, {
        targetUserId: userId,
      })

      return member
    })
  }

  async reject(actorId: string, communityId: string, userId: string): Promise<void> {
    const community = await this.communitiesRepo.findById(communityId)
    if (!community) throw new CommunitiesError('COMMUNITY_NOT_FOUND')

    const actorMembership = await this.membersRepo.findByCommunityAndUser(communityId, actorId)
    if (!actorMembership || !['owner', 'moderator'].includes(actorMembership.role)) {
      throw new CommunitiesError('NOT_MODERATOR')
    }

    const request = await this.joinRequestsRepo.findPending(communityId, userId)
    if (!request) throw new CommunitiesError('JOIN_REQUEST_NOT_FOUND')

    await this.joinRequestsRepo.markDecided(request.id, 'rejected', actorId)
    await this.auditLog.record('member_join_rejected', communityId, actorId, {
      targetUserId: userId,
    })
  }

  async listPending(actorId: string, communityId: string): Promise<JoinRequestRow[]> {
    const community = await this.communitiesRepo.findById(communityId)
    if (!community) throw new CommunitiesError('COMMUNITY_NOT_FOUND')

    const actorMembership = await this.membersRepo.findByCommunityAndUser(communityId, actorId)
    if (!actorMembership || !['owner', 'moderator'].includes(actorMembership.role)) {
      throw new CommunitiesError('NOT_MODERATOR')
    }

    return this.joinRequestsRepo.listPending(communityId)
  }
}
