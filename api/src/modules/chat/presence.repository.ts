import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { userPresence } from '../../shared/infra/database/schema.js'
import type { IPresenceRepository, UserPresence } from '../../shared/contracts/presence.repository.contract.js'

export class PresenceRepository implements IPresenceRepository {
  constructor(private readonly db: DatabaseClient) {}

  async upsertLastSeen(userId: string, lastSeenAt: Date): Promise<void> {
    await this.db.insert(userPresence)
      .values({ userId, lastSeenAt, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPresence.userId,
        set: { lastSeenAt, updatedAt: new Date() },
      })
  }

  async findByUserId(userId: string): Promise<UserPresence | null> {
    const [row] = await this.db.select().from(userPresence).where(eq(userPresence.userId, userId)).limit(1)
    return row ? { userId: row.userId, lastSeenAt: row.lastSeenAt, updatedAt: row.updatedAt } : null
  }
}
