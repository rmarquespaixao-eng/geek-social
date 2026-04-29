export type ItemShareParams = {
  userId: string
  itemId: string
  collectionId: string
  collectionVisibility: 'public' | 'friends_only' | 'private'
}

export interface IPostsService {
  createItemShare(params: ItemShareParams): Promise<void>
}
