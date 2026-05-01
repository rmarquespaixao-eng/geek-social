import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CommunitiesService, MediaUpload } from './communities.service.js'
import type { MembersService } from './members.service.js'
import { CommunitiesError } from './communities.errors.js'
import {
  createCommunitySchema,
  updateCommunitySchema,
  listCommunitiesQuerySchema,
} from './communities.schema.js'
import {
  serializeCommunitySummary,
} from './communities.serializer.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

const STATUS_BY_CODE: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_OWNER: 403,
  NOT_MODERATOR: 403,
  NOT_MEMBER: 403,
  MEMBER_NOT_FOUND: 404,
  BANNED: 403,
  COMMUNITY_DELETED: 403,
  COMMUNITY_NOT_FOUND: 404,
  MEMBERSHIP_NOT_FOUND: 404,
  INVITE_NOT_FOUND: 404,
  JOIN_REQUEST_NOT_FOUND: 404,
  POLL_NOT_FOUND: 404,
  TOPIC_NOT_FOUND: 404,
  ALREADY_MEMBER: 409,
  ALREADY_PENDING: 409,
  ALREADY_BANNED: 409,
  MEMBER_BANNED: 403,
  COOLDOWN_ACTIVE: 429,
  ALREADY_INVITED: 409,
  OWNER_CANNOT_LEAVE: 409,
  OWNER_CANNOT_BE_BANNED: 409,
  TRANSFER_PENDING: 409,
  INVALID_MEMBER_STATE: 409,
  POLL_CLOSED: 409,
  TOPIC_LOCKED: 409,
  INVALID_CATEGORY: 422,
  INVALID_VISIBILITY: 422,
  UNSUPPORTED_MEDIA_FORMAT: 422,
  MEDIA_TOO_LARGE: 422,
  INVALID_COVER: 422,
  INVALID_ICON: 422,
  INVALID_POLL_OPTIONS: 422,
  INVALID_POLL_DURATION: 422,
  STORAGE_NOT_CONFIGURED: 503,
  STORAGE_UNAVAILABLE: 503,
}

export function mapCommunitiesError(e: unknown, reply: FastifyReply) {
  if (e instanceof CommunitiesError) {
    const status = STATUS_BY_CODE[e.code] ?? 400
    reply.request.log.warn(
      { url: reply.request.url, method: reply.request.method, code: e.code, status },
      'CommunitiesError',
    )
    return reply.status(status).send({ error: e.code })
  }
  throw e
}

/**
 * Parses multipart body for community create/update.
 * Separates files (cover, icon) from text fields.
 */
export async function parseMultipartCommunity(
  request: FastifyRequest,
): Promise<{ cover: MediaUpload | null; icon: MediaUpload | null; raw: Record<string, unknown> }> {
  const raw: Record<string, unknown> = {}
  let cover: MediaUpload | null = null
  let icon: MediaUpload | null = null

  const parts = request.parts()
  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname === 'cover' || part.fieldname === 'icon') {
        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk as Buffer)
        const data = { buffer: Buffer.concat(chunks), mimeType: part.mimetype }
        if (part.fieldname === 'cover') cover = data
        else icon = data
      } else {
        for await (const _ of part.file) { /* drain without buffering */ }
      }
    } else {
      raw[part.fieldname] = part.value
    }
  }

  return { cover, icon, raw }
}

export class CommunitiesController {
  constructor(
    private readonly service: CommunitiesService,
    private readonly membersService: MembersService,
  ) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      let cover: MediaUpload | null = null
      let icon: MediaUpload | null = null
      let body: unknown = request.body

      if (request.isMultipart && request.isMultipart()) {
        const parsed = await parseMultipartCommunity(request)
        cover = parsed.cover
        icon = parsed.icon
        body = parsed.raw
      }

      const parsed = createCommunitySchema.safeParse(body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
      }
      if (!cover) return reply.status(422).send({ error: 'INVALID_COVER' })
      if (!icon) return reply.status(422).send({ error: 'INVALID_ICON' })

      const community = await this.service.createCommunity(userId, parsed.data, cover, icon)
      return reply.status(201).send({ community: serializeCommunitySummary(community) })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const viewer = (request.user as AccessTokenClaims | undefined)
    const viewerId = viewer?.userId ?? null
    const q = listCommunitiesQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_INPUT', issues: q.error.issues })

    const result = await this.service.listDiscover(viewerId, q.data)
    return reply.send({
      communities: result.communities.map(serializeCommunitySummary),
      nextCursor: result.nextCursor,
    })
  }

  async listOwned(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const q = listCommunitiesQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_INPUT', issues: q.error.issues })

    const result = await this.service.listOwned(userId, q.data)
    return reply.send({
      communities: result.communities.map(serializeCommunitySummary),
      nextCursor: result.nextCursor,
    })
  }

  async listJoined(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const q = listCommunitiesQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_INPUT', issues: q.error.issues })

    const result = await this.service.listJoined(userId, q.data)
    return reply.send({
      communities: result.communities.map(serializeCommunitySummary),
      nextCursor: result.nextCursor,
    })
  }

  async get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId: viewerId } = request.user as AccessTokenClaims
    try {
      const community = await this.service.getForViewer(request.params.id, viewerId)
      const membership = await this.membersService.getMembership(community.id, viewerId)
      const isActiveMember = membership?.status === 'active'

      // Restricted non-members (no membership or pending): show summary + their status, hide moderators list
      if (community.visibility === 'restricted' && !isActiveMember) {
        return reply.send({
          community: serializeCommunitySummary(community),
          viewerMembership: membership ? { role: membership.role, status: membership.status, joinedAt: membership.joinedAt.toISOString() } : null,
          moderators: [],
        })
      }

      const moderators = await this.service.findModerators(community.id)
      return reply.send({
        community: serializeCommunitySummary(community),
        viewerMembership: membership ? {
          role: membership.role,
          status: membership.status,
          joinedAt: membership.joinedAt.toISOString(),
        } : null,
        moderators,
        pendingTransfer: null,
      })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async update(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      let cover: MediaUpload | null = null
      let icon: MediaUpload | null = null
      let body: unknown = request.body

      if (request.isMultipart && request.isMultipart()) {
        const parsed = await parseMultipartCommunity(request)
        cover = parsed.cover
        icon = parsed.icon
        body = parsed.raw
      }

      const parsed = updateCommunitySchema.safeParse(body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
      }

      const community = await this.service.updateCommunity(
        userId,
        request.params.id,
        parsed.data,
        cover,
        icon,
      )
      return reply.send({ community: serializeCommunitySummary(community) })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async softDelete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.softDeleteCommunity(userId, request.params.id)
      return reply.status(204).send()
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }
}
