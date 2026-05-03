import type { IConversationsRepository, Conversation, ConversationMember, MemberPermissions, MemberRole, ConversationWithMeta } from '../../shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import { ChatError } from './chat.errors.js'

export class ConversationsService {
  constructor(
    private readonly repo: IConversationsRepository,
    private readonly friendsRepo: IFriendsRepository,
    private readonly storageService: IStorageService,
    private readonly presenceService?: import('./presence.service.js').PresenceService,
    private readonly usersRepository?: import('../users/users.repository.js').UsersRepository,
  ) {}

  async createGroup(userId: string, data: { name: string; description?: string }): Promise<ConversationWithMeta> {
    const conversation = await this.repo.create({ type: 'group', name: data.name, description: data.description, createdBy: userId })
    await this.repo.addMember(conversation.id, userId, 'owner')
    const enriched = await this.repo.findConversationWithMeta(conversation.id, userId)
    return enriched!
  }

  async openDirectDm(userId: string, friendId: string): Promise<ConversationWithMeta> {
    const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, friendId)
    if (blocked) throw new ChatError('NOT_FOUND')
    const areFriends = await this.friendsRepo.areFriends(userId, friendId)
    if (!areFriends) throw new ChatError('NOT_FRIENDS')
    const existing = await this.repo.findExistingDm(userId, friendId)
    if (existing) {
      const enriched = await this.repo.findConversationWithMeta(existing.id, userId)
      return enriched!
    }
    const conversation = await this.repo.create({ type: 'dm' })
    await this.repo.addMember(conversation.id, userId, 'member')
    await this.repo.addMember(conversation.id, friendId, 'member')
    const enriched = await this.repo.findConversationWithMeta(conversation.id, userId)
    return enriched!
  }

  async getConversation(conversationId: string, userId: string): Promise<ConversationWithMeta> {
    const conversation = await this.repo.findConversationWithMeta(conversationId, userId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    return this.enrichWithBlockInfo(conversation, userId)
  }

  private async enrichWithBlockInfo(conv: ConversationWithMeta, viewerId: string): Promise<ConversationWithMeta> {
    let participants = conv.participants

    // Popular isOnline apenas para participantes amigos com showPresence=true
    if (this.presenceService && this.usersRepository) {
      const enriched = await Promise.all(participants.map(async p => {
        if (p.userId === viewerId) return p
        const isFriend = await this.friendsRepo.areFriends(viewerId, p.userId)
        if (!isFriend) return p
        const user = await this.usersRepository!.findById(p.userId)
        if (!user || !user.showPresence) return p
        return { ...p, isOnline: this.presenceService!.isOnline(p.userId) }
      }))
      participants = enriched
    }

    if (conv.type !== 'dm') return { ...conv, participants }

    const other = participants.find(p => p.userId !== viewerId)
    if (!other) return { ...conv, participants }
    const [isBlockedByMe, isBlockedByOther] = await Promise.all([
      this.friendsRepo.isBlockedBy(viewerId, other.userId),
      this.friendsRepo.isBlockedBy(other.userId, viewerId),
    ])

    if (isBlockedByOther) {
      participants = participants.map(p =>
        p.userId === other.userId
          ? { ...p, displayName: 'Usuário do Geek Social', avatarUrl: null, isOnline: false }
          : p,
      )
    }

    return { ...conv, participants, isBlockedByMe, isBlockedByOther }
  }

  async updateGroup(conversationId: string, userId: string, data: { name?: string; description?: string }): Promise<Conversation> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member || !['owner', 'admin'].includes(member.role)) throw new ChatError('FORBIDDEN')
    return this.repo.update(conversationId, data)
  }

  async deleteGroup(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member || member.role !== 'owner') throw new ChatError('FORBIDDEN')
    await this.repo.delete(conversationId)
  }

  async uploadGroupCover(conversationId: string, userId: string, fileBuffer: Buffer, mimeType: string): Promise<Conversation> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member || !['owner', 'admin'].includes(member.role)) throw new ChatError('FORBIDDEN')
    const key = `chat/covers/${conversationId}.webp`
    const url = await this.storageService.upload(key, fileBuffer, 'image/webp')
    return this.repo.update(conversationId, { coverUrl: url })
  }

  async inviteMember(conversationId: string, callerId: string, targetUserId: string): Promise<ConversationMember> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const caller = await this.repo.findMember(conversationId, callerId)
    if (!caller || !['owner', 'admin'].includes(caller.role)) throw new ChatError('FORBIDDEN')
    const blocked = await this.friendsRepo.isBlockedEitherDirection(callerId, targetUserId)
    if (blocked) throw new ChatError('NOT_FOUND')
    const existingTarget = await this.repo.findMember(conversationId, targetUserId)
    if (existingTarget) throw new ChatError('ALREADY_MEMBER')
    return this.repo.addMember(conversationId, targetUserId, 'member')
  }

  async removeMember(conversationId: string, callerId: string, targetUserId: string): Promise<string> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const caller = await this.repo.findMember(conversationId, callerId)
    if (!caller || caller.role === 'member') throw new ChatError('FORBIDDEN')
    const target = await this.repo.findMember(conversationId, targetUserId)
    if (!target) throw new ChatError('NOT_FOUND')
    if (target.role === 'owner') throw new ChatError('CANNOT_REMOVE_OWNER')
    if (caller.role === 'admin' && target.role !== 'member') throw new ChatError('FORBIDDEN')
    await this.repo.removeMember(conversationId, targetUserId)
    const newSenderKeyId = await this.repo.rotateSenderKey(conversationId)
    return newSenderKeyId
  }

  async updateMemberRole(conversationId: string, callerId: string, targetUserId: string, role: MemberRole): Promise<void> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const caller = await this.repo.findMember(conversationId, callerId)
    if (!caller || caller.role !== 'owner') throw new ChatError('FORBIDDEN')
    const target = await this.repo.findMember(conversationId, targetUserId)
    if (!target) throw new ChatError('NOT_FOUND')
    await this.repo.updateMember(conversationId, targetUserId, { role })
    if (role === 'owner') {
      await this.repo.updateMember(conversationId, callerId, { role: 'admin' })
    }
  }

  async updateMemberPermissions(conversationId: string, callerId: string, targetUserId: string, permissions: MemberPermissions): Promise<void> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const caller = await this.repo.findMember(conversationId, callerId)
    if (!caller || caller.role === 'member') throw new ChatError('FORBIDDEN')
    const target = await this.repo.findMember(conversationId, targetUserId)
    if (!target) throw new ChatError('NOT_FOUND')
    if (target.role === 'owner') throw new ChatError('FORBIDDEN')
    await this.repo.updateMember(conversationId, targetUserId, { permissions })
  }

  async leaveConversation(conversationId: string, userId: string): Promise<{ senderKeyId: string } | { deleted: true }> {
    const conversation = await this.repo.findById(conversationId)
    if (!conversation) throw new ChatError('NOT_FOUND')
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')

    if (member.role !== 'owner') {
      await this.repo.removeMember(conversationId, userId)
      const senderKeyId = await this.repo.rotateSenderKey(conversationId)
      return { senderKeyId }
    }

    const allMembers = await this.repo.findMembers(conversationId)
    const remaining = allMembers.filter(m => m.userId !== userId)

    if (remaining.length === 0) {
      await this.repo.delete(conversationId)
      return { deleted: true }
    }

    const nextOwner =
      remaining.filter(m => m.role === 'admin').sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0]
      ?? remaining.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0]

    await this.repo.updateMember(conversationId, nextOwner.userId, { role: 'owner' })
    await this.repo.removeMember(conversationId, userId)
    const senderKeyId = await this.repo.rotateSenderKey(conversationId)
    return { senderKeyId }
  }

  async listConversations(userId: string, archived = false): Promise<ConversationWithMeta[]> {
    const all = await this.repo.findUserConversations(userId, { archived })
    return Promise.all(all.map(c => this.enrichWithBlockInfo(c, userId)))
  }

  async archiveConversation(conversationId: string, userId: string): Promise<void> {
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    await this.repo.setArchived(conversationId, userId, true)
  }

  async unarchiveConversation(conversationId: string, userId: string): Promise<void> {
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    await this.repo.setArchived(conversationId, userId, false)
  }

  async hideConversation(conversationId: string, userId: string): Promise<void> {
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    await this.repo.setHiddenAt(conversationId, userId, new Date())
  }

  async setMuted(conversationId: string, userId: string, muted: boolean): Promise<void> {
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    await this.repo.setMuted(conversationId, userId, muted)
  }

  /**
   * Liga/desliga o "modo temporário" da DM. Retorna `true` se o estado mudou
   * (i.e. uma mensagem de sistema deve ser criada e o evento emitido).
   */
  async toggleTemporary(conversationId: string, userId: string, enabled: boolean): Promise<{ changed: boolean }> {
    const conv = await this.repo.findById(conversationId)
    if (!conv) throw new ChatError('NOT_FOUND')
    if (conv.type !== 'dm') throw new ChatError('NOT_DM')

    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')

    // Bloqueio em qualquer direção impede a configuração da DM
    const allMembers = await this.repo.findMembers(conversationId)
    const other = allMembers.find(m => m.userId !== userId)
    if (other) {
      const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, other.userId)
      if (blocked) throw new ChatError('BLOCKED')
    }

    if (conv.isTemporary === enabled) return { changed: false }
    await this.repo.setTemporary(conversationId, enabled)
    return { changed: true }
  }

  async findTemporaryDms(): Promise<Conversation[]> {
    return this.repo.findTemporaryDms()
  }

  async markAsRead(conversationId: string, userId: string): Promise<void> {
    const member = await this.repo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    await this.repo.updateLastReadAt(conversationId, userId)
  }

  async getConversationIds(userId: string): Promise<string[]> {
    const members = await this.repo.findMembersByUserId(userId)
    return members.map(m => m.conversationId)
  }

  /**
   * Retorna os userIds das pessoas com quem o `userId` tem DM (1:1).
   * Usado pelo gateway para inscrever em presence rooms (mostrar online/offline
   * mesmo sem amizade, contanto que tenham conversa ativa).
   */
  async getDmPartnerIds(userId: string): Promise<string[]> {
    return this.repo.findDmPartnerIds(userId)
  }

  async getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
    return this.repo.findMembers(conversationId)
  }

  async findMembersWithReceiptsFlag(conversationId: string) {
    return this.repo.findMembersWithReceiptsFlag(conversationId)
  }

  async getConversationType(conversationId: string): Promise<'dm' | 'group' | null> {
    const conv = await this.repo.findById(conversationId)
    return conv?.type ?? null
  }

  async findMember(conversationId: string, userId: string): Promise<ConversationMember | null> {
    return this.repo.findMember(conversationId, userId)
  }
}
