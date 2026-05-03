import { eq, and, count, sql, inArray } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { lgpdRequests } from '../../../shared/infra/database/schema.js'
import type { ListLgpdQuery } from './lgpd.schema.js'
import { LGPD_DEADLINE_DAYS } from './lgpd.service.js'

export type LgpdRequestRow = typeof lgpdRequests.$inferSelect

export class LgpdRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(filters: ListLgpdQuery): Promise<{ rows: LgpdRequestRow[]; total: number }> {
    const { page, pageSize } = filters
    const conditions = []

    if (filters.status) conditions.push(eq(lgpdRequests.status, filters.status))
    if (filters.type) conditions.push(eq(lgpdRequests.type, filters.type))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(lgpdRequests).where(where),
      // Ordena por prazo legal ascendente — mais urgentes primeiro
      this.db.select().from(lgpdRequests).where(where)
        .orderBy(sql`${lgpdRequests.createdAt} + INTERVAL '${sql.raw(String(LGPD_DEADLINE_DAYS))} days' ASC`)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ])

    return {
      rows: rows.map(r => ({
        ...r,
        // Prazo legal calculado em runtime conforme plano (CL-4)
      })),
      total: Number(totalRes[0]?.count ?? 0),
    }
  }

  async create(userId: string, type: typeof lgpdRequests.$inferInsert['type']): Promise<LgpdRequestRow> {
    const [row] = await this.db.insert(lgpdRequests).values({ userId, type }).returning()
    return row
  }

  async findPendingByUserId(userId: string): Promise<LgpdRequestRow | null> {
    const [row] = await this.db
      .select()
      .from(lgpdRequests)
      .where(and(eq(lgpdRequests.userId, userId), inArray(lgpdRequests.status, ['pending', 'processing'])))
      .limit(1)
    return row ?? null
  }

  async findById(id: string): Promise<LgpdRequestRow | null> {
    const [row] = await this.db.select().from(lgpdRequests).where(eq(lgpdRequests.id, id)).limit(1)
    return row ?? null
  }

  async transitionStatus(
    id: string,
    allowedFromStatuses: Array<typeof lgpdRequests.$inferSelect['status']>,
    newStatus: typeof lgpdRequests.$inferSelect['status'],
    decidedBy: string,
    notes?: string,
  ): Promise<LgpdRequestRow | null> {
    const conditions = [eq(lgpdRequests.id, id)]
    if (allowedFromStatuses.length === 1) {
      conditions.push(eq(lgpdRequests.status, allowedFromStatuses[0]))
    } else if (allowedFromStatuses.length > 1) {
      conditions.push(inArray(lgpdRequests.status, allowedFromStatuses))
    }

    const set: Partial<typeof lgpdRequests.$inferInsert> = {
      status: newStatus,
      decidedBy,
      decidedAt: new Date(),
      notes: notes ?? null,
    }
    if (newStatus === 'completed') {
      set.completedAt = new Date()
    }

    const [row] = await this.db.update(lgpdRequests)
      .set(set)
      .where(and(...conditions))
      .returning()
    return row ?? null
  }
}
