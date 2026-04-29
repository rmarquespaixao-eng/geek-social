import { and, eq, inArray, desc } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { eventInvites, users } from '../../shared/infra/database/schema.js'

export type InviteRow = {
  id: string
  eventId: string
  invitedUserId: string
  invitedBy: string
  createdAt: Date
}

export type InviteWithUser = InviteRow & {
  invitedUser: { id: string; displayName: string; avatarUrl: string | null }
}

export class InvitesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async insertMany(
    eventId: string,
    invitedBy: string,
    userIds: string[],
  ): Promise<{ inserted: InviteRow[]; alreadyInvited: string[] }> {
    if (userIds.length === 0) return { inserted: [], alreadyInvited: [] }

    // Existing invites
    const existing = await this.db
      .select({ invitedUserId: eventInvites.invitedUserId })
      .from(eventInvites)
      .where(and(eq(eventInvites.eventId, eventId), inArray(eventInvites.invitedUserId, userIds)))
    const existingSet = new Set(existing.map(e => e.invitedUserId))
    const toInsert = userIds.filter(id => !existingSet.has(id))

    if (toInsert.length === 0) {
      return { inserted: [], alreadyInvited: [...existingSet] }
    }

    const rows = await this.db
      .insert(eventInvites)
      .values(toInsert.map(id => ({ eventId, invitedUserId: id, invitedBy })))
      .returning()
    return { inserted: rows as InviteRow[], alreadyInvited: [...existingSet] }
  }

  async findByEvent(eventId: string): Promise<InviteWithUser[]> {
    const rows = await this.db
      .select({
        id: eventInvites.id,
        eventId: eventInvites.eventId,
        invitedUserId: eventInvites.invitedUserId,
        invitedBy: eventInvites.invitedBy,
        createdAt: eventInvites.createdAt,
        userName: users.displayName,
        userAvatar: users.avatarUrl,
      })
      .from(eventInvites)
      .innerJoin(users, eq(users.id, eventInvites.invitedUserId))
      .where(eq(eventInvites.eventId, eventId))
      .orderBy(desc(eventInvites.createdAt))

    return rows.map(r => ({
      id: r.id,
      eventId: r.eventId,
      invitedUserId: r.invitedUserId,
      invitedBy: r.invitedBy,
      createdAt: r.createdAt,
      invitedUser: { id: r.invitedUserId, displayName: r.userName, avatarUrl: r.userAvatar ?? null },
    }))
  }

  async existsForUser(eventId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: eventInvites.id })
      .from(eventInvites)
      .where(and(eq(eventInvites.eventId, eventId), eq(eventInvites.invitedUserId, userId)))
      .limit(1)
    return rows.length > 0
  }

  async findEventIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ eventId: eventInvites.eventId })
      .from(eventInvites)
      .where(eq(eventInvites.invitedUserId, userId))
    return rows.map(r => r.eventId)
  }

  async deleteByEventAndUser(eventId: string, invitedUserId: string): Promise<void> {
    await this.db
      .delete(eventInvites)
      .where(
        and(eq(eventInvites.eventId, eventId), eq(eventInvites.invitedUserId, invitedUserId)),
      )
  }
}
