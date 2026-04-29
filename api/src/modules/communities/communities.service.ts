import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { CommunitiesRepository, CommunityRow } from './communities.repository.js'
import type { MembersRepository } from './members.repository.js'
import type { AuditLogRepository } from './audit-log.repository.js'
import type { CreateCommunityInput, UpdateCommunityInput, ListCommunitiesQuery } from './communities.schema.js'
import { CommunitiesError } from './communities.errors.js'

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const COVER_MAX_BYTES = 5 * 1024 * 1024
const ICON_MAX_BYTES = 2 * 1024 * 1024

export type MediaUpload = {
  buffer: Buffer
  mimeType: string
}

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

export class CommunitiesService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly repo: CommunitiesRepository,
    private readonly membersRepo: MembersRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly storageService: IStorageService | null,
  ) {}

  private async uploadImage(
    key: string,
    file: MediaUpload,
    maxBytes: number,
    errorCode: string,
  ): Promise<string> {
    if (!this.storageService) throw new CommunitiesError('STORAGE_NOT_CONFIGURED')
    if (!ALLOWED_IMAGE_MIME.has(file.mimeType)) throw new CommunitiesError('UNSUPPORTED_MEDIA_FORMAT')
    if (file.buffer.length > maxBytes) throw new CommunitiesError('MEDIA_TOO_LARGE')
    const optimized = await sharp(file.buffer)
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    return this.storageService.upload(key, optimized, 'image/webp')
  }

  private async uploadCover(communityId: string, file: MediaUpload): Promise<string> {
    return this.uploadImage(
      `communities/${communityId}/cover-${randomUUID()}.webp`,
      file,
      COVER_MAX_BYTES,
      'INVALID_COVER',
    )
  }

  private async uploadIcon(communityId: string, file: MediaUpload): Promise<string> {
    return this.uploadImage(
      `communities/${communityId}/icon-${randomUUID()}.webp`,
      file,
      ICON_MAX_BYTES,
      'INVALID_ICON',
    )
  }

  async createCommunity(
    ownerId: string,
    input: CreateCommunityInput,
    coverFile: MediaUpload,
    iconFile: MediaUpload,
  ): Promise<CommunityRow> {
    const communityId = randomUUID()
    const [coverUrl, iconUrl] = await Promise.all([
      this.uploadCover(communityId, coverFile),
      this.uploadIcon(communityId, iconFile),
    ])

    const baseSlug = deriveSlug(input.name)
    let slug = baseSlug
    let attempt = 1

    // Retry up to 10× on slug collision (append -2, -3, ...)
    let community: CommunityRow | null = null
    while (attempt <= 10) {
      const existing = await this.repo.findBySlug(slug)
      if (!existing) break
      attempt++
      slug = `${baseSlug}-${attempt}`
    }

    community = await this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient
      const created = await this.repo.create(
        {
          slug,
          name: input.name,
          description: input.description,
          category: input.category,
          iconUrl,
          coverUrl,
          visibility: input.visibility,
          ownerId,
        },
        exec,
      )
      await this.membersRepo.insertMember(
        {
          communityId: created.id,
          userId: ownerId,
          role: 'owner',
          status: 'active',
        },
        exec,
      )
      await this.repo.incrementMemberCount(created.id, exec)
      return created
    })

    await this.auditLog.record('community_create', community.id, ownerId)
    return community
  }

  async updateCommunity(
    actorId: string,
    communityId: string,
    patch: UpdateCommunityInput,
    coverFile?: MediaUpload | null,
    iconFile?: MediaUpload | null,
  ): Promise<CommunityRow> {
    const existing = await this.repo.findById(communityId)
    if (!existing) throw new CommunitiesError('COMMUNITY_NOT_FOUND')
    if (existing.ownerId !== actorId) throw new CommunitiesError('NOT_OWNER')
    if (existing.deletedAt) throw new CommunitiesError('COMMUNITY_DELETED')

    const data: Record<string, unknown> = { ...patch }
    if (coverFile) {
      data.coverUrl = await this.uploadCover(communityId, coverFile)
    }
    if (iconFile) {
      data.iconUrl = await this.uploadIcon(communityId, iconFile)
    }

    const updated = await this.repo.update(communityId, data)
    await this.auditLog.record('community_update', communityId, actorId, { metadata: { fields: Object.keys(data) } })
    return updated
  }

  async softDeleteCommunity(actorId: string, communityId: string): Promise<void> {
    const existing = await this.repo.findById(communityId)
    if (!existing) throw new CommunitiesError('COMMUNITY_NOT_FOUND')
    if (existing.ownerId !== actorId) throw new CommunitiesError('NOT_OWNER')
    if (existing.deletedAt) throw new CommunitiesError('COMMUNITY_DELETED')

    await this.repo.softDelete(communityId)
    await this.auditLog.record('community_delete', communityId, actorId)
  }

  async getForViewer(
    idOrSlug: string,
    viewerId: string | null,
  ): Promise<CommunityRow> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
    const community = isUuid
      ? await this.repo.findById(idOrSlug)
      : await this.repo.findBySlug(idOrSlug)

    if (!community || community.deletedAt) throw new CommunitiesError('COMMUNITY_NOT_FOUND')

    if (community.visibility === 'private' || community.visibility === 'restricted') {
      if (viewerId) {
        const membership = await this.membersRepo.findByCommunityAndUser(community.id, viewerId)
        if (!membership) {
          if (community.visibility === 'private') {
            // Private: non-members get stripped metadata — handled at controller level via isPrivateNonMember flag
            return community
          }
          // Restricted: non-members can see summary
          return community
        }
        if (membership.status === 'banned') throw new CommunitiesError('BANNED')
      } else if (community.visibility === 'private') {
        return community
      }
    }

    return community
  }

  async assertCanView(viewerId: string | null, community: CommunityRow): Promise<void> {
    if (community.visibility === 'public') return
    if (!viewerId) {
      if (community.visibility === 'private') throw new CommunitiesError('NOT_MEMBER')
      return // restricted: anonymous can see summary
    }
    const membership = await this.membersRepo.findByCommunityAndUser(community.id, viewerId)
    if (!membership) {
      if (community.visibility === 'private') throw new CommunitiesError('NOT_MEMBER')
      return
    }
    if (membership.status === 'banned') throw new CommunitiesError('BANNED')
  }

  async assertNotBanned(viewerId: string, communityId: string): Promise<void> {
    const membership = await this.membersRepo.findByCommunityAndUser(communityId, viewerId)
    if (membership && membership.status === 'banned') throw new CommunitiesError('BANNED')
  }

  /**
   * Returns whether the viewer is a non-member of a private community.
   * Used by the controller to strip metadata before serialization.
   */
  async isPrivateNonMember(community: CommunityRow, viewerId: string | null): Promise<boolean> {
    if (community.visibility !== 'private') return false
    if (!viewerId) return true
    const membership = await this.membersRepo.findByCommunityAndUser(community.id, viewerId)
    return !membership || membership.status !== 'active'
  }

  async listOwned(
    ownerId: string,
    query: { cursor?: string; limit: number },
  ) {
    return this.repo.listByOwner(ownerId, query)
  }

  async listJoined(
    viewerId: string,
    query: { cursor?: string; limit: number },
  ) {
    return this.repo.listByMembership(viewerId, query)
  }

  async listDiscover(
    viewerId: string | null,
    query: ListCommunitiesQuery,
  ) {
    return this.repo.listVisible(viewerId, query)
  }

  async findModerators(communityId: string) {
    return this.repo.findModerators(communityId)
  }
}
