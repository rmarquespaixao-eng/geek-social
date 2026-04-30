import { eq, and, or, inArray, notInArray, lt, desc, sql, isNull, exists, not } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { posts, postMedia, users, postReactions, postComments, userBlocks } from '../../shared/infra/database/schema.js'
import type { IFeedRepository, GetFeedParams, GetProfilePostsParams, FeedCursor, EnrichedPost } from '../../shared/contracts/feed.repository.contract.js'
import type { PostMedia } from '../../shared/contracts/posts.repository.contract.js'

async function loadMediaForPosts(db: DatabaseClient, postIds: string[]): Promise<Map<string, PostMedia[]>> {
  if (postIds.length === 0) return new Map()
  const allMedia = await db.select().from(postMedia)
    .where(inArray(postMedia.postId, postIds))
    .orderBy(postMedia.displayOrder)
  const mediaByPost = new Map<string, PostMedia[]>()
  for (const m of allMedia) {
    const arr = mediaByPost.get(m.postId) ?? []
    arr.push(m as PostMedia)
    mediaByPost.set(m.postId, arr)
  }
  return mediaByPost
}

function buildCursorCondition(cursor: FeedCursor) {
  return or(
    lt(posts.createdAt, cursor.createdAt),
    and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
  )
}

function paginateRows<T extends { createdAt: Date; id: string }>(rows: T[], limit: number): { pageRows: T[]; nextCursor: FeedCursor | null } {
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const last = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null
  return { pageRows, nextCursor }
}

function enrichedSelect(viewerId: string | null) {
  return {
    id: posts.id,
    authorId: posts.userId,
    authorName: users.displayName,
    authorAvatarUrl: users.avatarUrl,
    content: posts.content,
    visibility: posts.visibility,
    type: posts.type,
    itemId: posts.itemId,
    collectionId: posts.collectionId,
    // Subqueries para enriquecer item_share
    itemName: sql<string | null>`(SELECT name FROM items WHERE id = ${posts.itemId} LIMIT 1)`,
    itemCoverUrl: sql<string | null>`(SELECT cover_url FROM items WHERE id = ${posts.itemId} LIMIT 1)`,
    collectionName: sql<string | null>`(SELECT name FROM collections WHERE id = ${posts.collectionId} LIMIT 1)`,
    collectionType: sql<string | null>`(SELECT type::text FROM collections WHERE id = ${posts.collectionId} LIMIT 1)`,
    createdAt: posts.createdAt,
    updatedAt: posts.updatedAt,
    reactionCount: viewerId != null
      ? sql<number>`(SELECT COUNT(*) FROM post_reactions WHERE post_id = ${posts.id} AND NOT EXISTS (SELECT 1 FROM user_blocks WHERE (blocker_id = ${viewerId} AND blocked_id = user_id) OR (blocker_id = user_id AND blocked_id = ${viewerId})))::int`
      : sql<number>`(SELECT COUNT(*) FROM post_reactions WHERE post_id = ${posts.id})::int`,
    commentCount: viewerId != null
      ? sql<number>`(SELECT COUNT(*) FROM post_comments WHERE post_id = ${posts.id} AND NOT EXISTS (SELECT 1 FROM user_blocks WHERE (blocker_id = ${viewerId} AND blocked_id = user_id) OR (blocker_id = user_id AND blocked_id = ${viewerId})))::int`
      : sql<number>`(SELECT COUNT(*) FROM post_comments WHERE post_id = ${posts.id})::int`,
    userReaction: viewerId != null
      ? sql<string | null>`(SELECT type::text FROM post_reactions WHERE post_id = ${posts.id} AND user_id = ${viewerId} LIMIT 1)`
      : sql<null>`NULL::text`,
  }
}

export class FeedRepository implements IFeedRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getFeed({ viewerId, friendIds, blockedIds, cursor, limit }: GetFeedParams): Promise<{ posts: EnrichedPost[]; nextCursor: FeedCursor | null }> {
    // Feed pessoal NÃO inclui os próprios posts (esses aparecem no perfil).
    // Inclui: amigos (public + friends_only) + public de não-amigos.
    const friendClause = friendIds.length > 0
      ? and(
          inArray(posts.userId, friendIds),
          inArray(posts.visibility, ['public', 'friends_only']),
        )
      : undefined

    const discoveryClause = and(
      eq(posts.visibility, 'public'),
      friendIds.length > 0 ? notInArray(posts.userId, friendIds) : undefined,
      notInArray(posts.userId, [viewerId]),
    )

    const visibilityCondition = friendClause
      ? or(friendClause, discoveryClause)
      : discoveryClause

    const conditions = [visibilityCondition!, isNull(posts.communityId), isNull(posts.deletedAt)]
    if (blockedIds.length > 0) conditions.push(notInArray(posts.userId, blockedIds))
    if (cursor) conditions.push(buildCursorCondition(cursor)!)

    const rows = await this.db
      .select(enrichedSelect(viewerId))
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit + 1)

    const { pageRows, nextCursor } = paginateRows(rows, limit)
    const mediaByPost = await loadMediaForPosts(this.db, pageRows.map(r => r.id))
    const result = pageRows.map(r => ({ ...r, media: mediaByPost.get(r.id) ?? [] })) as EnrichedPost[]

    return { posts: result, nextCursor }
  }

  async getProfilePosts({ ownerId, viewerId, viewerIsFriend, cursor, limit }: GetProfilePostsParams): Promise<{ posts: EnrichedPost[]; nextCursor: FeedCursor | null }> {
    const isOwner = viewerId === ownerId
    const visibilities = isOwner
      ? (['public', 'friends_only', 'private'] as const)
      : viewerIsFriend
        ? (['public', 'friends_only'] as const)
        : (['public'] as const)

    const conditions = [
      eq(posts.userId, ownerId),
      inArray(posts.visibility, [...visibilities]),
      isNull(posts.communityId),
      isNull(posts.deletedAt),
      ...(cursor ? [buildCursorCondition(cursor)!] : []),
    ]

    const rows = await this.db
      .select(enrichedSelect(viewerId))
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit + 1)

    const { pageRows, nextCursor } = paginateRows(rows, limit)
    const mediaByPost = await loadMediaForPosts(this.db, pageRows.map(r => r.id))
    const result = pageRows.map(r => ({ ...r, media: mediaByPost.get(r.id) ?? [] })) as EnrichedPost[]

    return { posts: result, nextCursor }
  }

  async findEnrichedById(id: string, viewerId: string | null): Promise<EnrichedPost | null> {
    const rows = await this.db
      .select(enrichedSelect(viewerId))
      .from(posts)
      .innerJoin(users, eq(users.id, posts.userId))
      .where(and(eq(posts.id, id), isNull(posts.communityId), isNull(posts.deletedAt)))
      .limit(1)

    if (!rows[0]) return null
    const mediaByPost = await loadMediaForPosts(this.db, [id])
    return { ...rows[0], media: mediaByPost.get(id) ?? [] } as EnrichedPost
  }
}
