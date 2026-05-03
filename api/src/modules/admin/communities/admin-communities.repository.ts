import { eq, isNull, isNotNull, ilike, or, count, and } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { communities } from '../../../shared/infra/database/schema.js'
import type { ListCommunitiesQuery } from './admin-communities.schema.js'

export type AdminCommunityRow = typeof communities.$inferSelect

export class AdminCommunitiesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(filters: ListCommunitiesQuery): Promise<{ rows: AdminCommunityRow[]; total: number }> {
    const { page, pageSize } = filters
    const conditions = []

    if (filters.search) {
      const safe = filters.search.replace(/[\\%_]/g, '\\$&')
      conditions.push(or(
        ilike(communities.name, `%${safe}%`),
        ilike(communities.slug, `%${safe}%`),
      ))
    }

    if (filters.status === 'active') {
      conditions.push(isNull(communities.deletedAt))
    } else if (filters.status === 'suspended') {
      conditions.push(isNotNull(communities.deletedAt))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(communities).where(where),
      this.db.select().from(communities).where(where)
        .orderBy(communities.createdAt)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ])

    return { rows, total: Number(totalRes[0]?.count ?? 0) }
  }

  async findById(id: string): Promise<AdminCommunityRow | null> {
    const [row] = await this.db.select().from(communities).where(eq(communities.id, id)).limit(1)
    return row ?? null
  }

  async setStatus(id: string, status: 'active' | 'suspended'): Promise<AdminCommunityRow | null> {
    const [row] = await this.db.update(communities)
      .set({
        deletedAt: status === 'suspended' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(communities.id, id))
      .returning()
    return row ?? null
  }
}
