import { eq, and, or, sql, ilike } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { users, collections, items, posts, friendships } from '../../shared/infra/database/schema.js'
import type { User, UpdateProfileData } from '../../shared/contracts/user.repository.contract.js'

export type ProfileCounts = {
  collectionsCount: number
  itemsCount: number
  postsCount: number
  friendsCount: number
}

export class UsersRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return result[0] ?? null
  }

  async getProfileCounts(userId: string): Promise<ProfileCounts> {
    const [colRes, itemRes, postRes, friendRes] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)::int` }).from(collections).where(eq(collections.userId, userId)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(items).innerJoin(collections, eq(items.collectionId, collections.id)).where(eq(collections.userId, userId)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(posts).where(eq(posts.userId, userId)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(friendships).where(and(or(eq(friendships.requesterId, userId), eq(friendships.receiverId, userId)), eq(friendships.status, 'accepted'))),
    ])
    return {
      collectionsCount: colRes[0]?.count ?? 0,
      itemsCount: itemRes[0]?.count ?? 0,
      postsCount: postRes[0]?.count ?? 0,
      friendsCount: friendRes[0]?.count ?? 0,
    }
  }

  async searchUsers(query: string): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]> {
    return this.db
      .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(ilike(users.displayName, `%${query}%`))
      .limit(20)
  }

  async getPublicFriends(userId: string): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]> {
    return this.db
      .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(friendships)
      .innerJoin(
        users,
        or(
          and(eq(friendships.requesterId, userId), eq(users.id, friendships.receiverId)),
          and(eq(friendships.receiverId, userId), eq(users.id, friendships.requesterId)),
        )!,
      )
      .where(eq(friendships.status, 'accepted'))
  }

  async updateProfile(id: string, data: UpdateProfileData): Promise<User> {
    const result = await this.db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return result[0]
  }

  async updateSettings(userId: string, patch: { showPresence?: boolean; showReadReceipts?: boolean }): Promise<User> {
    const result = await this.db.update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    return result[0]
  }

  async findBySteamId(steamId: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.steamId, steamId)).limit(1)
    return result[0] ?? null
  }

  async linkSteam(userId: string, steamId: string): Promise<User> {
    const result = await this.db.update(users)
      .set({ steamId, steamLinkedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    return result[0]
  }

  async unlinkSteam(userId: string): Promise<User> {
    const result = await this.db.update(users)
      .set({ steamId: null, steamLinkedAt: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    return result[0]
  }

  async setSteamApiKey(userId: string, apiKey: string): Promise<User> {
    const result = await this.db.update(users)
      .set({ steamApiKey: apiKey, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    return result[0]
  }

  async clearSteamApiKey(userId: string): Promise<User> {
    const result = await this.db.update(users)
      .set({ steamApiKey: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    return result[0]
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId))
  }
}
