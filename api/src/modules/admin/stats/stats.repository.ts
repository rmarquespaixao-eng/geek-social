import { sql, count, isNull, eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { users, communities, reports, events, messages } from '../../../shared/infra/database/schema.js'
import type { StatsResponse } from './stats.schema.js'

export class StatsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async aggregate(): Promise<StatsResponse> {
    const now = new Date()
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUsersRes,
      activeUsers24hRes,
      totalCommunitiesRes,
      activeCommunitiesRes,
      pendingReportsRes,
      reportsByReasonRes,
      upcomingEventsRes,
      messages24hRes,
      messages7dRes,
    ] = await Promise.all([
      this.db.select({ count: count() }).from(users),
      this.db.select({ count: count() }).from(users)
        .where(sql`${users.updatedAt} >= ${past24h}`),
      this.db.select({ count: count() }).from(communities)
        .where(isNull(communities.deletedAt)),
      this.db.select({ count: count() }).from(communities)
        .where(sql`${communities.deletedAt} IS NULL AND ${communities.memberCount} > 0`),
      this.db.select({ count: count() }).from(reports)
        .where(eq(reports.status, 'pending')),
      this.db.select({ reason: reports.reason, count: count() }).from(reports)
        .where(eq(reports.status, 'pending'))
        .groupBy(reports.reason),
      this.db.select({ count: count() }).from(events)
        .where(sql`${events.startsAt} > ${now} AND ${events.status} = 'scheduled'`),
      this.db.select({ count: count() }).from(messages)
        .where(sql`${messages.createdAt} >= ${past24h} AND ${messages.deletedAt} IS NULL`),
      this.db.select({ count: count() }).from(messages)
        .where(sql`${messages.createdAt} >= ${past7d} AND ${messages.deletedAt} IS NULL`),
    ])

    const reportsByReason: Record<string, number> = {}
    for (const row of reportsByReasonRes) {
      reportsByReason[row.reason] = Number(row.count)
    }

    return {
      totalUsers: Number(totalUsersRes[0]?.count ?? 0),
      activeUsers24h: Number(activeUsers24hRes[0]?.count ?? 0),
      totalCommunities: Number(totalCommunitiesRes[0]?.count ?? 0),
      activeCommunities: Number(activeCommunitiesRes[0]?.count ?? 0),
      pendingReports: Number(pendingReportsRes[0]?.count ?? 0),
      reportsByReason,
      upcomingEvents: Number(upcomingEventsRes[0]?.count ?? 0),
      messages24h: Number(messages24hRes[0]?.count ?? 0),
      messages7d: Number(messages7dRes[0]?.count ?? 0),
      staleAfterSeconds: 60,
    }
  }
}
