import { and, desc, eq, isNull, or, sql, ilike, inArray, lt } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import {
  communities,
  communityMembers,
  users,
} from '../../shared/infra/database/schema.js'
import type { CommunityVisibility } from './communities.schema.js'
import type { CommunityCategory } from './categories.js'

export type CommunityRow = {
  id: string
  slug: string
  name: string
  description: string
  category: CommunityCategory
  iconUrl: string
  coverUrl: string
  visibility: CommunityVisibility
  ownerId: string | null
  memberCount: number
  topicCount: number
  rules: string | null
  welcomeMessage: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type MemberRow = {
  id: string
  communityId: string
  userId: string
  role: 'owner' | 'moderator' | 'member'
  status: 'pending' | 'active' | 'banned'
  banReason: string | null
  joinedAt: Date
  approvedAt: Date | null
}

export type MemberWithUser = MemberRow & {
  user: { id: string; displayName: string; avatarUrl: string | null }
}

export type JoinRequestRow = {
  id: string
  communityId: string
  userId: string
  status: 'pending' | 'approved' | 'rejected'
  decidedBy: string | null
  decidedAt: Date | null
  createdAt: Date
}

export type TopicRow = {
  postId: string
  communityId: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string | null
  pinned: boolean
  locked: boolean
  movedFromCommunityId: string | null
  reactionCount: number
  commentCount: number
  createdAt: Date
  updatedAt: Date
}

export type CreateCommunityData = {
  slug: string
  name: string
  description: string
  category: CommunityCategory
  iconUrl: string
  coverUrl: string
  visibility: CommunityVisibility
  ownerId: string
}

export type UpdateCommunityData = Partial<{
  name: string
  description: string
  category: CommunityCategory
  iconUrl: string
  coverUrl: string
  visibility: CommunityVisibility
  rules: string | null
  welcomeMessage: string | null
}>

type CommunityCursor = { createdAt: Date; id: string }

function encodeCursor(c: CommunityCursor): string {
  return Buffer.from(JSON.stringify({ t: c.createdAt.toISOString(), i: c.id })).toString('base64url')
}

function decodeCursor(token: string | undefined): CommunityCursor | null {
  if (!token) return null
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8')
    const parsed = JSON.parse(raw) as { t: string; i: string }
    return { createdAt: new Date(parsed.t), id: parsed.i }
  } catch {
    return null
  }
}

/** SQL fragment that filters out soft-deleted rows. */
function notDeleted() {
  return isNull(communities.deletedAt)
}

export class CommunitiesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateCommunityData, tx?: DatabaseClient): Promise<CommunityRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .insert(communities)
      .values({
        slug: data.slug,
        name: data.name,
        description: data.description,
        category: data.category,
        iconUrl: data.iconUrl,
        coverUrl: data.coverUrl,
        visibility: data.visibility,
        ownerId: data.ownerId,
      })
      .returning()
    return row as CommunityRow
  }

  async findById(id: string, tx?: DatabaseClient): Promise<CommunityRow | null> {
    const exec = tx ?? this.db
    const [row] = await exec
      .select()
      .from(communities)
      .where(eq(communities.id, id))
      .limit(1)
    return (row as CommunityRow | undefined) ?? null
  }

  async findBySlug(slug: string, tx?: DatabaseClient): Promise<CommunityRow | null> {
    const exec = tx ?? this.db
    const [row] = await exec
      .select()
      .from(communities)
      .where(eq(communities.slug, slug))
      .limit(1)
    return (row as CommunityRow | undefined) ?? null
  }

  async update(id: string, data: UpdateCommunityData, tx?: DatabaseClient): Promise<CommunityRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .update(communities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(communities.id, id))
      .returning()
    return row as CommunityRow
  }

  async softDelete(id: string, tx?: DatabaseClient): Promise<CommunityRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .update(communities)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(communities.id, id))
      .returning()
    return row as CommunityRow
  }

  /**
   * Lists communities visible to the viewer:
   * - public (not deleted)
   * - restricted/private where viewer is an active member
   */
  async listVisible(
    viewerId: string | null,
    query: { category?: CommunityCategory; visibility?: CommunityVisibility; search?: string; cursor?: string; limit: number },
  ): Promise<{ communities: CommunityRow[]; nextCursor: string | null }> {
    const conditions = [notDeleted()]

    // Visibility filter: public and restricted are both discoverable by anyone
    if (query.visibility) {
      conditions.push(eq(communities.visibility, query.visibility))
    } else {
      conditions.push(inArray(communities.visibility, ['public', 'restricted']))
    }

    if (query.category) conditions.push(eq(communities.category, query.category))
    if (query.search) {
      const escaped = query.search.replace(/[\\%_]/g, '\\$&')
      conditions.push(
        or(
          ilike(communities.name, `%${escaped}%`),
          ilike(communities.description, `%${escaped}%`),
        )!,
      )
    }

    const cursor = decodeCursor(query.cursor)
    if (cursor) {
      conditions.push(
        or(
          lt(communities.createdAt, cursor.createdAt),
          and(eq(communities.createdAt, cursor.createdAt), sql`${communities.id} < ${cursor.id}`),
        )!,
      )
    }

    const rows = (await this.db
      .select()
      .from(communities)
      .where(and(...conditions))
      .orderBy(desc(communities.createdAt))
      .limit(query.limit + 1)) as CommunityRow[]

    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
    return { communities: page, nextCursor }
  }

  async listByOwner(
    ownerId: string,
    query: { cursor?: string; limit: number },
  ): Promise<{ communities: CommunityRow[]; nextCursor: string | null }> {
    const conditions = [eq(communities.ownerId, ownerId), notDeleted()]
    const cursor = decodeCursor(query.cursor)
    if (cursor) {
      conditions.push(
        or(
          lt(communities.createdAt, cursor.createdAt),
          and(eq(communities.createdAt, cursor.createdAt), sql`${communities.id} < ${cursor.id}`),
        )!,
      )
    }

    const rows = (await this.db
      .select()
      .from(communities)
      .where(and(...conditions))
      .orderBy(desc(communities.createdAt))
      .limit(query.limit + 1)) as CommunityRow[]

    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
    return { communities: page, nextCursor }
  }

  async listByMembership(
    userId: string,
    query: { cursor?: string; limit: number },
  ): Promise<{ communities: CommunityRow[]; nextCursor: string | null }> {
    const conditions = [
      notDeleted(),
      sql`EXISTS (
        SELECT 1 FROM community_members cm
        WHERE cm.community_id = ${communities.id}
          AND cm.user_id = ${userId}
          AND cm.status = 'active'
      )`,
    ]
    const cursor = decodeCursor(query.cursor)
    if (cursor) {
      conditions.push(
        or(
          lt(communities.createdAt, cursor.createdAt),
          and(eq(communities.createdAt, cursor.createdAt), sql`${communities.id} < ${cursor.id}`),
        )!,
      )
    }

    const rows = (await this.db
      .select()
      .from(communities)
      .where(and(...conditions))
      .orderBy(desc(communities.createdAt))
      .limit(query.limit + 1)) as CommunityRow[]

    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
    return { communities: page, nextCursor }
  }

  async incrementTopicCount(id: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec
      .update(communities)
      .set({ topicCount: sql`${communities.topicCount} + 1`, updatedAt: new Date() })
      .where(eq(communities.id, id))
  }

  async decrementTopicCount(id: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec
      .update(communities)
      .set({ topicCount: sql`greatest(${communities.topicCount} - 1, 0)`, updatedAt: new Date() })
      .where(eq(communities.id, id))
  }

  async incrementMemberCount(id: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec
      .update(communities)
      .set({ memberCount: sql`${communities.memberCount} + 1`, updatedAt: new Date() })
      .where(eq(communities.id, id))
  }

  async decrementMemberCount(id: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec
      .update(communities)
      .set({ memberCount: sql`greatest(${communities.memberCount} - 1, 0)`, updatedAt: new Date() })
      .where(eq(communities.id, id))
  }

  async findModerators(communityId: string): Promise<{ userId: string; displayName: string; avatarUrl: string | null }[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(communityMembers)
      .innerJoin(users, eq(users.id, communityMembers.userId))
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          inArray(communityMembers.role, ['owner', 'moderator']),
          eq(communityMembers.status, 'active'),
        ),
      )
    return rows
  }
}
