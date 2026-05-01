import { eq, and, inArray, sql } from 'drizzle-orm'
import { alias as aliasedTable } from 'drizzle-orm/pg-core'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { conversations, conversationMembers, messages, users, dmRequests, messageAttachments } from '../../shared/infra/database/schema.js'
import type {
  IConversationsRepository, Conversation, ConversationMember,
  MemberRole, MemberPermissions, ConversationWithMeta,
} from '../../shared/contracts/conversations.repository.contract.js'

export class ConversationsRepository implements IConversationsRepository {
  constructor(private readonly db: DatabaseClient) {}

  private async deriveLastMessageType(messageId: string): Promise<'text' | 'image' | 'audio' | 'video' | 'file' | 'call'> {
    const [msg] = await this.db
      .select({ callMetadata: messages.callMetadata })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1)
    if (msg?.callMetadata) return 'call'

    const atts = await this.db
      .select({ mimeType: messageAttachments.mimeType })
      .from(messageAttachments)
      .where(eq(messageAttachments.messageId, messageId))
      .limit(1)
    if (atts.length === 0) return 'text'
    const m = atts[0].mimeType
    if (m.startsWith('image/')) return 'image'
    if (m.startsWith('audio/')) return 'audio'
    if (m.startsWith('video/')) return 'video'
    return 'file'
  }

  async create(data: { type: 'dm' | 'group'; name?: string; description?: string; createdBy?: string }): Promise<Conversation> {
    const [row] = await this.db.insert(conversations).values({
      type: data.type,
      name: data.name ?? null,
      description: data.description ?? null,
      createdBy: data.createdBy ?? null,
    }).returning()
    return this.mapConv(row)
  }

  async findById(id: string): Promise<Conversation | null> {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.id, id)).limit(1)
    return row ? this.mapConv(row) : null
  }

  async update(id: string, data: { name?: string; description?: string; coverUrl?: string }): Promise<Conversation> {
    const [row] = await this.db.update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning()
    return this.mapConv(row)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(conversations).where(eq(conversations.id, id))
  }

  async addMember(conversationId: string, userId: string, role: MemberRole): Promise<ConversationMember> {
    const [row] = await this.db.insert(conversationMembers).values({ conversationId, userId, role }).returning()
    return this.mapMember(row)
  }

  async findMember(conversationId: string, userId: string): Promise<ConversationMember | null> {
    const [row] = await this.db.select().from(conversationMembers).where(
      and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId))
    ).limit(1)
    return row ? this.mapMember(row) : null
  }

  async updateMember(conversationId: string, userId: string, data: { role?: MemberRole; permissions?: MemberPermissions }): Promise<ConversationMember> {
    const [row] = await this.db.update(conversationMembers)
      .set(data)
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
      .returning()
    return this.mapMember(row)
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    await this.db.delete(conversationMembers).where(
      and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId))
    )
  }

  async findMembers(conversationId: string): Promise<ConversationMember[]> {
    const rows = await this.db.select().from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
    return rows.map(r => this.mapMember(r))
  }

  async findMembersByUserId(userId: string): Promise<ConversationMember[]> {
    const rows = await this.db.select().from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))
    return rows.map(r => this.mapMember(r))
  }

  async findDmPartnerIds(userId: string): Promise<string[]> {
    const partner = aliasedTable(conversationMembers, 'partner')
    const rows = await this.db
      .select({ partnerId: partner.userId })
      .from(conversationMembers)
      .innerJoin(conversations, and(
        eq(conversations.id, conversationMembers.conversationId),
        eq(conversations.type, 'dm'),
      )!)
      .innerJoin(partner, and(
        eq(partner.conversationId, conversationMembers.conversationId),
        sql`${partner.userId} <> ${userId}`,
      )!)
      .where(eq(conversationMembers.userId, userId))
    return rows.map(r => r.partnerId)
  }

  async findExistingDm(userAId: string, userBId: string): Promise<Conversation | null> {
    const memberA = await this.db.select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers).where(eq(conversationMembers.userId, userAId))
    const memberB = await this.db.select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers).where(eq(conversationMembers.userId, userBId))

    const idsA = new Set(memberA.map(m => m.conversationId))
    const sharedIds = memberB.map(m => m.conversationId).filter(id => idsA.has(id))
    if (sharedIds.length === 0) return null

    const [conv] = await this.db.select().from(conversations)
      .where(and(inArray(conversations.id, sharedIds), eq(conversations.type, 'dm')))
      .limit(1)
    return conv ? this.mapConv(conv) : null
  }

  async findUserConversations(userId: string, opts?: { archived?: boolean; includeHidden?: boolean }): Promise<ConversationWithMeta[]> {
    const wantArchived = opts?.archived ?? false
    const includeHidden = opts?.includeHidden ?? false

    const myMemberships = await this.db.select().from(conversationMembers)
      .where(and(
        eq(conversationMembers.userId, userId),
        eq(conversationMembers.isArchived, wantArchived),
      ))
    if (myMemberships.length === 0) return []

    const convIds = myMemberships.map(m => m.conversationId)
    const convRows = await this.db.select().from(conversations).where(inArray(conversations.id, convIds))

    // Batch-fetch all members and user info
    const allMembers = await this.db.select().from(conversationMembers)
      .where(inArray(conversationMembers.conversationId, convIds))
    const allUserIds = [...new Set(allMembers.map(m => m.userId))]
    const userRows = await this.db.select({
      id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl,
    }).from(users).where(inArray(users.id, allUserIds))
    const userMap = new Map(userRows.map(u => [u.id, u]))

    // Batch-fetch dm requests
    const dmReqs = await this.db.select().from(dmRequests)
      .where(inArray(dmRequests.conversationId, convIds))
    const dmReqMap = new Map(dmReqs.map(r => [r.conversationId!, r]))

    const results: ConversationWithMeta[] = []
    for (const conv of convRows) {
      const myMembership = myMemberships.find(m => m.conversationId === conv.id)!

      const participants = allMembers
        .filter(m => m.conversationId === conv.id)
        .map(m => {
          const u = userMap.get(m.userId)
          return {
            userId: m.userId,
            displayName: u?.displayName ?? 'Usuário',
            avatarUrl: u?.avatarUrl ?? null,
            isOnline: false,
            role: m.role,
          }
        })

      const [lastMsg] = await this.db.select({
        id: messages.id, content: messages.content, userId: messages.userId, createdAt: messages.createdAt,
      }).from(messages)
        .where(and(eq(messages.conversationId, conv.id), sql`${messages.deletedAt} IS NULL`))
        .orderBy(sql`${messages.createdAt} DESC`)
        .limit(1)

      const unreadCount = myMembership.lastReadAt
        ? await this.db.$count(messages, and(
            eq(messages.conversationId, conv.id),
            sql`${messages.createdAt} > ${myMembership.lastReadAt}`,
            sql`${messages.deletedAt} IS NULL`,
            sql`${messages.userId} != ${userId}`,
          ))
        : await this.db.$count(messages, and(
            eq(messages.conversationId, conv.id),
            sql`${messages.deletedAt} IS NULL`,
            sql`${messages.userId} != ${userId}`,
          ))

      const dmReq = dmReqMap.get(conv.id) ?? null

      // Filtra hidden: se o membro tem hiddenAt, só inclui se houver mensagem nova depois (auto-unhide)
      if (!includeHidden && myMembership.hiddenAt) {
        if (!lastMsg || lastMsg.createdAt <= myMembership.hiddenAt) {
          continue
        }
      }

      const lastMsgType = lastMsg ? await this.deriveLastMessageType(lastMsg.id) : 'text'

      results.push({
        ...this.mapConv(conv),
        participants,
        lastMessage: lastMsg ? { id: lastMsg.id, content: lastMsg.content, senderId: lastMsg.userId, createdAt: lastMsg.createdAt, type: lastMsgType } : null,
        unreadCount: Number(unreadCount),
        dmRequest: dmReq ? { id: dmReq.id, senderId: dmReq.senderId, receiverId: dmReq.receiverId, status: dmReq.status } : null,
        isBlockedByMe: false,
        isBlockedByOther: false,
        isArchived: myMembership.isArchived,
        isMuted: myMembership.isMuted,
        isTemporary: conv.isTemporary,
      })
    }
    return results
  }

  async findConversationWithMeta(conversationId: string, userId: string): Promise<ConversationWithMeta | null> {
    const [conv] = await this.db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)
    if (!conv) return null

    const myMembership = await this.findMember(conversationId, userId)
    if (!myMembership) return null

    const allMembers = await this.db.select().from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
    const allUserIds = allMembers.map(m => m.userId)
    const userRows = await this.db.select({
      id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl,
    }).from(users).where(inArray(users.id, allUserIds))
    const userMap = new Map(userRows.map(u => [u.id, u]))

    const participants = allMembers.map(m => {
      const u = userMap.get(m.userId)
      return {
        userId: m.userId,
        displayName: u?.displayName ?? 'Usuário',
        avatarUrl: u?.avatarUrl ?? null,
        isOnline: false,
        role: m.role,
      }
    })

    const [lastMsg] = await this.db.select({
      id: messages.id, content: messages.content, userId: messages.userId, createdAt: messages.createdAt,
    }).from(messages)
      .where(and(eq(messages.conversationId, conv.id), sql`${messages.deletedAt} IS NULL`))
      .orderBy(sql`${messages.createdAt} DESC`)
      .limit(1)

    const [dmReq] = await this.db.select().from(dmRequests)
      .where(eq(dmRequests.conversationId, conversationId)).limit(1)

    const unreadCount = myMembership.lastReadAt
      ? await this.db.$count(messages, and(
          eq(messages.conversationId, conv.id),
          sql`${messages.createdAt} > ${myMembership.lastReadAt}`,
          sql`${messages.deletedAt} IS NULL`,
          sql`${messages.userId} != ${userId}`,
        ))
      : await this.db.$count(messages, and(
          eq(messages.conversationId, conv.id),
          sql`${messages.deletedAt} IS NULL`,
          sql`${messages.userId} != ${userId}`,
        ))

    const lastMsgType = lastMsg ? await this.deriveLastMessageType(lastMsg.id) : 'text'

    return {
      ...this.mapConv(conv),
      participants,
      lastMessage: lastMsg ? { id: lastMsg.id, content: lastMsg.content, senderId: lastMsg.userId, createdAt: lastMsg.createdAt, type: lastMsgType } : null,
      unreadCount: Number(unreadCount),
      dmRequest: dmReq ? { id: dmReq.id, senderId: dmReq.senderId, receiverId: dmReq.receiverId, status: dmReq.status } : null,
      isBlockedByMe: false,
      isBlockedByOther: false,
      isArchived: myMembership.isArchived,
      isMuted: myMembership.isMuted,
      isTemporary: conv.isTemporary,
    }
  }

  async updateLastReadAt(conversationId: string, userId: string): Promise<void> {
    await this.db.update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
  }

  private mapConv(row: typeof conversations.$inferSelect): Conversation {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description,
      coverUrl: row.coverUrl,
      createdBy: row.createdBy,
      isTemporary: row.isTemporary,
      senderKeyId: row.senderKeyId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async rotateSenderKey(conversationId: string): Promise<string> {
    const [row] = await this.db
      .update(conversations)
      .set({ senderKeyId: sql`gen_random_uuid()` })
      .where(eq(conversations.id, conversationId))
      .returning({ senderKeyId: conversations.senderKeyId })
    return row.senderKeyId
  }

  private mapMember(row: typeof conversationMembers.$inferSelect): ConversationMember {
    return {
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      role: row.role,
      permissions: row.permissions as { can_send_messages: boolean; can_send_files: boolean },
      joinedAt: row.joinedAt,
      lastReadAt: row.lastReadAt,
      isArchived: row.isArchived,
      hiddenAt: row.hiddenAt,
      isMuted: row.isMuted,
    }
  }

  async setArchived(conversationId: string, userId: string, archived: boolean): Promise<void> {
    await this.db.update(conversationMembers)
      .set({ isArchived: archived })
      .where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ))
  }

  async setHiddenAt(conversationId: string, userId: string, hiddenAt: Date | null): Promise<void> {
    await this.db.update(conversationMembers)
      .set({ hiddenAt })
      .where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ))
  }

  async setMuted(conversationId: string, userId: string, muted: boolean): Promise<void> {
    await this.db.update(conversationMembers)
      .set({ isMuted: muted })
      .where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ))
  }

  async setTemporary(conversationId: string, value: boolean): Promise<void> {
    await this.db.update(conversations)
      .set({ isTemporary: value, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
  }

  async findTemporaryDms(): Promise<Conversation[]> {
    const rows = await this.db.select().from(conversations)
      .where(and(eq(conversations.type, 'dm'), eq(conversations.isTemporary, true)))
    return rows.map(r => this.mapConv(r))
  }

  async findMembersWithReceiptsFlag(conversationId: string): Promise<Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>> {
    const rows = await this.db
      .select({
        userId: conversationMembers.userId,
        lastReadAt: conversationMembers.lastReadAt,
        showReadReceipts: users.showReadReceipts,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(eq(conversationMembers.conversationId, conversationId))
    return rows
  }
}
