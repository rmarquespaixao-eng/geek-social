import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MembersService } from '../../../src/modules/communities/members.service.js'
import type { MembersRepository } from '../../../src/modules/communities/members.repository.js'
import type { CommunitiesRepository, CommunityRow } from '../../../src/modules/communities/communities.repository.js'
import type { JoinRequestsService } from '../../../src/modules/communities/join-requests.service.js'
import { CommunitiesError } from '../../../src/modules/communities/communities.errors.js'

const NOW = new Date('2026-01-01T00:00:00Z')

function makeCommunity(overrides: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: 'c1',
    slug: 'test',
    name: 'Test',
    description: 'Desc',
    category: 'rpg-mesa',
    iconUrl: 'https://cdn/icon.webp',
    coverUrl: 'https://cdn/cover.webp',
    visibility: 'public',
    ownerId: 'owner-1',
    memberCount: 1,
    topicCount: 0,
    rules: null,
    welcomeMessage: null,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeMember(overrides = {}) {
  return {
    id: 'm1',
    communityId: 'c1',
    userId: 'user-1',
    role: 'member' as const,
    status: 'active' as const,
    banReason: null,
    joinedAt: NOW,
    approvedAt: null,
    ...overrides,
  }
}

function makeJoinRequest(overrides = {}) {
  return {
    id: 'jr1',
    communityId: 'c1',
    userId: 'user-1',
    status: 'pending' as const,
    decidedBy: null,
    decidedAt: null,
    createdAt: NOW,
    ...overrides,
  }
}

function mockDb() {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const exec = {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([makeMember()]),
        set: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      }
      return fn(exec)
    }),
  }
}

function mockMembersRepo(): MembersRepository {
  return {
    insertMember: vi.fn().mockResolvedValue(makeMember()),
    findByCommunityAndUser: vi.fn().mockResolvedValue(null),
    setRole: vi.fn(),
    setStatus: vi.fn(),
    setStatusByUser: vi.fn(),
    listByCommunity: vi.fn().mockResolvedValue([]),
    countActiveByCommunity: vi.fn().mockResolvedValue(0),
    findOwner: vi.fn().mockResolvedValue(null),
    deleteByCommunityAndUser: vi.fn().mockResolvedValue(undefined),
    swapOwnerWithModerator: vi.fn(),
  } as unknown as MembersRepository
}

function mockCommunitiesRepo(overrides: Partial<CommunityRow> = {}): CommunitiesRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(makeCommunity(overrides)),
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

function mockJoinRequestsService(): JoinRequestsService {
  return {
    requestJoin: vi.fn().mockResolvedValue(makeJoinRequest()),
    approve: vi.fn(),
    reject: vi.fn(),
    listPending: vi.fn().mockResolvedValue([]),
  } as unknown as JoinRequestsService
}

describe('MembersService', () => {
  let membersRepo: ReturnType<typeof mockMembersRepo>
  let commRepo: ReturnType<typeof mockCommunitiesRepo>
  let joinReqService: ReturnType<typeof mockJoinRequestsService>
  let db: ReturnType<typeof mockDb>
  let service: MembersService

  beforeEach(() => {
    membersRepo = mockMembersRepo()
    commRepo = mockCommunitiesRepo()
    joinReqService = mockJoinRequestsService()
    db = mockDb()
    service = new MembersService(db as any, membersRepo, commRepo, joinReqService)
  })

  describe('joinCommunity', () => {
    it('public community → inserts member with status=active immediately', async () => {
      vi.mocked(commRepo.findById).mockResolvedValue(makeCommunity({ visibility: 'public' }))
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(null)
      vi.mocked(membersRepo.insertMember).mockResolvedValue(makeMember({ status: 'active' }))

      const result = await service.joinCommunity('user-1', 'c1')

      expect(result.status).toBe('active')
      expect(membersRepo.insertMember).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active', role: 'member' }),
        expect.anything(),
      )
    })

    it('restricted community → delegates to JoinRequestsService.requestJoin', async () => {
      vi.mocked(commRepo.findById).mockResolvedValue(makeCommunity({ visibility: 'restricted' }))
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(null)

      const result = await service.joinCommunity('user-1', 'c1')

      expect(result.status).toBe('pending')
      expect(joinReqService.requestJoin).toHaveBeenCalledWith('user-1', 'c1')
    })

    it('throws ALREADY_MEMBER if user is already active', async () => {
      vi.mocked(commRepo.findById).mockResolvedValue(makeCommunity({ visibility: 'public' }))
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(makeMember({ status: 'active' }))

      await expect(service.joinCommunity('user-1', 'c1')).rejects.toMatchObject({ code: 'ALREADY_MEMBER' })
    })

    it('throws BANNED if user is banned', async () => {
      vi.mocked(commRepo.findById).mockResolvedValue(makeCommunity({ visibility: 'public' }))
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(makeMember({ status: 'banned' }))

      await expect(service.joinCommunity('user-1', 'c1')).rejects.toMatchObject({ code: 'BANNED' })
    })
  })

  describe('leaveCommunity', () => {
    it('removes member successfully', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(makeMember({ role: 'member' }))

      await service.leaveCommunity('user-1', 'c1')

      expect(membersRepo.deleteByCommunityAndUser).toHaveBeenCalledWith('c1', 'user-1', expect.anything())
    })

    it('blocks owner from leaving', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(makeMember({ role: 'owner' }))

      await expect(service.leaveCommunity('owner-1', 'c1')).rejects.toMatchObject({ code: 'OWNER_CANNOT_LEAVE' })
    })

    it('throws MEMBERSHIP_NOT_FOUND if not a member', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(null)

      await expect(service.leaveCommunity('user-1', 'c1')).rejects.toMatchObject({ code: 'MEMBERSHIP_NOT_FOUND' })
    })
  })

  describe('listMembers', () => {
    it('excludes banned members by default (status=active)', async () => {
      await service.listMembers('c1', {}, null)

      expect(membersRepo.listByCommunity).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ status: 'active' }),
      )
    })

    it('includes pending status when viewer is owner', async () => {
      const ownerMembership = makeMember({ role: 'owner' })
      await service.listMembers('c1', { status: 'pending' }, ownerMembership)

      expect(membersRepo.listByCommunity).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ status: 'pending' }),
      )
    })

    it('throws FORBIDDEN when non-owner tries to list pending members', async () => {
      const memberMembership = makeMember({ role: 'member' })
      await expect(service.listMembers('c1', { status: 'pending' }, memberMembership)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('throws FORBIDDEN when non-owner tries to list banned members', async () => {
      const memberMembership = makeMember({ role: 'member' })
      await expect(service.listMembers('c1', { status: 'banned' }, memberMembership)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })
})
