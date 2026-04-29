// src/modules/feed/types.ts

export interface MediaItem {
  id: string
  url: string
  type: 'image' | 'video'
  thumbnailUrl?: string | null
}

export interface Reaction {
  type: string
  count: number
  userReacted: boolean
}

export type PostType = 'manual' | 'item_share'

export type CollectionTypeLite = 'games' | 'books' | 'cardgames' | 'boardgames' | 'custom'

export interface Post {
  id: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string | null
  media: MediaItem[]
  reactionCount: number
  commentCount: number
  userReaction: string | null
  visibility: 'public' | 'friends_only' | 'private'
  type: PostType
  itemId: string | null
  collectionId: string | null
  itemName: string | null
  itemCoverUrl: string | null
  collectionName: string | null
  collectionType: CollectionTypeLite | null
  createdAt: string
  updatedAt?: string
}

export interface Comment {
  id: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string
  createdAt: string
}

export interface FeedPage {
  posts: Post[]
  nextCursor: string | null
}

export interface CommentsPage {
  comments: Comment[]
  nextCursor: string | null
}
