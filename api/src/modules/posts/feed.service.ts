import type { IFeedRepository, FeedCursor } from '../../shared/contracts/feed.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { UsersRepository } from '../users/users.repository.js'

export class FeedService {
  constructor(
    private readonly feedRepo: IFeedRepository,
    private readonly friendsRepo: IFriendsRepository,
    private readonly usersRepo: UsersRepository,
  ) {}

  async getFeed(viewerId: string, cursorToken: string | undefined, limit: number) {
    const [friendIds, blockedIds] = await Promise.all([
      this.friendsRepo.findFriendIds(viewerId),
      this.friendsRepo.findAllBlockRelationUserIds(viewerId),
    ])
    const cursor = cursorToken ? safeDecodeCursor(cursorToken) : undefined
    const { posts, nextCursor } = await this.feedRepo.getFeed({ viewerId, friendIds, blockedIds, cursor, limit })
    return { posts, nextCursor: nextCursor ? encodeCursor(nextCursor) : null }
  }

  async getProfilePosts(ownerId: string, viewerId: string | null, cursorToken: string | undefined, limit: number) {
    const isOwner = viewerId === ownerId
    const viewerIsFriend = viewerId && !isOwner ? await this.friendsRepo.areFriends(viewerId, ownerId) : false

    if (!isOwner) {
      const owner = await this.usersRepo.findById(ownerId)
      if (!owner) return { posts: [], nextCursor: null }
      if (owner.privacy === 'private') return { posts: [], nextCursor: null }
      if (owner.privacy === 'friends_only' && !viewerIsFriend) return { posts: [], nextCursor: null }
    }

    const cursor = cursorToken ? safeDecodeCursor(cursorToken) : undefined
    const { posts, nextCursor } = await this.feedRepo.getProfilePosts({ ownerId, viewerId, viewerIsFriend, cursor, limit })
    return { posts, nextCursor: nextCursor ? encodeCursor(nextCursor) : null }
  }
}

function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString('base64')
}

function safeDecodeCursor(token: string): FeedCursor | undefined {
  try {
    const { createdAt, id } = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
    return { createdAt: new Date(createdAt), id }
  } catch (err) {
    console.error({ err }, 'feed: invalid cursor token')
    return undefined
  }
}
