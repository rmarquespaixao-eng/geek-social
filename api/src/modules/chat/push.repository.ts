import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { pushSubscriptions } from '../../shared/infra/database/schema.js'
import type { IPushRepository, PushSubscription } from '../../shared/contracts/push.repository.contract.js'

export class PushRepository implements IPushRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(userId: string, data: { endpoint: string; p256dh: string; auth: string }): Promise<PushSubscription> {
    const [row] = await this.db.insert(pushSubscriptions)
      .values({ userId, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: data.p256dh, auth: data.auth },
      })
      .returning()
    return this.map(row)
  }

  async findByUserId(userId: string): Promise<PushSubscription[]> {
    const rows = await this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    return rows.map(r => this.map(r))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))
  }

  private map(row: typeof pushSubscriptions.$inferSelect): PushSubscription {
    return {
      id: row.id,
      userId: row.userId,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      createdAt: row.createdAt,
    }
  }
}
