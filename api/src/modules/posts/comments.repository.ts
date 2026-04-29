import { eq, and, or, lt, desc } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { postComments, users } from '../../shared/infra/database/schema.js'
import type { ICommentsRepository, Comment, EnrichedComment, CommentCursor } from '../../shared/contracts/comments.repository.contract.js'

const enrichedSelect = {
  id: postComments.id,
  postId: postComments.postId,
  authorId: postComments.userId,
  authorName: users.displayName,
  authorAvatarUrl: users.avatarUrl,
  content: postComments.content,
  createdAt: postComments.createdAt,
  updatedAt: postComments.updatedAt,
}

export class CommentsRepository implements ICommentsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(postId: string, userId: string, content: string): Promise<EnrichedComment> {
    const result = await this.db.insert(postComments)
      .values({ postId, userId, content })
      .returning()
    const row = await this.db.select(enrichedSelect)
      .from(postComments)
      .innerJoin(users, eq(users.id, postComments.userId))
      .where(eq(postComments.id, result[0].id))
      .limit(1)
    return row[0] as EnrichedComment
  }

  async findById(id: string): Promise<Comment | null> {
    const result = await this.db.select().from(postComments).where(eq(postComments.id, id)).limit(1)
    return (result[0] as Comment) ?? null
  }

  async update(id: string, content: string): Promise<EnrichedComment> {
    await this.db.update(postComments)
      .set({ content, updatedAt: new Date() })
      .where(eq(postComments.id, id))
    const row = await this.db.select(enrichedSelect)
      .from(postComments)
      .innerJoin(users, eq(users.id, postComments.userId))
      .where(eq(postComments.id, id))
      .limit(1)
    return row[0] as EnrichedComment
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(postComments).where(eq(postComments.id, id))
  }

  async findByPostId(postId: string, cursor?: CommentCursor, limit = 20): Promise<{ comments: EnrichedComment[]; nextCursor: CommentCursor | null }> {
    const cursorCondition = cursor
      ? or(
          lt(postComments.createdAt, cursor.createdAt),
          and(eq(postComments.createdAt, cursor.createdAt), lt(postComments.id, cursor.id)),
        )
      : undefined

    const conditions = [
      eq(postComments.postId, postId),
      ...(cursorCondition ? [cursorCondition] : []),
    ]

    const rows = await this.db.select(enrichedSelect)
      .from(postComments)
      .innerJoin(users, eq(users.id, postComments.userId))
      .where(and(...conditions))
      .orderBy(desc(postComments.createdAt), desc(postComments.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const last = pageRows[pageRows.length - 1]
    const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null

    return { comments: pageRows as EnrichedComment[], nextCursor }
  }
}
