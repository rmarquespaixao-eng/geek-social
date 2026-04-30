import { eq, and, notInArray, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { postReactions } from '../../shared/infra/database/schema.js'
import type { IReactionsRepository, Reaction, ReactionType, ReactionCounts } from '../../shared/contracts/reactions.repository.contract.js'

const ALL_REACTION_TYPES: ReactionType[] = ['power_up', 'epic', 'critical', 'loot', 'gg']

export class ReactionsRepository implements IReactionsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async upsert(postId: string, userId: string, type: ReactionType): Promise<Reaction> {
    const result = await this.db.insert(postReactions)
      .values({ postId, userId, type })
      .onConflictDoUpdate({
        target: [postReactions.postId, postReactions.userId],
        set: { type },
      })
      .returning()
    return result[0] as Reaction
  }

  async delete(postId: string, userId: string): Promise<void> {
    await this.db.delete(postReactions)
      .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)))
  }

  async findByPostAndUser(postId: string, userId: string): Promise<Reaction | null> {
    const result = await this.db.select().from(postReactions)
      .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)))
      .limit(1)
    return (result[0] as Reaction) ?? null
  }

  async countsByPostId(postId: string): Promise<ReactionCounts> {
    const rows = await this.db
      .select({ type: postReactions.type, count: sql<number>`count(*)::int` })
      .from(postReactions)
      .where(eq(postReactions.postId, postId))
      .groupBy(postReactions.type)

    const counts = Object.fromEntries(ALL_REACTION_TYPES.map(t => [t, 0])) as ReactionCounts
    for (const row of rows) {
      counts[row.type as ReactionType] = row.count
    }
    return counts
  }

  async countsByPostIdExcludingUsers(postId: string, excludedUserIds: string[]): Promise<ReactionCounts> {
    const conditions = [eq(postReactions.postId, postId)]
    if (excludedUserIds.length > 0) {
      conditions.push(notInArray(postReactions.userId, excludedUserIds))
    }
    const rows = await this.db
      .select({ type: postReactions.type, count: sql<number>`count(*)::int` })
      .from(postReactions)
      .where(and(...conditions))
      .groupBy(postReactions.type)

    const counts = Object.fromEntries(ALL_REACTION_TYPES.map(t => [t, 0])) as ReactionCounts
    for (const row of rows) {
      counts[row.type as ReactionType] = row.count
    }
    return counts
  }
}
