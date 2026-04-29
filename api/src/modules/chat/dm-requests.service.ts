import type { IDmRequestsRepository, DmRequest } from '../../shared/contracts/dm-requests.repository.contract.js'
import type { IConversationsRepository, Conversation } from '../../shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { NotificationsService } from '../notifications/notifications.service.js'
import { ChatError } from './chat.errors.js'

export class DmRequestsService {
  constructor(
    private readonly repo: IDmRequestsRepository,
    private readonly conversationsRepo: IConversationsRepository,
    private readonly friendsRepo: IFriendsRepository,
    private readonly notificationsService?: NotificationsService,
  ) {}

  async sendRequest(senderId: string, receiverId: string): Promise<DmRequest> {
    if (senderId === receiverId) throw new ChatError('SELF_REQUEST')
    const blocked = await this.friendsRepo.isBlockedEitherDirection(senderId, receiverId)
    if (blocked) throw new ChatError('NOT_FOUND')
    const areFriends = await this.friendsRepo.areFriends(senderId, receiverId)
    if (areFriends) throw new ChatError('FRIENDS_USE_DM')
    const existing = await this.repo.findExisting(senderId, receiverId)
    if (existing) throw new ChatError('ALREADY_EXISTS')
    const created = await this.repo.create(senderId, receiverId)
    this.notificationsService?.notify({
      recipientId: receiverId,
      actorId: senderId,
      type: 'dm_request_received',
      entityId: created.id,
    }).catch(() => {})
    return created
  }

  async acceptRequest(requestId: string, userId: string): Promise<{ conversation: Conversation; senderId: string; receiverId: string }> {
    const request = await this.repo.findById(requestId)
    if (!request || request.receiverId !== userId) throw new ChatError('NOT_FOUND')
    if (request.status !== 'pending') throw new ChatError('NOT_PENDING')
    const conversation = await this.conversationsRepo.create({ type: 'dm' })
    await this.conversationsRepo.addMember(conversation.id, request.senderId, 'member')
    await this.conversationsRepo.addMember(conversation.id, request.receiverId, 'member')
    await this.repo.updateStatus(requestId, 'accepted', conversation.id)
    return { conversation, senderId: request.senderId, receiverId: request.receiverId }
  }

  async rejectRequest(requestId: string, userId: string): Promise<void> {
    const request = await this.repo.findById(requestId)
    if (!request || request.receiverId !== userId) throw new ChatError('NOT_FOUND')
    if (request.status !== 'pending') throw new ChatError('NOT_PENDING')
    await this.repo.updateStatus(requestId, 'rejected')
  }

  async listReceivedPending(userId: string): Promise<DmRequest[]> {
    return this.repo.findReceivedPending(userId)
  }
}
