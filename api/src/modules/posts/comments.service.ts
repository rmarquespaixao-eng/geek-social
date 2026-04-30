import type { ICommentsRepository, Comment, EnrichedComment, CommentCursor } from '../../shared/contracts/comments.repository.contract.js'
import type { IPostsRepository } from '../../shared/contracts/posts.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'

export class CommentsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'CommentsError'
  }
}

export class CommentsService {
  constructor(
    private readonly commentsRepo: ICommentsRepository,
    private readonly postsRepo: IPostsRepository,
    private readonly friendsRepo: IFriendsRepository,
  ) {}

  private async assertCanInteract(viewerId: string, postId: string): Promise<void> {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new CommentsError('NOT_FOUND')
    if (post.visibility === 'private' && post.userId !== viewerId) throw new CommentsError('NOT_FOUND')
    if (post.visibility === 'friends_only' && post.userId !== viewerId) {
      const areFriends = await this.friendsRepo.areFriends(viewerId, post.userId)
      if (!areFriends) throw new CommentsError('NOT_FOUND')
    }
    const blocked = await this.friendsRepo.isBlockedEitherDirection(viewerId, post.userId)
    if (blocked) throw new CommentsError('NOT_FOUND')
  }

  async addComment(userId: string, postId: string, content: string): Promise<EnrichedComment> {
    await this.assertCanInteract(userId, postId)
    return this.commentsRepo.create(postId, userId, content)
  }

  async listComments(userId: string, postId: string, cursorToken?: string, limit = 20) {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new CommentsError('NOT_FOUND')
    if (post.visibility === 'private' && post.userId !== userId) throw new CommentsError('NOT_FOUND')
    if (post.visibility === 'friends_only' && post.userId !== userId) {
      const areFriends = await this.friendsRepo.areFriends(userId, post.userId)
      if (!areFriends) throw new CommentsError('NOT_FOUND')
    }
    const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, post.userId)
    if (blocked) throw new CommentsError('NOT_FOUND')
    let cursor: CommentCursor | undefined
    try {
      cursor = cursorToken ? decodeCursor(cursorToken) : undefined
    } catch {
      throw new CommentsError('INVALID_CURSOR')
    }
    const result = await this.commentsRepo.findByPostId(postId, cursor, limit)
    const blockedUserIds = await this.friendsRepo.findAllBlockRelationUserIds(userId)
    const comments = result.comments.filter(c => !blockedUserIds.includes(c.authorId))
    return {
      comments,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
    }
  }

  async updateComment(userId: string, postId: string, commentId: string, content: string): Promise<EnrichedComment> {
    const comment = await this.commentsRepo.findById(commentId)
    if (!comment || comment.postId !== postId) throw new CommentsError('NOT_FOUND')
    if (comment.userId !== userId) throw new CommentsError('FORBIDDEN')
    await this.assertCanInteract(userId, postId)
    return this.commentsRepo.update(commentId, content)
  }

  async deleteComment(userId: string, postId: string, commentId: string): Promise<void> {
    const comment = await this.commentsRepo.findById(commentId)
    if (!comment || comment.postId !== postId) throw new CommentsError('NOT_FOUND')
    const post = await this.postsRepo.findById(postId)
    const isCommentAuthor = comment.userId === userId
    const isPostAuthor = post?.userId === userId
    if (!isCommentAuthor && !isPostAuthor) throw new CommentsError('FORBIDDEN')
    await this.commentsRepo.delete(commentId)
  }
}

function encodeCursor(cursor: CommentCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString('base64')
}

function decodeCursor(token: string): CommentCursor {
  const { createdAt, id } = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
  return { createdAt: new Date(createdAt), id }
}
