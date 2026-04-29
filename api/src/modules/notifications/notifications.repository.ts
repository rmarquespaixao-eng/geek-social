import { eq, desc, and } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { notifications, users } from '../../shared/infra/database/schema.js'

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'post_comment'
  | 'post_reaction'
  | 'steam_import_done'
  | 'steam_import_partial'
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'offer_completed'
  | 'offer_cancelled'
  | 'offer_expired'
  | 'dm_request_received'
  | 'rating_received'
  | 'counter_proposal_received'
  | 'proposal_rejected'
  | 'event_reminder_48h'
  | 'event_reminder_2h'
  | 'event_cancelled'
  | 'event_updated'
  | 'event_conflict_after_edit'
  | 'event_promoted_from_waitlist'
  | 'event_invited'

export type Notification = {
  id: string
  recipientId: string
  actorId: string
  actorName: string
  actorAvatar: string | null
  type: NotificationType
  entityId: string | null
  read: boolean
  createdAt: string
}

export class NotificationsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: {
    recipientId: string
    actorId: string
    type: NotificationType
    entityId?: string
  }): Promise<Notification> {
    const actor = this.db.select({ displayName: users.displayName, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, data.actorId))
    const [row] = await this.db.insert(notifications).values({
      recipientId: data.recipientId,
      actorId: data.actorId,
      type: data.type,
      entityId: data.entityId ?? null,
    }).returning()
    const [actorRow] = await actor
    return {
      id: row.id,
      recipientId: row.recipientId,
      actorId: row.actorId,
      actorName: actorRow?.displayName ?? 'Usuário',
      actorAvatar: actorRow?.avatarUrl ?? null,
      type: row.type as NotificationType,
      entityId: row.entityId ?? null,
      read: row.read,
      createdAt: row.createdAt.toISOString(),
    }
  }

  async findByRecipient(recipientId: string, limit = 30): Promise<Notification[]> {
    const rows = await this.db
      .select({
        id: notifications.id,
        recipientId: notifications.recipientId,
        actorId: notifications.actorId,
        actorName: users.displayName,
        actorAvatar: users.avatarUrl,
        type: notifications.type,
        entityId: notifications.entityId,
        read: notifications.read,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .innerJoin(users, eq(notifications.actorId, users.id))
      .where(eq(notifications.recipientId, recipientId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)

    return rows.map(r => ({
      ...r,
      type: r.type as NotificationType,
      entityId: r.entityId ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  async countUnread(recipientId: string): Promise<number> {
    const rows = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.read, false)))
    return rows.length
  }

  async markAllRead(recipientId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.recipientId, recipientId), eq(notifications.read, false)))
  }

  async markRead(recipientId: string, notificationId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.recipientId, recipientId)))
  }

  async deleteAll(recipientId: string): Promise<void> {
    await this.db
      .delete(notifications)
      .where(eq(notifications.recipientId, recipientId))
  }

  async deleteOne(recipientId: string, notificationId: string): Promise<void> {
    await this.db
      .delete(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.recipientId, recipientId)))
  }
}
