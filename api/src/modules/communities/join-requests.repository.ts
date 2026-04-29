import { and, eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { communityJoinRequests, users } from '../../shared/infra/database/schema.js'
import type { JoinRequestRow } from './communities.repository.js'

export type JoinRequestWithUser = JoinRequestRow & {
  user: { id: string; displayName: string; avatarUrl: string | null }
}

export class JoinRequestsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(communityId: string, userId: string, tx?: DatabaseClient): Promise<JoinRequestRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .insert(communityJoinRequests)
      .values({ communityId, userId })
      .returning()
    return row as JoinRequestRow
  }

  async findPending(communityId: string, userId: string, tx?: DatabaseClient): Promise<JoinRequestRow | null> {
    const exec = tx ?? this.db
    const [row] = await exec
      .select()
      .from(communityJoinRequests)
      .where(
        and(
          eq(communityJoinRequests.communityId, communityId),
          eq(communityJoinRequests.userId, userId),
          eq(communityJoinRequests.status, 'pending'),
        ),
      )
      .limit(1)
    return (row as JoinRequestRow | undefined) ?? null
  }

  async findById(id: string, tx?: DatabaseClient): Promise<JoinRequestRow | null> {
    const exec = tx ?? this.db
    const [row] = await exec
      .select()
      .from(communityJoinRequests)
      .where(eq(communityJoinRequests.id, id))
      .limit(1)
    return (row as JoinRequestRow | undefined) ?? null
  }

  async findByUserInCommunity(communityId: string, userId: string, tx?: DatabaseClient): Promise<JoinRequestRow | null> {
    const exec = tx ?? this.db
    const [row] = await exec
      .select()
      .from(communityJoinRequests)
      .where(
        and(
          eq(communityJoinRequests.communityId, communityId),
          eq(communityJoinRequests.userId, userId),
        ),
      )
      .limit(1)
    return (row as JoinRequestRow | undefined) ?? null
  }

  async listPending(communityId: string, opts?: { limit?: number }): Promise<JoinRequestWithUser[]> {
    const rows = await this.db
      .select({
        id: communityJoinRequests.id,
        communityId: communityJoinRequests.communityId,
        userId: communityJoinRequests.userId,
        status: communityJoinRequests.status,
        decidedBy: communityJoinRequests.decidedBy,
        decidedAt: communityJoinRequests.decidedAt,
        createdAt: communityJoinRequests.createdAt,
        userDisplayName: users.displayName,
        userAvatarUrl: users.avatarUrl,
      })
      .from(communityJoinRequests)
      .innerJoin(users, eq(users.id, communityJoinRequests.userId))
      .where(
        and(
          eq(communityJoinRequests.communityId, communityId),
          eq(communityJoinRequests.status, 'pending'),
        ),
      )
      .limit(opts?.limit ?? 50)

    return rows.map(r => ({
      id: r.id,
      communityId: r.communityId,
      userId: r.userId,
      status: r.status as 'pending' | 'approved' | 'rejected',
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
      user: { id: r.userId, displayName: r.userDisplayName, avatarUrl: r.userAvatarUrl },
    }))
  }

  async markDecided(
    id: string,
    status: 'approved' | 'rejected',
    decidedBy: string,
    tx?: DatabaseClient,
  ): Promise<JoinRequestRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .update(communityJoinRequests)
      .set({ status, decidedBy, decidedAt: new Date() })
      .where(eq(communityJoinRequests.id, id))
      .returning()
    return row as JoinRequestRow
  }
}
