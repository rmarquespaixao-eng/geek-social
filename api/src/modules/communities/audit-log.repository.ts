import { and, desc, eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { communityAuditLog } from '../../shared/infra/database/schema.js'

type CommunityAuditAction =
  | 'community_create' | 'community_update' | 'community_delete'
  | 'member_promote' | 'member_demote' | 'member_ban' | 'member_unban'
  | 'member_join_approved' | 'member_join_rejected'
  | 'topic_pin' | 'topic_unpin' | 'topic_lock' | 'topic_unlock' | 'topic_move' | 'topic_delete'
  | 'comment_delete'
  | 'transfer_initiated' | 'transfer_accepted' | 'transfer_rejected' | 'transfer_cancelled'

export type AuditLogEntry = {
  id: string
  communityId: string
  actorId: string | null
  action: CommunityAuditAction
  targetUserId: string | null
  targetTopicId: string | null
  metadata: Record<string, unknown>
  createdAt: Date
}

export class AuditLogRepository {
  constructor(private readonly db: DatabaseClient) {}

  async record(
    action: CommunityAuditAction,
    communityId: string,
    actorId: string,
    opts?: {
      targetUserId?: string
      targetTopicId?: string
      metadata?: Record<string, unknown>
    },
    tx?: DatabaseClient,
  ): Promise<AuditLogEntry> {
    const exec = tx ?? this.db
    const [row] = await exec
      .insert(communityAuditLog)
      .values({
        communityId,
        actorId,
        action,
        targetUserId: opts?.targetUserId ?? null,
        targetTopicId: opts?.targetTopicId ?? null,
        metadata: opts?.metadata ?? {},
      })
      .returning()
    return row as AuditLogEntry
  }

  async list(
    communityId: string,
    query: { actorId?: string; action?: string; limit?: number },
  ): Promise<AuditLogEntry[]> {
    const conditions = [eq(communityAuditLog.communityId, communityId)]
    if (query.actorId) conditions.push(eq(communityAuditLog.actorId, query.actorId))
    if (query.action) {
      conditions.push(eq(communityAuditLog.action, query.action as CommunityAuditAction))
    }

    const rows = await this.db
      .select()
      .from(communityAuditLog)
      .where(and(...conditions))
      .orderBy(desc(communityAuditLog.createdAt))
      .limit(query.limit ?? 50)

    return rows as AuditLogEntry[]
  }
}
