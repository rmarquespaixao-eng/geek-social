// src/modules/friends/friends.service.ts
import type { IFriendsRepository, Friendship, FriendUser, FriendRequestWithUser, Block, BlockedUserInfo } from '../../shared/contracts/friends.repository.contract.js'

export class FriendsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'FriendsError'
  }
}

export class FriendsService {
  constructor(private readonly repo: IFriendsRepository) {}

  async sendRequest(requesterId: string, receiverId: string): Promise<Friendship> {
    if (requesterId === receiverId) throw new FriendsError('SELF_REQUEST')
    const blocked = await this.repo.isBlockedEitherDirection(requesterId, receiverId)
    if (blocked) throw new FriendsError('NOT_FOUND')
    const existing = await this.repo.findExistingRelation(requesterId, receiverId)
    if (existing) throw new FriendsError('ALREADY_EXISTS')
    return this.repo.createRequest(requesterId, receiverId)
  }

  async acceptRequest(userId: string, requestId: string): Promise<Friendship> {
    const request = await this.repo.findRequestById(requestId)
    if (!request || request.receiverId !== userId) throw new FriendsError('NOT_FOUND')
    if (request.status !== 'pending') throw new FriendsError('NOT_PENDING')
    return this.repo.updateRequestStatus(requestId, 'accepted')
  }

  async rejectRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.repo.findRequestById(requestId)
    if (!request || request.receiverId !== userId) throw new FriendsError('NOT_FOUND')
    if (request.status !== 'pending') throw new FriendsError('NOT_PENDING')
    await this.repo.removeFriendshipBetween(request.requesterId, request.receiverId)
  }

  async cancelRequest(userId: string, requestId: string): Promise<void> {
    const request = await this.repo.findRequestById(requestId)
    if (!request || request.requesterId !== userId) throw new FriendsError('NOT_FOUND')
    if (request.status !== 'pending') throw new FriendsError('NOT_PENDING')
    await this.repo.removeFriendshipBetween(request.requesterId, request.receiverId)
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    const areFriends = await this.repo.areFriends(userId, friendId)
    if (!areFriends) throw new FriendsError('NOT_FOUND')
    await this.repo.removeFriendshipBetween(userId, friendId)
  }

  async listFriends(userId: string): Promise<FriendUser[]> {
    return this.repo.findFriends(userId)
  }

  async listReceivedRequests(userId: string): Promise<FriendRequestWithUser[]> {
    return this.repo.findReceivedRequestsWithUser(userId)
  }

  async listSentRequests(userId: string): Promise<FriendRequestWithUser[]> {
    return this.repo.findSentRequestsWithUser(userId)
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) throw new FriendsError('SELF_BLOCK')
    await this.repo.removeFriendshipBetween(blockerId, blockedId)
    await this.repo.createBlock(blockerId, blockedId)
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    const isBlocked = await this.repo.isBlockedBy(blockerId, blockedId)
    if (!isBlocked) throw new FriendsError('NOT_FOUND')
    await this.repo.deleteBlock(blockerId, blockedId)
  }

  async listBlocks(blockerId: string): Promise<BlockedUserInfo[]> {
    return this.repo.findBlocksByBlockerWithUser(blockerId)
  }

  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    return this.repo.areFriends(userId, otherUserId)
  }

  async isBlockedBy(potentialBlockedId: string, blockerId: string): Promise<boolean> {
    return this.repo.isBlockedBy(blockerId, potentialBlockedId)
  }
}
