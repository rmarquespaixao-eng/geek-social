import { eq, and, isNull } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { posts, postComments } from '../../../shared/infra/database/schema.js'

export class AdminContentRepository {
  constructor(private readonly db: DatabaseClient) {}

  async softDeletePost(id: string): Promise<boolean> {
    const [row] = await this.db
      .update(posts)
      .set({ deletedAt: new Date() })
      .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
      .returning({ id: posts.id })
    return row != null
  }

  async deleteComment(id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(postComments)
      .where(eq(postComments.id, id))
      .returning({ id: postComments.id })
    return row != null
  }
}
