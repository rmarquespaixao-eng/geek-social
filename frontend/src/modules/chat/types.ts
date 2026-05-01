// src/modules/chat/types.ts

export type ConversationType = 'dm' | 'group'

export type CallStatus = 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'

export interface CallMetadata {
  status: CallStatus
  durationSec: number
  startedAt: string
  endedAt: string
  initiatorId: string
}

export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'file' | 'call' | 'temporary_toggle'

export interface TemporaryEvent {
  enabled: boolean
  byUserId: string
}

export type Seen =
  | null
  | { type: 'dm'; seen: boolean }
  | { type: 'group'; count: number; total: number }

export type MemberRole = 'owner' | 'admin' | 'member'

export interface ConversationMember {
  userId: string
  displayName: string
  avatarUrl: string | null
  isOnline: boolean
  role: MemberRole
}

/** @deprecated Use ConversationMember */
export type Participant = ConversationMember

export interface LastMessage {
  id: string
  content: string
  senderId: string
  createdAt: string
  type: MessageType
  isEncrypted?: boolean
}

export interface Conversation {
  id: string
  type: ConversationType
  name: string | null
  description?: string | null
  avatarUrl: string | null
  coverUrl?: string | null
  createdBy?: string | null
  senderKeyId: string
  participants: ConversationMember[]
  lastMessage: LastMessage | null
  unreadCount: number
  createdAt: string
  updatedAt: string
  dmRequest?: DmRequest | null
  isBlockedByMe?: boolean
  isBlockedByOther?: boolean
  isArchived?: boolean
  isMuted?: boolean
  isTemporary?: boolean
}

export type AttachmentType = 'image' | 'audio' | 'video' | 'file'

export interface MessageAttachment {
  id: string
  url: string
  type: AttachmentType
  name: string
  size: number
  mimeType?: string
  durationMs?: number
  waveformPeaks?: number[]
  thumbnailUrl?: string | null
}

/** @deprecated Use MessageAttachment */
export type Attachment = MessageAttachment

export interface MessageReply {
  id: string
  senderId: string
  senderName: string
  content: string
  type?: MessageType
  decryptError?: boolean
}

export interface MessageReaction {
  emoji: string
  count: number
  userIds: string[]
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  content: string
  isEncrypted?: boolean
  decryptError?: boolean
  type: MessageType
  attachments: MessageAttachment[]
  replyTo: MessageReply | null
  reactions: MessageReaction[]
  callMetadata?: CallMetadata
  isTemporary?: boolean
  temporaryEvent?: TemporaryEvent | null
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  seen?: Seen
}

export type DmRequestStatus = 'pending' | 'accepted' | 'rejected'

export interface DmRequest {
  id: string
  conversationId: string
  senderId: string
  receiverId: string
  status: DmRequestStatus
  createdAt: string
  /** Preenchido em listagens (listDmRequests). */
  senderName?: string
  senderAvatarUrl?: string | null
}

export interface TypingEvent {
  conversationId: string
  userId: string
  displayName: string
}

export interface PresenceEvent {
  userId: string
  isOnline: boolean
  lastSeenAt: string | null
}

export interface SendMessagePayload {
  content?: string
  type?: MessageType
  replyToId?: string
  attachmentIds?: string[]
  callMetadata?: CallMetadata
  isEncrypted?: boolean
}

export interface CreateGroupPayload {
  name: string
  description?: string
  participantIds?: string[]
}

export interface PaginatedMessages {
  messages: Message[]
  hasMore: boolean
  cursor: string | null
}

// ── Socket payload types ────────────────────────────────────────────────────

export interface SocketMessageNew {
  conversationId: string
  message: Message
}

export interface SocketMessageDeleted {
  conversationId: string
  messageId: string
}

export interface SocketMessageReaction {
  conversationId: string
  messageId: string
  reactions: MessageReaction[]
}

export interface SocketTyping {
  conversationId: string
  userId: string
  isTyping: boolean
}

export interface SocketPresenceUpdate {
  userId: string
  isOnline: boolean
}

export interface SocketMemberAdded {
  conversationId: string
  member: ConversationMember
}

export interface SocketMemberRemoved {
  conversationId: string
  userId: string
  senderKeyId: string
}

export interface SocketMemberLeft {
  conversationId: string
  userId: string
  senderKeyId: string
}

export interface SocketConversationUpdated {
  conversation: Conversation
}

export interface SocketMessageRead {
  conversationId: string
  userId: string
  lastReadAt: string
}
