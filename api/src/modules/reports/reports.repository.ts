import { eq, and } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { reports, posts, collections, messages, users, conversations, conversationMembers } from '../../shared/infra/database/schema.js'
import type { ReportTargetType, ReportReason } from './reports.schema.js'

export type Report = {
  id: string
  reporterId: string
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  description: string | null
  status: 'pending' | 'reviewed' | 'dismissed'
  createdAt: Date
  updatedAt: Date
}

export class ReportsRepository {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Retorna o user_id dono do alvo (para checar self-report).
   * Não usar para `conversation` — use `isConversationMember` (compartilhado, não tem dono único).
   */
  async getTargetOwnerId(targetType: Exclude<ReportTargetType, 'conversation'>, targetId: string): Promise<string | null> {
    if (targetType === 'user') {
      const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1)
      return row?.id ?? null
    }
    if (targetType === 'post') {
      const [row] = await this.db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, targetId)).limit(1)
      return row?.userId ?? null
    }
    if (targetType === 'collection') {
      const [row] = await this.db.select({ userId: collections.userId }).from(collections).where(eq(collections.id, targetId)).limit(1)
      return row?.userId ?? null
    }
    if (targetType === 'message') {
      const [row] = await this.db.select({ userId: messages.userId }).from(messages).where(eq(messages.id, targetId)).limit(1)
      return row?.userId ?? null
    }
    return null
  }

  /** Verifica se o usuário é membro da conversa (pré-requisito pra denunciar). */
  async isConversationMember(conversationId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ))
      .limit(1)
    return Boolean(row)
  }

  async findExisting(reporterId: string, targetType: ReportTargetType, targetId: string): Promise<Report | null> {
    const [row] = await this.db
      .select()
      .from(reports)
      .where(and(
        eq(reports.reporterId, reporterId),
        eq(reports.targetType, targetType),
        eq(reports.targetId, targetId),
      ))
      .limit(1)
    return row ? toReport(row) : null
  }

  async create(data: {
    reporterId: string
    targetType: ReportTargetType
    targetId: string
    reason: ReportReason
    description: string | null
  }): Promise<Report> {
    const [row] = await this.db.insert(reports).values(data).returning()
    return toReport(row)
  }
}

function toReport(row: typeof reports.$inferSelect): Report {
  return {
    id: row.id,
    reporterId: row.reporterId,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
