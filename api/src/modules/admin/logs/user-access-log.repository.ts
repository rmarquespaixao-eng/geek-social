import { desc, eq, and, count, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { userAccessLog } from '../../../shared/infra/database/schema.js'

export class UserAccessLogRepository {
  constructor(private readonly db: DatabaseClient) {}

  async insert(entry: {
    userId: string | null
    action: string
    path?: string
    ip?: string
    userAgent?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.db.insert(userAccessLog).values({
      userId: entry.userId ?? null,
      action: entry.action,
      path: entry.path ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? {},
    })
  }

  async list(filters: {
    userId?: string
    action?: string
    page: number
    pageSize: number
  }): Promise<{ rows: typeof userAccessLog.$inferSelect[]; total: number }> {
    const { page, pageSize } = filters
    const conditions = []
    if (filters.userId) conditions.push(eq(userAccessLog.userId, filters.userId))
    if (filters.action) conditions.push(eq(userAccessLog.action, filters.action))
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(userAccessLog).where(where),
      this.db.select().from(userAccessLog).where(where)
        .orderBy(desc(userAccessLog.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ])
    return { rows, total: Number(totalRes[0]?.count ?? 0) }
  }
}
