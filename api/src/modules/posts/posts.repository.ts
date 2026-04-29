import { eq, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { posts, postMedia } from '../../shared/infra/database/schema.js'
import type { IPostsRepository, Post, PostMedia, CreatePostData, UpdatePostData } from '../../shared/contracts/posts.repository.contract.js'

export class PostsRepository implements IPostsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreatePostData): Promise<Post> {
    const result = await this.db.insert(posts).values({
      userId: data.userId,
      type: data.type,
      content: data.content ?? null,
      visibility: data.visibility,
      itemId: data.itemId ?? null,
      collectionId: data.collectionId ?? null,
    }).returning()
    return { ...result[0], media: [] } as Post
  }

  async findById(id: string): Promise<Post | null> {
    const result = await this.db.select().from(posts).where(eq(posts.id, id)).limit(1)
    if (!result[0]) return null
    const media = await this.db.select().from(postMedia)
      .where(eq(postMedia.postId, id))
      .orderBy(postMedia.displayOrder)
    return { ...result[0], media: media as PostMedia[] } as Post
  }

  async update(id: string, data: UpdatePostData): Promise<Post> {
    await this.db.update(posts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(posts.id, id))
    return (await this.findById(id))!
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(posts).where(eq(posts.id, id))
  }

  async addMedia(postId: string, url: string, displayOrder: number, thumbnailUrl?: string | null): Promise<PostMedia> {
    const result = await this.db.insert(postMedia)
      .values({ postId, url, displayOrder, thumbnailUrl: thumbnailUrl ?? null })
      .returning()
    return result[0] as PostMedia
  }

  async removeMedia(mediaId: string): Promise<void> {
    await this.db.delete(postMedia).where(eq(postMedia.id, mediaId))
  }

  async findMediaById(mediaId: string): Promise<PostMedia | null> {
    const result = await this.db.select().from(postMedia).where(eq(postMedia.id, mediaId)).limit(1)
    return (result[0] as PostMedia) ?? null
  }

  async countMedia(postId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(postMedia)
      .where(eq(postMedia.postId, postId))
    return result[0]?.count ?? 0
  }

  async maxMediaOrder(postId: string): Promise<number> {
    const result = await this.db
      .select({ max: sql<number>`coalesce(max(display_order), -1)` })
      .from(postMedia)
      .where(eq(postMedia.postId, postId))
    return result[0]?.max ?? -1
  }
}
