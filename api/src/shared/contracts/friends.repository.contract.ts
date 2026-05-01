export type FriendshipStatus = 'pending' | 'accepted'

export type Friendship = {
  id: string
  requesterId: string
  receiverId: string
  status: FriendshipStatus
  createdAt: Date
  updatedAt: Date
}

export type FriendUser = {
  id: string
  displayName: string
  avatarUrl: string | null
  isOnline: boolean
  lastSeenAt: Date | null
}

export type FriendRequestWithUser = {
  id: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  receiverId: string
  receiverName: string
  receiverAvatarUrl: string | null
  status: FriendshipStatus
  createdAt: Date
}

export type Block = {
  id: string
  blockerId: string
  blockedId: string
  createdAt: Date
}

export type BlockedUserInfo = {
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface IFriendsRepository {
  createRequest(requesterId: string, receiverId: string): Promise<Friendship>
  findRequestById(id: string): Promise<Friendship | null>
  findExistingRelation(userId1: string, userId2: string): Promise<Friendship | null>
  findReceivedRequests(receiverId: string): Promise<Friendship[]>
  findSentRequests(requesterId: string): Promise<Friendship[]>
  findReceivedRequestsWithUser(receiverId: string): Promise<FriendRequestWithUser[]>
  findSentRequestsWithUser(requesterId: string): Promise<FriendRequestWithUser[]>
  updateRequestStatus(id: string, status: FriendshipStatus): Promise<Friendship>
  findFriendIds(userId: string): Promise<string[]>
  findFriends(userId: string): Promise<FriendUser[]>
  areFriends(userId: string, otherUserId: string): Promise<boolean>
  removeFriendshipBetween(userId1: string, userId2: string): Promise<void>
  deleteById(id: string): Promise<void>
  createBlock(blockerId: string, blockedId: string): Promise<void>
  deleteBlock(blockerId: string, blockedId: string): Promise<void>
  isBlockedBy(blockerId: string, blockedId: string): Promise<boolean>
  isBlockedEitherDirection(userId1: string, userId2: string): Promise<boolean>
  findBlocksByBlocker(blockerId: string): Promise<Block[]>
  findBlocksByBlockerWithUser(blockerId: string): Promise<BlockedUserInfo[]>
  findAllBlockRelationUserIds(userId: string): Promise<string[]>
  block(blockerId: string, blockedId: string): Promise<void>
}
