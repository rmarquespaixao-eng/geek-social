import { sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { JoinRequestsRepository } from './join-requests.repository.js'
import type { MembersRepository } from './members.repository.js'
import type { MemberRow } from './communities.repository.js'
import type { CommunitiesRepository } from './communities.repository.js'
import type { AuditLogRepository } from './audit-log.repository.js'
import type { JoinRequestRow } from './communities.repository.js'
import type { JoinRequestWithUser } from './join-requests.repository.js'
import type { NotificationsService } from '../notifications/notifications.service.js'
import type { NotificationType } from '../notifications/notifications.repository.js'
import { CommunitiesError } from './communities.errors.js'

const JOIN_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

export class JoinRequestsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly joinRequestsRepo: JoinRequestsRepository,
    private readonly membersRepo: MembersRepository,
    private readonly communitiesRepo: CommunitiesRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly notificationsService: NotificationsService | null = null,
  ) {}

  private notify(recipientId: string, actorId: string, type: NotificationType, entityId: string): void {
    if (!this.notificationsService) return
    this.notificationsService
      .notify({ recipientId, actorId, type, entityId })
      .catch((err: unknown) => {
        console.error({ err }, 'communities: notification failed')
      })
  }

  /** Idempotent: returns existing pending request if one already exists. */
  async requestJoin(userId: string, communityId: string): Promise<JoinRequestRow> {
    const existingMembership = await this.membersRepo.findByCommunityAndUser(communityId, userId)
    if (existingMembership?.status === 'banned') throw new CommunitiesError('BANNED')
    if (existingMembership?.status === 'active') throw new CommunitiesError('ALREADY_MEMBER')

    const lastRejected = await this.joinRequestsRepo.findLastRejected(communityId, userId)
    if (lastRejected) {
      const elapsed = Date.now() - new Date(lastRejected.decidedAt!).getTime()
      if (elapsed < JOIN_COOLDOWN_MS) {
        throw new CommunitiesError('COOLDOWN_ACTIVE')
      }
    }

    const existing = await this.joinRequestsRepo.findPending(communityId, userId)
    if (existing) return existing
    const created = await this.joinRequestsRepo.create(communityId, userId)
    const community = await this.communitiesRepo.findById(communityId)
    if (community?.ownerId) {
      this.notify(community.ownerId, userId, 'community_join_requested', communityId)
    }
    return created
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

    const pendingRequest = await this.joinRequestsRepo.findPending(communityId, userId)
    if (!pendingRequest) {
      // Idempotência: se já é membro ativo, retorna sem erro
      const existingMember = await this.membersRepo.findByCommunityAndUser(communityId, userId)
      if (existingMember && existingMember.status === 'active') return existingMember
      throw new CommunitiesError('JOIN_REQUEST_NOT_FOUND')
    }

    const member = await this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient

      // Fix 4: FOR UPDATE para evitar duplo-incremento em aprovações concorrentes
      const [lockedRequest] = (await tx.execute(
        sql`SELECT id, status FROM community_join_requests WHERE id = ${pendingRequest.id} FOR UPDATE`,
      )) as unknown as { id: string; status: string }[]
      if (!lockedRequest || lockedRequest.status !== 'pending') {
        throw new CommunitiesError('JOIN_REQUEST_NOT_FOUND')
      }

      await this.joinRequestsRepo.markDecided(pendingRequest.id, 'approved', actorId, exec)

      // Fix 1: Insert member or activate if pending — nunca sobrescrever ban
      const existingMember = await this.membersRepo.findByCommunityAndUser(communityId, userId, exec)
      let inserted: MemberRow
      if (existingMember) {
        // Fix 1: não reverter ban silenciosamente
        if (existingMember.status === 'banned') {
          throw new CommunitiesError('MEMBER_BANNED')
        }
        inserted = await this.membersRepo.setStatus(existingMember.id, 'active', null, exec)
        if (existingMember.status === 'pending') {
          await this.communitiesRepo.incrementMemberCount(communityId, exec)
        }
      } else {
        inserted = await this.membersRepo.insertMember(
          { communityId, userId, role: 'member', status: 'active' },
          exec,
        )
        await this.communitiesRepo.incrementMemberCount(communityId, exec)
      }

      await this.auditLog.record('member_join_approved', communityId, actorId, {
        targetUserId: userId,
      })

      return inserted
    })
    this.notify(userId, actorId, 'community_join_approved', communityId)
    return member
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

    await this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient
      await this.joinRequestsRepo.markDecided(request.id, 'rejected', actorId, exec)
      await this.membersRepo.deleteByCommunityAndUser(communityId, userId, exec)
      await this.auditLog.record('member_join_rejected', communityId, actorId, {
        targetUserId: userId,
      })
    })
    this.notify(userId, actorId, 'community_join_rejected', communityId)
  }

  async listPending(actorId: string, communityId: string): Promise<JoinRequestWithUser[]> {
    const community = await this.communitiesRepo.findById(communityId)
    if (!community) throw new CommunitiesError('COMMUNITY_NOT_FOUND')

    const actorMembership = await this.membersRepo.findByCommunityAndUser(communityId, actorId)
    if (!actorMembership || !['owner', 'moderator'].includes(actorMembership.role)) {
      throw new CommunitiesError('NOT_MODERATOR')
    }

    return this.joinRequestsRepo.listPending(communityId)
  }
}
