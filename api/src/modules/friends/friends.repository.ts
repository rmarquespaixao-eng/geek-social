import { eq, and, or, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { friendships, userBlocks, users, userPresence } from '../../shared/infra/database/schema.js'
import type {
  IFriendsRepository,
  Friendship,
  FriendshipStatus,
  FriendUser,
  FriendRequestWithUser,
  Block,
  BlockedUserInfo,
} from '../../shared/contracts/friends.repository.contract.js'

export class FriendsRepository implements IFriendsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createRequest(requesterId: string, receiverId: string): Promise<Friendship> {
    const result = await this.db.insert(friendships)
      .values({ requesterId, receiverId, status: 'pending' })
      .returning()
    return result[0] as Friendship
  }

  async findRequestById(id: string): Promise<Friendship | null> {
    const result = await this.db.select().from(friendships).where(eq(friendships.id, id)).limit(1)
    return (result[0] as Friendship) ?? null
  }

  async findExistingRelation(userId1: string, userId2: string): Promise<Friendship | null> {
    const result = await this.db.select().from(friendships)
      .where(or(
        and(eq(friendships.requesterId, userId1), eq(friendships.receiverId, userId2)),
        and(eq(friendships.requesterId, userId2), eq(friendships.receiverId, userId1)),
      ))
      .limit(1)
    return (result[0] as Friendship) ?? null
  }

  async findReceivedRequests(receiverId: string): Promise<Friendship[]> {
    return this.db.select().from(friendships)
      .where(and(eq(friendships.receiverId, receiverId), eq(friendships.status, 'pending'))) as Promise<Friendship[]>
  }

  async findSentRequests(requesterId: string): Promise<Friendship[]> {
    return this.db.select().from(friendships)
      .where(and(eq(friendships.requesterId, requesterId), eq(friendships.status, 'pending'))) as Promise<Friendship[]>
  }

  async updateRequestStatus(id: string, status: FriendshipStatus): Promise<Friendship> {
    const result = await this.db.update(friendships)
      .set({ status, updatedAt: new Date() })
      .where(eq(friendships.id, id))
      .returning()
    if (!result[0]) throw new Error(`Friendship not found: ${id}`)
    return result[0] as Friendship
  }

  async findFriendIds(userId: string): Promise<string[]> {
    const rows = await this.db.select().from(friendships)
      .where(and(
        or(eq(friendships.requesterId, userId), eq(friendships.receiverId, userId)),
        eq(friendships.status, 'accepted'),
      ))
    return rows.map(row => row.requesterId === userId ? row.receiverId : row.requesterId)
  }

  async findFriends(userId: string): Promise<FriendUser[]> {
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000
    const rows = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        lastSeenAt: userPresence.lastSeenAt,
      })
      .from(friendships)
      .innerJoin(
        users,
        or(
          and(eq(friendships.requesterId, userId), eq(users.id, friendships.receiverId)),
          and(eq(friendships.receiverId, userId), eq(users.id, friendships.requesterId)),
        )!,
      )
      .leftJoin(userPresence, eq(userPresence.userId, users.id))
      .where(eq(friendships.status, 'accepted'))
    const now = Date.now()
    return rows.map(r => ({
      id: r.id,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl ?? null,
      isOnline: r.lastSeenAt ? now - r.lastSeenAt.getTime() < ONLINE_THRESHOLD_MS : false,
      lastSeenAt: r.lastSeenAt ?? null,
    }))
  }

  async findReceivedRequestsWithUser(receiverId: string): Promise<FriendRequestWithUser[]> {
    const rows = await this.db
      .select({
        id: friendships.id,
        senderId: friendships.requesterId,
        receiverId: friendships.receiverId,
        status: friendships.status,
        createdAt: friendships.createdAt,
        senderName: sql<string>`(SELECT display_name FROM users WHERE id = ${friendships.requesterId})`,
        senderAvatarUrl: sql<string | null>`(SELECT avatar_url FROM users WHERE id = ${friendships.requesterId})`,
        receiverName: sql<string>`(SELECT display_name FROM users WHERE id = ${friendships.receiverId})`,
        receiverAvatarUrl: sql<string | null>`(SELECT avatar_url FROM users WHERE id = ${friendships.receiverId})`,
      })
      .from(friendships)
      .where(and(eq(friendships.receiverId, receiverId), eq(friendships.status, 'pending')))
    return rows.map(r => ({
      id: r.id,
      senderId: r.senderId,
      senderName: r.senderName,
      senderAvatarUrl: r.senderAvatarUrl,
      receiverId: r.receiverId,
      receiverName: r.receiverName,
      receiverAvatarUrl: r.receiverAvatarUrl,
      status: r.status as FriendshipStatus,
      createdAt: r.createdAt,
    }))
  }

  async findSentRequestsWithUser(requesterId: string): Promise<FriendRequestWithUser[]> {
    const rows = await this.db
      .select({
        id: friendships.id,
        senderId: friendships.requesterId,
        receiverId: friendships.receiverId,
        status: friendships.status,
        createdAt: friendships.createdAt,
        senderName: sql<string>`(SELECT display_name FROM users WHERE id = ${friendships.requesterId})`,
        senderAvatarUrl: sql<string | null>`(SELECT avatar_url FROM users WHERE id = ${friendships.requesterId})`,
        receiverName: sql<string>`(SELECT display_name FROM users WHERE id = ${friendships.receiverId})`,
        receiverAvatarUrl: sql<string | null>`(SELECT avatar_url FROM users WHERE id = ${friendships.receiverId})`,
      })
      .from(friendships)
      .where(and(eq(friendships.requesterId, requesterId), eq(friendships.status, 'pending')))
    return rows.map(r => ({
      id: r.id,
      senderId: r.senderId,
      senderName: r.senderName,
      senderAvatarUrl: r.senderAvatarUrl,
      receiverId: r.receiverId,
      receiverName: r.receiverName,
      receiverAvatarUrl: r.receiverAvatarUrl,
      status: r.status as FriendshipStatus,
      createdAt: r.createdAt,
    }))
  }

  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const result = await this.db.select().from(friendships)
      .where(and(
        or(
          and(eq(friendships.requesterId, userId), eq(friendships.receiverId, otherUserId)),
          and(eq(friendships.requesterId, otherUserId), eq(friendships.receiverId, userId)),
        ),
        eq(friendships.status, 'accepted'),
      ))
      .limit(1)
    return result.length > 0
  }

  async removeFriendshipBetween(userId1: string, userId2: string): Promise<void> {
    await this.db.delete(friendships)
      .where(or(
        and(eq(friendships.requesterId, userId1), eq(friendships.receiverId, userId2)),
        and(eq(friendships.requesterId, userId2), eq(friendships.receiverId, userId1)),
      ))
  }

  async createBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.db.insert(userBlocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing()
  }

  async deleteBlock(blockerId: string, blockedId: string): Promise<void> {
    await this.db.delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)))
  }

  async isBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await this.db.select().from(userBlocks)
      .where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)))
      .limit(1)
    return result.length > 0
  }

  async isBlockedEitherDirection(userId1: string, userId2: string): Promise<boolean> {
    const result = await this.db.select().from(userBlocks)
      .where(or(
        and(eq(userBlocks.blockerId, userId1), eq(userBlocks.blockedId, userId2)),
        and(eq(userBlocks.blockerId, userId2), eq(userBlocks.blockedId, userId1)),
      ))
      .limit(1)
    return result.length > 0
  }

  async findBlocksByBlocker(blockerId: string): Promise<Block[]> {
    return this.db.select().from(userBlocks)
      .where(eq(userBlocks.blockerId, blockerId)) as Promise<Block[]>
  }

  async findBlocksByBlockerWithUser(blockerId: string): Promise<BlockedUserInfo[]> {
    const rows = await this.db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, blockerId))
    return rows.map(r => ({ id: r.id, displayName: r.displayName, avatarUrl: r.avatarUrl ?? null }))
  }

  async findAllBlockRelationUserIds(userId: string): Promise<string[]> {
    const rows = await this.db.select().from(userBlocks)
      .where(or(
        eq(userBlocks.blockerId, userId),
        eq(userBlocks.blockedId, userId),
      ))
    return rows.map(row => row.blockerId === userId ? row.blockedId : row.blockerId)
  }
}
