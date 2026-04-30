export type ReactionType = 'power_up' | 'epic' | 'critical' | 'loot' | 'gg'

export type Reaction = {
  id: string
  postId: string
  userId: string
  type: ReactionType
  createdAt: Date
}

export type ReactionCounts = Record<ReactionType, number>

export interface IReactionsRepository {
  upsert(postId: string, userId: string, type: ReactionType): Promise<Reaction>
  delete(postId: string, userId: string): Promise<void>
  findByPostAndUser(postId: string, userId: string): Promise<Reaction | null>
  countsByPostId(postId: string): Promise<ReactionCounts>
  countsByPostIdExcludingUsers(postId: string, excludedUserIds: string[]): Promise<ReactionCounts>
}
