import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JoinRequestsService } from '../../../src/modules/communities/join-requests.service.js'
import type { JoinRequestsRepository } from '../../../src/modules/communities/join-requests.repository.js'
import type { MembersRepository } from '../../../src/modules/communities/members.repository.js'
import type { CommunitiesRepository, CommunityRow } from '../../../src/modules/communities/communities.repository.js'
import type { AuditLogRepository } from '../../../src/modules/communities/audit-log.repository.js'
import { CommunitiesError } from '../../../src/modules/communities/communities.errors.js'

const NOW = new Date('2026-01-01T00:00:00Z')

function makeCommunity(overrides: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: 'c1', slug: 'test', name: 'Test', description: 'Desc', category: 'rpg-mesa',
    iconUrl: 'https://cdn/icon.webp', coverUrl: 'https://cdn/cover.webp', visibility: 'restricted',
    ownerId: 'owner-1', memberCount: 1, topicCount: 0, rules: null, welcomeMessage: null,
    deletedAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  }
}

function makeMember(overrides = {}) {
  return {
    id: 'm1', communityId: 'c1', userId: 'mod-1', role: 'moderator' as const,
    status: 'active' as const, banReason: null, joinedAt: NOW, approvedAt: null, ...overrides,
  }
}

function makeJoinRequest(overrides = {}) {
  return {
    id: 'jr1', communityId: 'c1', userId: 'user-1', status: 'pending' as const,
    decidedBy: null, decidedAt: null, createdAt: NOW, ...overrides,
  }
}

function makeActiveMember(userId: string = 'user-1') {
  return { id: 'ma1', communityId: 'c1', userId, role: 'member' as const, status: 'active' as const, banReason: null, joinedAt: NOW, approvedAt: NOW }
}

function mockDb() {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const exec = {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([makeActiveMember()]),
        set: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      }
      return fn(exec)
    }),
  }
}

function mockJoinRequestsRepo(): JoinRequestsRepository {
  return {
    create: vi.fn().mockResolvedValue(makeJoinRequest()),
    findPending: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    findByUserInCommunity: vi.fn().mockResolvedValue(null),
    listPending: vi.fn().mockResolvedValue([]),
    markDecided: vi.fn().mockResolvedValue(makeJoinRequest({ status: 'approved' })),
  } as unknown as JoinRequestsRepository
}

function mockMembersRepo(): MembersRepository {
  return {
    insertMember: vi.fn().mockResolvedValue(makeActiveMember()),
    findByCommunityAndUser: vi.fn().mockResolvedValue(makeMember()),
    setRole: vi.fn(),
    setStatus: vi.fn().mockResolvedValue(makeActiveMember()),
    setStatusByUser: vi.fn(),
    listByCommunity: vi.fn().mockResolvedValue([]),
    countActiveByCommunity: vi.fn().mockResolvedValue(0),
    findOwner: vi.fn().mockResolvedValue(null),
    deleteByCommunityAndUser: vi.fn(),
    swapOwnerWithModerator: vi.fn(),
  } as unknown as MembersRepository
}

function mockCommunitiesRepo(): CommunitiesRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeCommunity()),
    findBySlug: vi.fn().mockResolvedValue(null),
    update: vi.fn(),
    softDelete: vi.fn(),
    listVisible: vi.fn().mockResolvedValue({ communities: [], nextCursor: null }),
    listByOwner: vi.fn().mockResolvedValue({ communities: [], nextCursor: null }),
    listByMembership: vi.fn().mockResolvedValue({ communities: [], nextCursor: null }),
    incrementMemberCount: vi.fn().mockResolvedValue(undefined),
    decrementMemberCount: vi.fn().mockResolvedValue(undefined),
    findModerators: vi.fn().mockResolvedValue([]),
  } as unknown as CommunitiesRepository
}

function mockAuditLog(): AuditLogRepository {
  return {
    record: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as AuditLogRepository
}

describe('JoinRequestsService', () => {
  let joinReqRepo: ReturnType<typeof mockJoinRequestsRepo>
  let membersRepo: ReturnType<typeof mockMembersRepo>
  let commRepo: ReturnType<typeof mockCommunitiesRepo>
  let auditLog: ReturnType<typeof mockAuditLog>
  let db: ReturnType<typeof mockDb>
  let service: JoinRequestsService

  beforeEach(() => {
    joinReqRepo = mockJoinRequestsRepo()
    membersRepo = mockMembersRepo()
    commRepo = mockCommunitiesRepo()
    auditLog = mockAuditLog()
    db = mockDb()
    service = new JoinRequestsService(db as any, joinReqRepo, membersRepo, commRepo, auditLog)
  })

  describe('requestJoin', () => {
    it('creates a new pending request', async () => {
      vi.mocked(joinReqRepo.findPending).mockResolvedValue(null)

      const result = await service.requestJoin('user-1', 'c1')

      expect(result.status).toBe('pending')
      expect(joinReqRepo.create).toHaveBeenCalledWith('c1', 'user-1')
    })

    it('is idempotent: returns existing pending request if one exists', async () => {
      const existingRequest = makeJoinRequest()
      vi.mocked(joinReqRepo.findPending).mockResolvedValue(existingRequest)

      const result = await service.requestJoin('user-1', 'c1')

      expect(result.id).toBe('jr1')
      expect(joinReqRepo.create).not.toHaveBeenCalled()
    })
  })

  describe('approve', () => {
    it('approves request: sets request status=approved, member becomes active', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser)
        .mockResolvedValueOnce(makeMember({ role: 'moderator' })) // actor is moderator
        .mockResolvedValueOnce(null) // user has no existing membership

      vi.mocked(joinReqRepo.findPending).mockResolvedValue(makeJoinRequest())
      vi.mocked(membersRepo.insertMember).mockResolvedValue(makeActiveMember())

      const member = await service.approve('mod-1', 'c1', 'user-1')

      expect(member.status).toBe('active')
    })

    it('is idempotent: already-approved request returns existing membership', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser)
        .mockResolvedValueOnce(makeMember({ role: 'moderator', userId: 'mod-1' })) // actor
        .mockResolvedValueOnce(makeActiveMember()) // target user already active

      vi.mocked(joinReqRepo.findPending).mockResolvedValue(null) // no pending request

      const member = await service.approve('mod-1', 'c1', 'user-1')

      expect(member.status).toBe('active')
    })

    it('throws NOT_MODERATOR if actor is just a member', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(
        makeMember({ role: 'member', userId: 'actor-1' }),
      )

      await expect(service.approve('actor-1', 'c1', 'user-1')).rejects.toMatchObject({ code: 'NOT_MODERATOR' })
    })
  })

  describe('reject', () => {
    it('rejects request and records audit', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(
        makeMember({ role: 'moderator' }),
      )
      vi.mocked(joinReqRepo.findPending).mockResolvedValue(makeJoinRequest())

      await service.reject('mod-1', 'c1', 'user-1')

      expect(joinReqRepo.markDecided).toHaveBeenCalledWith('jr1', 'rejected', 'mod-1')
      expect(auditLog.record).toHaveBeenCalledWith('member_join_rejected', 'c1', 'mod-1', expect.anything())
      expect(membersRepo.insertMember).not.toHaveBeenCalled()
    })

    it('throws JOIN_REQUEST_NOT_FOUND if no pending request', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(
        makeMember({ role: 'moderator' }),
      )
      vi.mocked(joinReqRepo.findPending).mockResolvedValue(null)

      await expect(service.reject('mod-1', 'c1', 'user-1')).rejects.toMatchObject({
        code: 'JOIN_REQUEST_NOT_FOUND',
      })
    })
  })
})
