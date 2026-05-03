import { eq, and, count, desc } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { reports } from '../../../shared/infra/database/schema.js'
import type { ListReportsQuery } from './admin-reports.schema.js'

export type AdminReportRow = typeof reports.$inferSelect

export class AdminReportsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(filters: ListReportsQuery): Promise<{ rows: AdminReportRow[]; total: number }> {
    const { page, pageSize } = filters
    const conditions = []

    if (filters.status) {
      // Mapeia status 'reviewing'/'resolved' para os valores do DB
      const dbStatus = filters.status === 'reviewing' ? 'reviewed'
        : filters.status === 'resolved' ? 'reviewed'
        : filters.status
      conditions.push(eq(reports.status, dbStatus as 'pending' | 'reviewed' | 'dismissed'))
    }
    if (filters.targetType) conditions.push(eq(reports.targetType, filters.targetType))
    if (filters.reason) conditions.push(eq(reports.reason, filters.reason))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(reports).where(where),
      this.db.select().from(reports).where(where)
        .orderBy(desc(reports.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ])

    return { rows, total: Number(totalRes[0]?.count ?? 0) }
  }

  /**
   * Atualiza status com guarda de concorrência otimista.
   * Retorna false se o status atual diverge de `expectedCurrentStatus`.
   */
  async updateStatus(
    id: string,
    newStatus: 'reviewed' | 'dismissed',
    expectedCurrentStatus?: 'pending' | 'reviewed' | 'dismissed',
  ): Promise<AdminReportRow | null> {
    const conditions = [eq(reports.id, id)]
    if (expectedCurrentStatus) {
      conditions.push(eq(reports.status, expectedCurrentStatus))
    }

    const [row] = await this.db.update(reports)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(...conditions))
      .returning()
    return row ?? null
  }
}
