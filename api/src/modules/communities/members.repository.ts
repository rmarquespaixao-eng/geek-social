import { and, eq, inArray, sql, desc, lt, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { communityMembers, users } from '../../shared/infra/database/schema.js'
import type { MemberRow, MemberWithUser } from './communities.repository.js'

type MemberCursor = { joinedAt: Date; id: string }

function encodeMemberCursor(c: MemberCursor): string {
  return Buffer.from(JSON.stringify({ t: c.joinedAt.toISOString(), i: c.id })).toString('base64url')
}

function decodeMemberCursor(token: string | undefined): MemberCursor | null {
  if (!token) return null
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8')
    const parsed = JSON.parse(raw) as { t: string; i: string }
    return { joinedAt: new Date(parsed.t), id: parsed.i }
  } catch {
    return null
  }
}

export type { MemberRow, MemberWithUser } from './communities.repository.js'

export type InsertMemberData = {
  communityId: string
  userId: string
  role: 'owner' | 'moderator' | 'member'
  status: 'pending' | 'active' | 'banned'
  banReason?: string | null
}

export class MembersRepository {
  constructor(private readonly db: DatabaseClient) {}

  async insertMember(data: InsertMemberData, tx?: DatabaseClient): Promise<MemberRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .insert(communityMembers)
      .values({
        communityId: data.communityId,
        userId: data.userId,
        role: data.role,
        status: data.status,
        banReason: data.banReason ?? null,
      })
      .returning()
    return row as MemberRow
  }

  async findByCommunityAndUser(
    communityId: string,
    userId: string,
    tx?: DatabaseClient,
  ): Promise<MemberRow | null> {
    const exec = tx ?? this.db
    const [row] = await exec
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.userId, userId),
        ),
      )
      .limit(1)
    return (row as MemberRow | undefined) ?? null
  }

  async setRole(
    id: string,
    role: 'owner' | 'moderator' | 'member',
    tx?: DatabaseClient,
  ): Promise<MemberRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .update(communityMembers)
      .set({ role })
      .where(eq(communityMembers.id, id))
      .returning()
    return row as MemberRow
  }

  async setStatus(
    id: string,
    status: 'pending' | 'active' | 'banned',
    banReason?: string | null,
    tx?: DatabaseClient,
  ): Promise<MemberRow> {
    const exec = tx ?? this.db
    const patch: Record<string, unknown> = { status }
    if (status === 'active') patch.approvedAt = new Date()
    if (status === 'banned' && banReason !== undefined) patch.banReason = banReason
    const [row] = await exec
      .update(communityMembers)
      .set(patch)
      .where(eq(communityMembers.id, id))
      .returning()
    return row as MemberRow
  }

  async setStatusByUser(
    communityId: string,
    userId: string,
    status: 'pending' | 'active' | 'banned',
    banReason?: string | null,
    tx?: DatabaseClient,
  ): Promise<MemberRow> {
    const exec = tx ?? this.db
    const patch: Record<string, unknown> = { status }
    if (status === 'active') patch.approvedAt = new Date()
    if (status === 'banned' && banReason !== undefined) patch.banReason = banReason
    const [row] = await exec
      .update(communityMembers)
      .set(patch)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.userId, userId),
        ),
      )
      .returning()
    return row as MemberRow
  }

  async listByCommunity(
    communityId: string,
    opts?: { status?: 'pending' | 'active' | 'banned'; role?: 'owner' | 'moderator' | 'member'; limit?: number; cursor?: string },
  ): Promise<{ members: MemberWithUser[]; nextCursor: string | null }> {
    const limit = opts?.limit ?? 50
    const conditions = [eq(communityMembers.communityId, communityId)]
    if (opts?.status) conditions.push(eq(communityMembers.status, opts.status))
    if (opts?.role) conditions.push(eq(communityMembers.role, opts.role))

    const cursor = decodeMemberCursor(opts?.cursor)
    if (cursor) {
      conditions.push(
        or(
          lt(communityMembers.joinedAt, cursor.joinedAt),
          and(eq(communityMembers.joinedAt, cursor.joinedAt), sql`${communityMembers.id} < ${cursor.id}`),
        )!,
      )
    }

    const rows = await this.db
      .select({
        id: communityMembers.id,
        communityId: communityMembers.communityId,
        userId: communityMembers.userId,
        role: communityMembers.role,
        status: communityMembers.status,
        banReason: communityMembers.banReason,
        joinedAt: communityMembers.joinedAt,
        approvedAt: communityMembers.approvedAt,
        userDisplayName: users.displayName,
        userAvatarUrl: users.avatarUrl,
      })
      .from(communityMembers)
      .innerJoin(users, eq(users.id, communityMembers.userId))
      .where(and(...conditions))
      .orderBy(desc(communityMembers.joinedAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeMemberCursor({ joinedAt: last.joinedAt, id: last.id }) : null

    const members = page.map(r => ({
      id: r.id,
      communityId: r.communityId,
      userId: r.userId,
      role: r.role as 'owner' | 'moderator' | 'member',
      status: r.status as 'pending' | 'active' | 'banned',
      banReason: r.banReason,
      joinedAt: r.joinedAt,
      approvedAt: r.approvedAt,
      user: {
        id: r.userId,
        displayName: r.userDisplayName,
        avatarUrl: r.userAvatarUrl,
      },
    }))

    return { members, nextCursor }
  }

  async countActiveByCommunity(communityId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.status, 'active'),
        ),
      )
    return row?.count ?? 0
  }

  async findOwner(communityId: string): Promise<MemberRow | null> {
    const [row] = await this.db
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.role, 'owner'),
        ),
      )
      .limit(1)
    return (row as MemberRow | undefined) ?? null
  }

  async deleteByCommunityAndUser(communityId: string, userId: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec
      .delete(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.userId, userId),
        ),
      )
  }

  /**
   * Atomically swaps owner ↔ moderator/member roles within a transaction.
   * `fromUserId` must currently be owner; `toUserId` must be an active member.
   */
  async swapOwnerWithModerator(
    communityId: string,
    fromUserId: string,
    toUserId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(communityMembers)
      .set({ role: 'moderator' })
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.userId, fromUserId),
          eq(communityMembers.role, 'owner'),
        ),
      )
    await tx
      .update(communityMembers)
      .set({ role: 'owner' })
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.userId, toUserId),
          inArray(communityMembers.role, ['moderator', 'member']),
        ),
      )
  }
}
