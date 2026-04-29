import { eq, and, or } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { dmRequests, users } from '../../shared/infra/database/schema.js'
import type { IDmRequestsRepository, DmRequest } from '../../shared/contracts/dm-requests.repository.contract.js'

export class DmRequestsRepository implements IDmRequestsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(senderId: string, receiverId: string): Promise<DmRequest> {
    const [row] = await this.db.insert(dmRequests).values({ senderId, receiverId }).returning()
    return this.map(row)
  }

  async findById(id: string): Promise<DmRequest | null> {
    const [row] = await this.db.select().from(dmRequests).where(eq(dmRequests.id, id)).limit(1)
    return row ? this.map(row) : null
  }

  async findExisting(senderId: string, receiverId: string): Promise<DmRequest | null> {
    const [row] = await this.db.select().from(dmRequests).where(
      and(
        or(
          and(eq(dmRequests.senderId, senderId), eq(dmRequests.receiverId, receiverId)),
          and(eq(dmRequests.senderId, receiverId), eq(dmRequests.receiverId, senderId)),
        ),
        or(eq(dmRequests.status, 'pending'), eq(dmRequests.status, 'accepted'))
      )
    ).limit(1)
    return row ? this.map(row) : null
  }

  async findReceivedPending(receiverId: string): Promise<DmRequest[]> {
    const rows = await this.db
      .select({
        id: dmRequests.id,
        senderId: dmRequests.senderId,
        receiverId: dmRequests.receiverId,
        status: dmRequests.status,
        conversationId: dmRequests.conversationId,
        createdAt: dmRequests.createdAt,
        updatedAt: dmRequests.updatedAt,
        senderName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
      })
      .from(dmRequests)
      .innerJoin(users, eq(users.id, dmRequests.senderId))
      .where(and(eq(dmRequests.receiverId, receiverId), eq(dmRequests.status, 'pending')))
    return rows.map(r => ({
      id: r.id,
      senderId: r.senderId,
      receiverId: r.receiverId,
      status: r.status,
      conversationId: r.conversationId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      senderName: r.senderName,
      senderAvatarUrl: r.senderAvatarUrl,
    }))
  }

  async updateStatus(id: string, status: 'accepted' | 'rejected', conversationId?: string): Promise<DmRequest> {
    const updateData: { status: typeof status; updatedAt: Date; conversationId?: string } = {
      status,
      updatedAt: new Date(),
    }
    if (conversationId !== undefined) {
      updateData.conversationId = conversationId
    }
    const [row] = await this.db.update(dmRequests)
      .set(updateData)
      .where(eq(dmRequests.id, id))
      .returning()
    return this.map(row)
  }

  private map(row: typeof dmRequests.$inferSelect): DmRequest {
    return {
      id: row.id,
      senderId: row.senderId,
      receiverId: row.receiverId,
      status: row.status,
      conversationId: row.conversationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
