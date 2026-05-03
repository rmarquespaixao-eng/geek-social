import { eq, and, gte, lte, desc, count } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { adminAuditLog } from '../../shared/infra/database/schema.js'
import type { PlatformRole } from '../../shared/middleware/require-role.js'

export type AdminAuditAction = typeof adminAuditLog.$inferSelect['action']

export type RecordOptions = {
  targetType?: string
  targetId?: string
  ip?: string
  metadata?: Record<string, unknown>
}

export type ListLogsFilters = {
  actorId?: string
  action?: AdminAuditAction
  targetType?: string
  targetId?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

export class AdminAuditLogRepository {
  constructor(private readonly db: DatabaseClient) {}

  async record(
    action: AdminAuditAction,
    actorId: string | null,
    roleAtTime: PlatformRole,
    opts: RecordOptions = {},
    tx?: DatabaseClient,
  ): Promise<void> {
    const exec = tx ?? this.db
    await exec.insert(adminAuditLog).values({
      actorId: actorId ?? null,
      actorRoleAtTime: roleAtTime,
      action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      ip: opts.ip ?? null,
      metadata: opts.metadata ?? {},
    })
  }

  async list(filters: ListLogsFilters = {}): Promise<{ rows: typeof adminAuditLog.$inferSelect[]; total: number }> {
    const { page = 1, pageSize = 50 } = filters
    const conditions = []

    if (filters.actorId) conditions.push(eq(adminAuditLog.actorId, filters.actorId))
    if (filters.action) conditions.push(eq(adminAuditLog.action, filters.action))
    if (filters.targetType) conditions.push(eq(adminAuditLog.targetType, filters.targetType))
    if (filters.targetId) conditions.push(eq(adminAuditLog.targetId, filters.targetId))
    if (filters.from) conditions.push(gte(adminAuditLog.createdAt, filters.from))
    if (filters.to) conditions.push(lte(adminAuditLog.createdAt, filters.to))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(adminAuditLog).where(where),
      this.db
        .select()
        .from(adminAuditLog)
        .where(where)
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ])

    return { rows, total: Number(totalRes[0]?.count ?? 0) }
  }
}
