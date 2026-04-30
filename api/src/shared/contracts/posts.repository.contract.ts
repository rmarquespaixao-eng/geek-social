export type PostType = 'manual' | 'item_share'
export type PostVisibility = 'public' | 'friends_only' | 'private'

export type PostMedia = {
  id: string
  postId: string
  url: string
  thumbnailUrl: string | null
  displayOrder: number
}

export type Post = {
  id: string
  userId: string
  type: PostType
  content: string | null
  visibility: PostVisibility
  itemId: string | null
  collectionId: string | null
  communityId: string | null
  deletedAt: Date | null
  media: PostMedia[]
  createdAt: Date
  updatedAt: Date
}

export type CreatePostData = {
  userId: string
  type: PostType
  content?: string | null
  visibility: PostVisibility
  itemId?: string | null
  collectionId?: string | null
  communityId?: string | null
}

export type UpdatePostData = {
  content?: string | null
  visibility?: PostVisibility
  communityId?: string | null
}

export interface IPostsRepository {
  create(data: CreatePostData, tx?: unknown): Promise<Post>
  findById(id: string): Promise<Post | null>
  update(id: string, data: UpdatePostData): Promise<Post>
  delete(id: string): Promise<void>
  softDelete(id: string, tx?: unknown): Promise<void>
  addMedia(postId: string, url: string, displayOrder: number, thumbnailUrl?: string | null): Promise<PostMedia>
  removeMedia(mediaId: string): Promise<void>
  findMediaById(mediaId: string): Promise<PostMedia | null>
  countMedia(postId: string): Promise<number>
  maxMediaOrder(postId: string): Promise<number>
}
