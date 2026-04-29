import { and, desc, eq, isNull, sql, or, lt } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import {
  posts,
  communityTopicMeta,
  users,
  postReactions,
  postComments,
} from '../../shared/infra/database/schema.js'
import type { TopicRow } from './communities.repository.js'

export type TopicMetaRow = {
  postId: string
  communityId: string
  pinned: boolean
  locked: boolean
  pinnedAt: Date | null
  lockedAt: Date | null
  movedFromCommunityId: string | null
  createdAt: Date
}

export class TopicsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findByCommunity(
    communityId: string,
    opts: { cursor?: { pinned: boolean; createdAt: Date; postId: string } | null; limit: number },
  ): Promise<{ topics: TopicRow[]; nextCursor: { pinned: boolean; createdAt: Date; postId: string } | null }> {
    const conditions = [
      eq(communityTopicMeta.communityId, communityId),
      isNull(posts.deletedAt),
    ]

    if (opts.cursor) {
      const { pinned, createdAt, postId } = opts.cursor
      conditions.push(
        or(
          sql`(${communityTopicMeta.pinned} = false AND ${pinned} = true)`,
          and(
            sql`${communityTopicMeta.pinned} = ${pinned}`,
            or(
              lt(posts.createdAt, createdAt),
              and(eq(posts.createdAt, createdAt), sql`${posts.id} < ${postId}`),
            ),
          ),
        )!,
      )
    }

    const rows = await this.db
      .select({
        postId: posts.id,
        communityId: communityTopicMeta.communityId,
        authorId: posts.userId,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
        content: posts.content,
        pinned: communityTopicMeta.pinned,
        locked: communityTopicMeta.locked,
        movedFromCommunityId: communityTopicMeta.movedFromCommunityId,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        reactionCount: sql<number>`(SELECT count(*)::int FROM post_reactions pr WHERE pr.post_id = ${posts.id})`,
        commentCount: sql<number>`(SELECT count(*)::int FROM post_comments pc WHERE pc.post_id = ${posts.id})`,
      })
      .from(communityTopicMeta)
      .innerJoin(posts, eq(posts.id, communityTopicMeta.postId))
      .innerJoin(users, eq(users.id, posts.userId))
      .where(and(...conditions))
      .orderBy(desc(communityTopicMeta.pinned), desc(posts.createdAt))
      .limit(opts.limit + 1)

    const mapped: TopicRow[] = rows.map(r => ({
      postId: r.postId,
      communityId: r.communityId,
      authorId: r.authorId,
      authorName: r.authorName,
      authorAvatarUrl: r.authorAvatarUrl,
      content: r.content,
      pinned: r.pinned,
      locked: r.locked,
      movedFromCommunityId: r.movedFromCommunityId,
      reactionCount: r.reactionCount,
      commentCount: r.commentCount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))

    const hasMore = mapped.length > opts.limit
    const page = hasMore ? mapped.slice(0, opts.limit) : mapped
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? { pinned: last.pinned, createdAt: last.createdAt, postId: last.postId } : null
    return { topics: page, nextCursor }
  }

  async findTopicById(postId: string): Promise<TopicRow | null> {
    const [row] = await this.db
      .select({
        postId: posts.id,
        communityId: communityTopicMeta.communityId,
        authorId: posts.userId,
        authorName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
        content: posts.content,
        pinned: communityTopicMeta.pinned,
        locked: communityTopicMeta.locked,
        movedFromCommunityId: communityTopicMeta.movedFromCommunityId,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        reactionCount: sql<number>`(SELECT count(*)::int FROM post_reactions pr WHERE pr.post_id = ${posts.id})`,
        commentCount: sql<number>`(SELECT count(*)::int FROM post_comments pc WHERE pc.post_id = ${posts.id})`,
      })
      .from(communityTopicMeta)
      .innerJoin(posts, eq(posts.id, communityTopicMeta.postId))
      .innerJoin(users, eq(users.id, posts.userId))
      .where(and(eq(communityTopicMeta.postId, postId), isNull(posts.deletedAt)))
      .limit(1)

    if (!row) return null
    return {
      postId: row.postId,
      communityId: row.communityId,
      authorId: row.authorId,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
      content: row.content,
      pinned: row.pinned,
      locked: row.locked,
      movedFromCommunityId: row.movedFromCommunityId,
      reactionCount: row.reactionCount,
      commentCount: row.commentCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async findMetaByPostId(postId: string): Promise<TopicMetaRow | null> {
    const [row] = await this.db
      .select()
      .from(communityTopicMeta)
      .where(eq(communityTopicMeta.postId, postId))
      .limit(1)
    return (row as TopicMetaRow | undefined) ?? null
  }

  async insertMeta(postId: string, communityId: string, tx?: DatabaseClient): Promise<TopicMetaRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .insert(communityTopicMeta)
      .values({ postId, communityId })
      .returning()
    return row as TopicMetaRow
  }

  async setPinned(postId: string, pinned: boolean, tx?: DatabaseClient): Promise<TopicMetaRow> {
    const exec = tx ?? this.db
    const patch: Record<string, unknown> = { pinned }
    if (pinned) patch.pinnedAt = new Date()
    const [row] = await exec
      .update(communityTopicMeta)
      .set(patch)
      .where(eq(communityTopicMeta.postId, postId))
      .returning()
    return row as TopicMetaRow
  }

  async setLocked(postId: string, locked: boolean, tx?: DatabaseClient): Promise<TopicMetaRow> {
    const exec = tx ?? this.db
    const patch: Record<string, unknown> = { locked }
    if (locked) patch.lockedAt = new Date()
    const [row] = await exec
      .update(communityTopicMeta)
      .set(patch)
      .where(eq(communityTopicMeta.postId, postId))
      .returning()
    return row as TopicMetaRow
  }

  async setMovedFrom(postId: string, fromCommunityId: string, tx?: DatabaseClient): Promise<TopicMetaRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .update(communityTopicMeta)
      .set({ movedFromCommunityId: fromCommunityId })
      .where(eq(communityTopicMeta.postId, postId))
      .returning()
    return row as TopicMetaRow
  }

  async softDeletePost(postId: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec
      .update(posts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(posts.id, postId))
  }
}
