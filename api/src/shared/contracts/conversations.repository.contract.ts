export type ConversationType = 'dm' | 'group'
export type MemberRole = 'owner' | 'admin' | 'member'

export type MemberPermissions = {
  can_send_messages: boolean
  can_send_files: boolean
}

export type Conversation = {
  id: string
  type: ConversationType
  name: string | null
  description: string | null
  coverUrl: string | null
  createdBy: string | null
  isTemporary: boolean
  senderKeyId: string
  createdAt: Date
  updatedAt: Date
}

export type ConversationMember = {
  id: string
  conversationId: string
  userId: string
  role: MemberRole
  permissions: MemberPermissions
  joinedAt: Date
  lastReadAt: Date | null
  isArchived: boolean
  hiddenAt: Date | null
  isMuted: boolean
}

export type ParticipantInfo = {
  userId: string
  displayName: string
  avatarUrl: string | null
  isOnline: boolean
  role: MemberRole
}

export type LastMessageInfo = {
  id: string
  content: string | null
  senderId: string
  createdAt: Date
  type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'call'
  isEncrypted: boolean
}

export type ConversationWithMeta = Conversation & {
  participants: ParticipantInfo[]
  lastMessage: LastMessageInfo | null
  unreadCount: number
  dmRequest: { id: string; senderId: string; receiverId: string; status: string } | null
  isBlockedByMe: boolean
  isBlockedByOther: boolean
  isArchived: boolean
  isMuted: boolean
  isTemporary: boolean
}

export interface IConversationsRepository {
  create(data: { type: ConversationType; name?: string; description?: string; createdBy?: string }): Promise<Conversation>
  findById(id: string): Promise<Conversation | null>
  update(id: string, data: { name?: string; description?: string; coverUrl?: string }): Promise<Conversation>
  delete(id: string): Promise<void>

  addMember(conversationId: string, userId: string, role: MemberRole): Promise<ConversationMember>
  findMember(conversationId: string, userId: string): Promise<ConversationMember | null>
  updateMember(conversationId: string, userId: string, data: { role?: MemberRole; permissions?: MemberPermissions }): Promise<ConversationMember>
  removeMember(conversationId: string, userId: string): Promise<void>
  findMembers(conversationId: string): Promise<ConversationMember[]>
  findMembersByUserId(userId: string): Promise<ConversationMember[]>
  /** UserIds com quem `userId` tem DM 1:1 — usado para presence rooms (ver online/offline sem ser amigo). */
  findDmPartnerIds(userId: string): Promise<string[]>

  findExistingDm(userAId: string, userBId: string): Promise<Conversation | null>
  findUserConversations(userId: string, opts?: { archived?: boolean; includeHidden?: boolean }): Promise<ConversationWithMeta[]>
  findConversationWithMeta(conversationId: string, userId: string): Promise<ConversationWithMeta | null>
  updateLastReadAt(conversationId: string, userId: string): Promise<void>
  setArchived(conversationId: string, userId: string, archived: boolean): Promise<void>
  setHiddenAt(conversationId: string, userId: string, hiddenAt: Date | null): Promise<void>
  setMuted(conversationId: string, userId: string, muted: boolean): Promise<void>
  setTemporary(conversationId: string, value: boolean): Promise<void>
  findTemporaryDms(): Promise<Conversation[]>
  findMembersWithReceiptsFlag(conversationId: string): Promise<Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>>
  rotateSenderKey(conversationId: string): Promise<string>
}
