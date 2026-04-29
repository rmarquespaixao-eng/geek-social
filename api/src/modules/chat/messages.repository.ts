import { eq, and, lt, gt, lte, isNull, or, inArray, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { messages, messageAttachments, messageReactions } from '../../shared/infra/database/schema.js'
import type {
  IMessagesRepository, Message, MessageAttachment,
  MessageWithAttachments, MessageCursor, CallMetadata, TemporaryEvent,
} from '../../shared/contracts/messages.repository.contract.js'

export class MessagesRepository implements IMessagesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createMessage(data: {
    conversationId: string; userId: string; content?: string; replyToId?: string
    callMetadata?: CallMetadata
    isTemporary?: boolean
    temporaryEvent?: TemporaryEvent
  }): Promise<Message> {
    const [row] = await this.db.insert(messages).values({
      conversationId: data.conversationId,
      userId: data.userId,
      content: data.content ?? null,
      replyToId: data.replyToId ?? null,
      callMetadata: data.callMetadata ?? null,
      isTemporary: data.isTemporary ?? false,
      temporaryEvent: data.temporaryEvent ?? null,
    }).returning()
    return this.mapMessage(row)
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    await this.db.insert(messageReactions).values({ messageId, userId, emoji }).onConflictDoNothing()
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    await this.db.delete(messageReactions).where(and(
      eq(messageReactions.messageId, messageId),
      eq(messageReactions.userId, userId),
      eq(messageReactions.emoji, emoji),
    ))
  }

  async findReactionsByMessageIds(messageIds: string[]): Promise<Map<string, { emoji: string; userId: string }[]>> {
    const result = new Map<string, { emoji: string; userId: string }[]>()
    if (messageIds.length === 0) return result
    const rows = await this.db.select().from(messageReactions)
      .where(inArray(messageReactions.messageId, messageIds))
    for (const r of rows) {
      const list = result.get(r.messageId) ?? []
      list.push({ emoji: r.emoji, userId: r.userId })
      result.set(r.messageId, list)
    }
    return result
  }

  async findMessageById(id: string): Promise<MessageWithAttachments | null> {
    const [row] = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1)
    if (!row) return null
    const attachments = await this.db.select().from(messageAttachments)
      .where(eq(messageAttachments.messageId, id))
      .orderBy(messageAttachments.displayOrder)
    return { ...this.mapMessage(row), attachments: attachments.map(a => this.mapAttachment(a)) }
  }

  async softDeleteMessage(id: string): Promise<Message> {
    const [row] = await this.db.update(messages)
      .set({ deletedAt: new Date(), content: '[mensagem deletada]', updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning()
    return this.mapMessage(row)
  }

  async hardDeleteMessage(id: string): Promise<Message | null> {
    const [row] = await this.db.delete(messages)
      .where(eq(messages.id, id))
      .returning()
    return row ? this.mapMessage(row) : null
  }

  async findReadTemporaryReceivedBy(
    conversationId: string,
    userId: string,
    before: Date,
  ): Promise<MessageWithAttachments[]> {
    const rows = await this.db.select().from(messages).where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.isTemporary, true),
      isNull(messages.deletedAt),
      sql`${messages.userId} != ${userId}`,
      lte(messages.createdAt, before),
    ))
    return this.attachAttachments(rows)
  }

  /**
   * Mensagens temporárias da conversa que devem ser ocultadas para `userId`:
   * - todas as que ele mesmo enviou (ele "vê" automaticamente)
   * - as recebidas com createdAt <= lastReadAt (ele leu)
   * Filtra as que já estão ocultas pra ele.
   */
  async findTemporaryToHideFor(
    conversationId: string,
    userId: string,
    lastReadAt: Date,
  ): Promise<MessageWithAttachments[]> {
    const rows = await this.db.select().from(messages).where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.isTemporary, true),
      isNull(messages.deletedAt),
      sql`NOT (${messages.hiddenForUserIds} @> ${JSON.stringify([userId])}::jsonb)`,
      sql`(${messages.userId} = ${userId} OR ${messages.createdAt} <= ${lastReadAt})`,
    ))
    return this.attachAttachments(rows)
  }

  async addHiddenForUser(messageId: string, userId: string): Promise<MessageWithAttachments | null> {
    // Append idempotente: só adiciona se ainda não está na lista
    const [updated] = await this.db.update(messages)
      .set({
        hiddenForUserIds: sql`CASE WHEN ${messages.hiddenForUserIds} @> ${JSON.stringify([userId])}::jsonb
          THEN ${messages.hiddenForUserIds}
          ELSE ${messages.hiddenForUserIds} || ${JSON.stringify([userId])}::jsonb END`,
      })
      .where(eq(messages.id, messageId))
      .returning()
    if (!updated) return null
    return (await this.attachAttachments([updated]))[0]
  }

  async findExpiredTemporary(cutoff: Date, limit: number): Promise<MessageWithAttachments[]> {
    const rows = await this.db.select().from(messages).where(and(
      eq(messages.isTemporary, true),
      isNull(messages.deletedAt),
      lt(messages.createdAt, cutoff),
    )).limit(limit)
    return this.attachAttachments(rows)
  }

  private async attachAttachments(rows: Array<typeof messages.$inferSelect>): Promise<MessageWithAttachments[]> {
    if (rows.length === 0) return []
    const ids = rows.map(r => r.id)
    const attachments = await this.db.select().from(messageAttachments)
      .where(inArray(messageAttachments.messageId, ids))
      .orderBy(messageAttachments.displayOrder)
    const byMessage = new Map<string, MessageAttachment[]>()
    for (const a of attachments) {
      if (!a.messageId) continue
      const list = byMessage.get(a.messageId) ?? []
      list.push(this.mapAttachment(a))
      byMessage.set(a.messageId, list)
    }
    return rows.map(r => ({
      ...this.mapMessage(r),
      attachments: byMessage.get(r.id) ?? [],
    }))
  }

  async createAttachment(data: {
    uploadedBy: string; url: string; filename: string
    mimeType: string; sizeBytes: number; displayOrder: number
    durationMs?: number | null; waveformPeaks?: number[] | null
    thumbnailUrl?: string | null
  }): Promise<MessageAttachment> {
    const [row] = await this.db.insert(messageAttachments).values({
      messageId: null,
      uploadedBy: data.uploadedBy,
      url: data.url,
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      displayOrder: data.displayOrder,
      durationMs: data.durationMs ?? null,
      waveformPeaks: data.waveformPeaks ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
    }).returning()
    return this.mapAttachment(row)
  }

  async linkAttachments(messageId: string, attachmentIds: string[]): Promise<void> {
    await this.db.update(messageAttachments)
      .set({ messageId })
      .where(inArray(messageAttachments.id, attachmentIds))
  }

  async cloneAttachmentsToMessage(sourceMessageId: string, targetMessageId: string, uploadedBy: string): Promise<void> {
    const sourceRows = await this.db.select().from(messageAttachments)
      .where(eq(messageAttachments.messageId, sourceMessageId))
      .orderBy(messageAttachments.displayOrder)
    if (sourceRows.length === 0) return
    await this.db.insert(messageAttachments).values(
      sourceRows.map(r => ({
        messageId: targetMessageId,
        uploadedBy,
        url: r.url,
        filename: r.filename,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        displayOrder: r.displayOrder,
        durationMs: r.durationMs,
        waveformPeaks: r.waveformPeaks,
        thumbnailUrl: r.thumbnailUrl,
      }))
    )
  }

  async findAttachmentsByUploader(uploadedBy: string, ids: string[]): Promise<MessageAttachment[]> {
    const rows = await this.db.select().from(messageAttachments).where(
      and(eq(messageAttachments.uploadedBy, uploadedBy), inArray(messageAttachments.id, ids))
    )
    return rows.map(r => this.mapAttachment(r))
  }

  async findMessagesByConversation(params: {
    conversationId: string
    cursor?: MessageCursor
    limit: number
    afterDate?: Date
    excludeHiddenForUserId?: string
  }): Promise<{ messages: MessageWithAttachments[]; nextCursor: MessageCursor | null }> {
    const filters: any[] = [eq(messages.conversationId, params.conversationId)]
    if (params.afterDate) filters.push(gt(messages.createdAt, params.afterDate))
    if (params.excludeHiddenForUserId) {
      filters.push(sql`NOT (${messages.hiddenForUserIds} @> ${JSON.stringify([params.excludeHiddenForUserId])}::jsonb)`)
    }
    const baseCondition = filters.length === 1 ? filters[0] : and(...filters)

    const whereCondition = params.cursor
      ? and(
          baseCondition,
          or(
            lt(messages.createdAt, params.cursor.createdAt),
            and(
              eq(messages.createdAt, params.cursor.createdAt),
              lt(messages.id, params.cursor.id),
            ),
          ),
        )
      : baseCondition

    const rows = await this.db.select().from(messages)
      .where(whereCondition)
      .orderBy(sql`${messages.createdAt} DESC, ${messages.id} DESC`)
      .limit(params.limit)

    const messageIds = rows.map(r => r.id)
    const allAttachments = messageIds.length > 0
      ? await this.db.select().from(messageAttachments)
          .where(inArray(messageAttachments.messageId, messageIds))
          .orderBy(messageAttachments.displayOrder)
      : []

    const attachmentsByMessage = new Map<string, typeof allAttachments>()
    for (const att of allAttachments) {
      if (att.messageId) {
        const list = attachmentsByMessage.get(att.messageId) ?? []
        list.push(att)
        attachmentsByMessage.set(att.messageId, list)
      }
    }

    const result: MessageWithAttachments[] = rows.map(row => ({
      ...this.mapMessage(row),
      attachments: (attachmentsByMessage.get(row.id) ?? []).map(a => this.mapAttachment(a)),
    }))

    let nextCursor: MessageCursor | null = null
    if (rows.length === params.limit && rows.length > 0) {
      const last = rows[rows.length - 1]
      nextCursor = { createdAt: last.createdAt, id: last.id }
    }

    return { messages: result, nextCursor }
  }

  private mapMessage(row: any): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      content: row.content,
      replyToId: row.replyToId ?? null,
      callMetadata: (row.callMetadata as CallMetadata | null) ?? null,
      isTemporary: row.isTemporary ?? false,
      temporaryEvent: (row.temporaryEvent as TemporaryEvent | null) ?? null,
      hiddenForUserIds: (row.hiddenForUserIds as string[] | null) ?? [],
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private mapAttachment(row: typeof messageAttachments.$inferSelect): MessageAttachment {
    return {
      id: row.id,
      messageId: row.messageId,
      uploadedBy: row.uploadedBy,
      url: row.url,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      displayOrder: row.displayOrder,
      durationMs: row.durationMs ?? null,
      waveformPeaks: (row.waveformPeaks as number[] | null) ?? null,
      thumbnailUrl: row.thumbnailUrl ?? null,
    }
  }
}
