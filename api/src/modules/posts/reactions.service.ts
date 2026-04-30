import type { IReactionsRepository, ReactionType, ReactionCounts } from '../../shared/contracts/reactions.repository.contract.js'
import type { IPostsRepository } from '../../shared/contracts/posts.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'

export class ReactionsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ReactionsError'
  }
}

export class ReactionsService {
  constructor(
    private readonly reactionsRepo: IReactionsRepository,
    private readonly postsRepo: IPostsRepository,
    private readonly friendsRepo: IFriendsRepository,
  ) {}

  async react(userId: string, postId: string, type: ReactionType): Promise<ReactionCounts> {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new ReactionsError('NOT_FOUND')
    if (post.userId === userId) throw new ReactionsError('SELF_REACTION')
    if (post.visibility === 'private') throw new ReactionsError('NOT_FOUND')
    if (post.visibility === 'friends_only' && post.userId !== userId) {
      const areFriends = await this.friendsRepo.areFriends(userId, post.userId)
      if (!areFriends) throw new ReactionsError('NOT_FOUND')
    }
    const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, post.userId)
    if (blocked) throw new ReactionsError('NOT_FOUND')
    await this.reactionsRepo.upsert(postId, userId, type)
    return this.reactionsRepo.countsByPostId(postId)
  }

  async removeReaction(userId: string, postId: string): Promise<void> {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new ReactionsError('NOT_FOUND')
    await this.reactionsRepo.delete(postId, userId)
  }

  async getReactions(postId: string, viewerId: string | null): Promise<{ counts: ReactionCounts; myReaction: ReactionType | null }> {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new ReactionsError('NOT_FOUND')
    if (post.visibility === 'private' && post.userId !== viewerId) throw new ReactionsError('NOT_FOUND')
    if (post.visibility === 'friends_only' && post.userId !== viewerId) {
      if (!viewerId) throw new ReactionsError('NOT_FOUND')
      const areFriends = await this.friendsRepo.areFriends(viewerId, post.userId)
      if (!areFriends) throw new ReactionsError('NOT_FOUND')
    }
    let counts: ReactionCounts
    if (viewerId) {
      const blockedUserIds = await this.friendsRepo.findAllBlockRelationUserIds(viewerId)
      counts = await this.reactionsRepo.countsByPostIdExcludingUsers(postId, blockedUserIds)
    } else {
      counts = await this.reactionsRepo.countsByPostId(postId)
    }
    const myReaction = viewerId
      ? (await this.reactionsRepo.findByPostAndUser(postId, viewerId))?.type ?? null
      : null
    return { counts, myReaction }
  }
}
