export type CallMetadata = {
  status: 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'
  durationSec: number
  startedAt: string
  endedAt: string
  initiatorId: string
}

export type TemporaryEvent = {
  enabled: boolean
  byUserId: string
}

export type Message = {
  id: string
  conversationId: string
  userId: string
  content: string | null
  replyToId: string | null
  callMetadata: CallMetadata | null
  isTemporary: boolean
  temporaryEvent: TemporaryEvent | null
  hiddenForUserIds: string[]
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type MessageReaction = {
  emoji: string
  count: number
  userIds: string[]
}

export type MessageAttachment = {
  id: string
  messageId: string | null
  uploadedBy: string
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
  displayOrder: number
  durationMs: number | null
  waveformPeaks: number[] | null
  thumbnailUrl: string | null
}

export type MessageWithAttachments = Message & {
  attachments: MessageAttachment[]
}

export type MessageCursor = { createdAt: Date; id: string }

export interface IMessagesRepository {
  createMessage(data: {
    conversationId: string
    userId: string
    content?: string
    replyToId?: string
    callMetadata?: CallMetadata
    isTemporary?: boolean
    temporaryEvent?: TemporaryEvent
  }): Promise<Message>
  findMessageById(id: string): Promise<MessageWithAttachments | null>
  softDeleteMessage(id: string): Promise<Message>
  hardDeleteMessage(id: string): Promise<Message | null>
  /** Mensagens temporárias que devem ser ocultadas para `userId` quando ele sai da conversa. Inclui as que ele enviou e as recebidas que ele já leu. */
  findTemporaryToHideFor(conversationId: string, userId: string, lastReadAt: Date): Promise<MessageWithAttachments[]>
  /** Adiciona userId a `hidden_for_user_ids`. Idempotente. Retorna a mensagem atualizada. */
  addHiddenForUser(messageId: string, userId: string): Promise<MessageWithAttachments | null>
  /** @deprecated substituído por findTemporaryToHideFor */
  findReadTemporaryReceivedBy(conversationId: string, userId: string, before: Date): Promise<MessageWithAttachments[]>
  findExpiredTemporary(cutoff: Date, limit: number): Promise<MessageWithAttachments[]>

  addReaction(messageId: string, userId: string, emoji: string): Promise<void>
  removeReaction(messageId: string, userId: string, emoji: string): Promise<void>
  findReactionsByMessageIds(messageIds: string[]): Promise<Map<string, { emoji: string; userId: string }[]>>

  createAttachment(data: {
    uploadedBy: string
    url: string
    filename: string
    mimeType: string
    sizeBytes: number
    displayOrder: number
    durationMs?: number | null
    waveformPeaks?: number[] | null
    thumbnailUrl?: string | null
  }): Promise<MessageAttachment>
  linkAttachments(messageId: string, attachmentIds: string[]): Promise<void>
  cloneAttachmentsToMessage(sourceMessageId: string, targetMessageId: string, uploadedBy: string): Promise<void>
  findAttachmentsByUploader(uploadedBy: string, ids: string[]): Promise<MessageAttachment[]>

  findMessagesByConversation(params: {
    conversationId: string
    cursor?: MessageCursor
    limit: number
    afterDate?: Date
    /** Quando informado, mensagens com `hidden_for_user_ids` contendo este userId são filtradas. */
    excludeHiddenForUserId?: string
  }): Promise<{ messages: MessageWithAttachments[]; nextCursor: MessageCursor | null }>
}
