import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-webp')),
  })),
}))

import { CommunitiesService } from '../../../src/modules/communities/communities.service.js'
import type { CommunitiesRepository, CommunityRow } from '../../../src/modules/communities/communities.repository.js'
import type { MembersRepository } from '../../../src/modules/communities/members.repository.js'
import type { AuditLogRepository } from '../../../src/modules/communities/audit-log.repository.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'
import { CommunitiesError } from '../../../src/modules/communities/communities.errors.js'

const NOW = new Date('2026-01-01T00:00:00Z')

function makeCommunity(overrides: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: 'c1',
    slug: 'test-community',
    name: 'Test Community',
    description: 'A test community',
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
    userId: 'owner-1',
    role: 'owner' as const,
    status: 'active' as const,
    banReason: null,
    joinedAt: NOW,
    approvedAt: null,
    ...overrides,
  }
}

function mockDb() {
  return {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txProxy = {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        returning: vi.fn().mockResolvedValue([makeCommunity()]),
        set: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
      }
      return fn(txProxy)
    }),
  }
}

function mockCommunitiesRepo(): CommunitiesRepository {
  return {
    create: vi.fn().mockResolvedValue(makeCommunity()),
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(makeCommunity()),
    softDelete: vi.fn().mockResolvedValue(makeCommunity({ deletedAt: new Date() })),
    listVisible: vi.fn().mockResolvedValue({ communities: [], nextCursor: null }),
    listByOwner: vi.fn().mockResolvedValue({ communities: [], nextCursor: null }),
    listByMembership: vi.fn().mockResolvedValue({ communities: [], nextCursor: null }),
    incrementMemberCount: vi.fn().mockResolvedValue(undefined),
    decrementMemberCount: vi.fn().mockResolvedValue(undefined),
    findModerators: vi.fn().mockResolvedValue([]),
  } as unknown as CommunitiesRepository
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
    deleteByCommunityAndUser: vi.fn(),
    swapOwnerWithModerator: vi.fn(),
  } as unknown as MembersRepository
}

function mockAuditLog(): AuditLogRepository {
  return {
    record: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as AuditLogRepository
}

function mockStorage(): IStorageService {
  return {
    upload: vi.fn().mockResolvedValue('https://cdn/uploaded.webp'),
    delete: vi.fn(),
    keyFromUrl: vi.fn().mockReturnValue(null),
  }
}

const coverFile = { buffer: Buffer.from('cover'), mimeType: 'image/jpeg' }
const iconFile = { buffer: Buffer.from('icon'), mimeType: 'image/jpeg' }

describe('CommunitiesService', () => {
  let repo: ReturnType<typeof mockCommunitiesRepo>
  let membersRepo: ReturnType<typeof mockMembersRepo>
  let auditLog: ReturnType<typeof mockAuditLog>
  let storage: ReturnType<typeof mockStorage>
  let db: ReturnType<typeof mockDb>
  let service: CommunitiesService

  beforeEach(() => {
    repo = mockCommunitiesRepo()
    membersRepo = mockMembersRepo()
    auditLog = mockAuditLog()
    storage = mockStorage()
    db = mockDb()
    service = new CommunitiesService(db as any, repo, membersRepo, auditLog, storage)
  })

  describe('createCommunity', () => {
    it('creates community with derived slug', async () => {
      vi.mocked(repo.findBySlug).mockResolvedValue(null)
      vi.mocked(repo.create).mockResolvedValue(makeCommunity({ slug: 'my-community' }))

      const result = await service.createCommunity(
        'owner-1',
        { name: 'My Community', description: 'Desc', category: 'rpg-mesa', visibility: 'public' },
        coverFile,
        iconFile,
      )

      expect(result.slug).toBe('my-community')
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-community', ownerId: 'owner-1' }),
        expect.anything(),
      )
    })

    it('auto-suffixes slug on collision (retry logic)', async () => {
      const existingCommunity = makeCommunity({ slug: 'test' })
      vi.mocked(repo.findBySlug)
        .mockResolvedValueOnce(existingCommunity) // first call: collision
        .mockResolvedValue(null) // second call: no collision

      vi.mocked(repo.create).mockResolvedValue(makeCommunity({ slug: 'test-2' }))

      const result = await service.createCommunity(
        'owner-1',
        { name: 'Test', description: 'Desc', category: 'rpg-mesa', visibility: 'public' },
        coverFile,
        iconFile,
      )

      expect(repo.findBySlug).toHaveBeenCalledTimes(2)
      expect(result.slug).toBe('test-2')
    })

    it('persists owner as role=owner status=active member', async () => {
      vi.mocked(repo.findBySlug).mockResolvedValue(null)
      vi.mocked(repo.create).mockResolvedValue(makeCommunity())

      await service.createCommunity(
        'owner-1',
        { name: 'Comm', description: 'Desc', category: 'rpg-mesa', visibility: 'public' },
        coverFile,
        iconFile,
      )

      expect(membersRepo.insertMember).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'owner-1', role: 'owner', status: 'active' }),
        expect.anything(),
      )
    })

    it('records audit log on create', async () => {
      vi.mocked(repo.findBySlug).mockResolvedValue(null)
      vi.mocked(repo.create).mockResolvedValue(makeCommunity())

      await service.createCommunity(
        'owner-1',
        { name: 'Comm', description: 'Desc', category: 'rpg-mesa', visibility: 'public' },
        coverFile,
        iconFile,
      )

      expect(auditLog.record).toHaveBeenCalledWith('community_create', expect.any(String), 'owner-1')
    })
  })

  describe('updateCommunity', () => {
    it('allows update by owner', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeCommunity({ ownerId: 'owner-1' }))
      vi.mocked(repo.update).mockResolvedValue(makeCommunity({ name: 'Updated' }))

      const result = await service.updateCommunity('owner-1', 'c1', { name: 'Updated' })

      expect(result.name).toBe('Updated')
      expect(repo.update).toHaveBeenCalled()
    })

    it('throws NOT_OWNER for non-owner', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeCommunity({ ownerId: 'owner-1' }))

      await expect(
        service.updateCommunity('other-user', 'c1', { name: 'Hack' }),
      ).rejects.toThrow(CommunitiesError)

      const call = vi.mocked(service.updateCommunity)
      try {
        await service.updateCommunity('other-user', 'c1', { name: 'Hack' })
      } catch (e) {
        expect((e as CommunitiesError).code).toBe('NOT_OWNER')
      }
    })
  })

  describe('softDeleteCommunity', () => {
    it('sets deletedAt for owner', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeCommunity({ ownerId: 'owner-1' }))

      await service.softDeleteCommunity('owner-1', 'c1')

      expect(repo.softDelete).toHaveBeenCalledWith('c1')
      expect(auditLog.record).toHaveBeenCalledWith('community_delete', 'c1', 'owner-1')
    })

    it('throws NOT_OWNER for non-owner', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeCommunity({ ownerId: 'owner-1' }))

      await expect(service.softDeleteCommunity('other', 'c1')).rejects.toMatchObject({ code: 'NOT_OWNER' })
    })
  })

  describe('getForViewer', () => {
    const COMMUNITY_UUID = '00000000-0000-0000-0000-000000000001'

    it('returns community for public visibility', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeCommunity({ id: COMMUNITY_UUID, visibility: 'public' }))

      const result = await service.getForViewer(COMMUNITY_UUID, 'any-user')

      expect(result.id).toBe(COMMUNITY_UUID)
    })

    it('returns community for private visibility (non-member gets stripped by isPrivateNonMember)', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makeCommunity({ id: COMMUNITY_UUID, visibility: 'private' }))
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(null)

      const result = await service.getForViewer(COMMUNITY_UUID, 'viewer-1')
      expect(result.visibility).toBe('private')
    })
  })

  describe('assertNotBanned', () => {
    it('throws BANNED for banned member', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(
        makeMember({ status: 'banned' }),
      )

      await expect(service.assertNotBanned('user-1', 'c1')).rejects.toMatchObject({ code: 'BANNED' })
    })

    it('does not throw for active member', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(
        makeMember({ status: 'active' }),
      )

      await expect(service.assertNotBanned('user-1', 'c1')).resolves.toBeUndefined()
    })

    it('does not throw for non-member', async () => {
      vi.mocked(membersRepo.findByCommunityAndUser).mockResolvedValue(null)

      await expect(service.assertNotBanned('user-1', 'c1')).resolves.toBeUndefined()
    })
  })
})
