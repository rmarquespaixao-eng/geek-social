import { eq, and, count, desc, sql, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { reports, posts, postComments, messages } from '../../../shared/infra/database/schema.js'
import type { ListReportsQuery } from './admin-reports.schema.js'

export type AdminReportRow = typeof reports.$inferSelect & { reportedUserId: string | null }

export class AdminReportsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async list(filters: ListReportsQuery): Promise<{ rows: AdminReportRow[]; total: number }> {
    const { page, pageSize } = filters
    const conditions = []

    if (filters.status) {
      const dbStatus = filters.status === 'reviewing' ? 'reviewed'
        : filters.status === 'resolved' ? 'reviewed'
        : filters.status
      conditions.push(eq(reports.status, dbStatus as 'pending' | 'reviewed' | 'dismissed'))
    }
    if (filters.targetType) conditions.push(eq(reports.targetType, filters.targetType))
    if (filters.reason) conditions.push(eq(reports.reason, filters.reason))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    // reportedUserId: resolves the author of the reported content across all target types
    const reportedUserIdExpr = sql<string | null>`
      CASE
        WHEN ${reports.targetType} = 'user' THEN ${reports.targetId}
        WHEN ${reports.targetType} IN ('post', 'community_topic') THEN ${posts.userId}
        WHEN ${reports.targetType} = 'community_comment' THEN ${postComments.userId}
        WHEN ${reports.targetType} = 'message' THEN ${messages.userId}
        ELSE NULL
      END
    `.as('reported_user_id')

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(reports).where(where),
      this.db
        .select({
          id: reports.id,
          reporterId: reports.reporterId,
          targetType: reports.targetType,
          targetId: reports.targetId,
          reason: reports.reason,
          description: reports.description,
          status: reports.status,
          createdAt: reports.createdAt,
          updatedAt: reports.updatedAt,
          reportedUserId: reportedUserIdExpr,
        })
        .from(reports)
        .leftJoin(posts, and(
          or(eq(reports.targetType, 'post'), eq(reports.targetType, 'community_topic')),
          eq(posts.id, reports.targetId),
        ))
        .leftJoin(postComments, and(
          eq(reports.targetType, 'community_comment'),
          eq(postComments.id, reports.targetId),
        ))
        .leftJoin(messages, and(
          eq(reports.targetType, 'message'),
          eq(messages.id, reports.targetId),
        ))
        .where(where)
        .orderBy(desc(reports.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ])

    return { rows: rows as AdminReportRow[], total: Number(totalRes[0]?.count ?? 0) }
  }

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
    return row ? { ...row, reportedUserId: null } : null
  }
}
