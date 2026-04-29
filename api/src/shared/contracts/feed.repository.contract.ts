import type { PostMedia } from './posts.repository.contract.js'

export type FeedCursor = {
  createdAt: Date
  id: string
}

export type EnrichedPost = {
  id: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string | null
  visibility: 'public' | 'friends_only' | 'private'
  type: 'manual' | 'item_share'
  itemId: string | null
  collectionId: string | null
  /** Preenchido em posts type='item_share' */
  itemName: string | null
  itemCoverUrl: string | null
  collectionName: string | null
  collectionType: string | null
  media: PostMedia[]
  reactionCount: number
  commentCount: number
  userReaction: string | null
  createdAt: Date
  updatedAt: Date
}

export type GetFeedParams = {
  viewerId: string
  friendIds: string[]
  blockedIds: string[]
  cursor?: FeedCursor
  limit: number
}

export type GetProfilePostsParams = {
  ownerId: string
  viewerId: string | null
  viewerIsFriend: boolean
  cursor?: FeedCursor
  limit: number
}

export interface IFeedRepository {
  getFeed(params: GetFeedParams): Promise<{ posts: EnrichedPost[]; nextCursor: FeedCursor | null }>
  getProfilePosts(params: GetProfilePostsParams): Promise<{ posts: EnrichedPost[]; nextCursor: FeedCursor | null }>
  findEnrichedById(id: string, viewerId: string | null): Promise<EnrichedPost | null>
}
