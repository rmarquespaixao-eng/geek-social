export type Comment = {
  id: string
  postId: string
  userId: string
  content: string
  createdAt: Date
  updatedAt: Date
}

export type EnrichedComment = {
  id: string
  postId: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string
  createdAt: Date
  updatedAt: Date
}

export type CommentCursor = {
  createdAt: Date
  id: string
}

export interface ICommentsRepository {
  create(postId: string, userId: string, content: string): Promise<EnrichedComment>
  findById(id: string): Promise<Comment | null>
  update(id: string, content: string): Promise<EnrichedComment>
  delete(id: string): Promise<void>
  findByPostId(postId: string, cursor?: CommentCursor, limit?: number, excludedUserIds?: string[]): Promise<{ comments: EnrichedComment[]; nextCursor: CommentCursor | null }>
}
