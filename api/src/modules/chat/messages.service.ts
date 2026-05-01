import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import type { IMessagesRepository, MessageWithAttachments, MessageCursor, CallMetadata } from '../../shared/contracts/messages.repository.contract.js'
import type { IConversationsRepository } from '../../shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import { extractThumbnail, getVideoMetadata } from '../../shared/infra/video/video.processor.js'
import { ChatError } from './chat.errors.js'

export type SeenResult =
  | null
  | { type: 'dm'; seen: boolean }
  | { type: 'group'; count: number; total: number }

type SeenInput = {
  message: { id: string; userId: string; conversationId: string; createdAt: Date }
  viewerId: string
  viewerShowsReceipts: boolean
  conversationType: 'dm' | 'group'
  otherMembers: Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>
}

export function computeSeen(input: SeenInput): SeenResult {
  if (!input.viewerShowsReceipts) return null
  if (input.message.userId !== input.viewerId) return null
  if (input.conversationType === 'dm') {
    const peer = input.otherMembers[0]
    if (!peer || !peer.showReadReceipts) return null
    const seen = peer.lastReadAt ? peer.lastReadAt.getTime() >= input.message.createdAt.getTime() : false
    return { type: 'dm', seen }
  }
  const total = input.otherMembers.length
  let count = 0
  for (const m of input.otherMembers) {
    if (!m.showReadReceipts) continue
    if (m.lastReadAt && m.lastReadAt.getTime() >= input.message.createdAt.getTime()) count += 1
  }
  return { type: 'group', count, total }
}

export class MessagesService {
  constructor(
    private readonly repo: IMessagesRepository,
    private readonly conversationsRepo: IConversationsRepository,
    private readonly storageService: IStorageService,
    private readonly friendsRepo: IFriendsRepository,
  ) {}

  async sendMessage(
    conversationId: string,
    userId: string,
    data: { content?: string; attachmentIds?: string[]; replyToId?: string; callMetadata?: CallMetadata; isEncrypted?: boolean },
  ): Promise<MessageWithAttachments> {
    const member = await this.conversationsRepo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    if (!member.permissions.can_send_messages) throw new ChatError('FORBIDDEN')

    // DM: bloqueio em qualquer direção impede envio (lado do servidor como salvaguarda)
    const conversation = await this.conversationsRepo.findById(conversationId)
    if (conversation?.type === 'dm') {
      const allMembers = await this.conversationsRepo.findMembers(conversationId)
      const other = allMembers.find(m => m.userId !== userId)
      if (other) {
        const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, other.userId)
        if (blocked) throw new ChatError('BLOCKED')
      }
    }

    if (data.replyToId) {
      const replyTarget = await this.repo.findMessageById(data.replyToId)
      if (!replyTarget || replyTarget.conversationId !== conversationId) {
        throw new ChatError('INVALID_REPLY_TARGET')
      }
    }

    const hasAttachments = data.attachmentIds && data.attachmentIds.length > 0
    const isCall = !!data.callMetadata
    if (!data.content && !hasAttachments && !isCall) throw new ChatError('EMPTY_MESSAGE')
    if (hasAttachments && !member.permissions.can_send_files) throw new ChatError('FORBIDDEN')

    if (hasAttachments) {
      const attachments = await this.repo.findAttachmentsByUploader(userId, data.attachmentIds!)
      if (attachments.length !== data.attachmentIds!.length) throw new ChatError('ATTACHMENT_NOT_FOUND')
    }

    // Snapshot do is_temporary da conversa no momento do envio.
    const isTemporary = !!conversation?.isTemporary

    const message = await this.repo.createMessage({
      conversationId, userId,
      content: data.content,
      replyToId: data.replyToId,
      callMetadata: data.callMetadata,
      isTemporary,
      isEncrypted: data.isEncrypted ?? false,
    })

    if (hasAttachments) {
      await this.repo.linkAttachments(message.id, data.attachmentIds!)
    }

    return (await this.repo.findMessageById(message.id))!
  }

  async toggleReaction(messageId: string, userId: string, emoji: string, add: boolean): Promise<void> {
    const message = await this.repo.findMessageById(messageId)
    if (!message) throw new ChatError('NOT_FOUND')
    const member = await this.conversationsRepo.findMember(message.conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')

    // Bloqueia reação se DM com bloqueio em qualquer direção
    const conversation = await this.conversationsRepo.findById(message.conversationId)
    if (conversation?.type === 'dm') {
      const allMembers = await this.conversationsRepo.findMembers(message.conversationId)
      const other = allMembers.find(m => m.userId !== userId)
      if (other) {
        const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, other.userId)
        if (blocked) throw new ChatError('BLOCKED')
      }
    }

    if (add) await this.repo.addReaction(messageId, userId, emoji)
    else await this.repo.removeReaction(messageId, userId, emoji)
  }

  async getMessageConversationId(messageId: string): Promise<string> {
    const message = await this.repo.findMessageById(messageId)
    if (!message) throw new ChatError('NOT_FOUND')
    return message.conversationId
  }

  async uploadAttachment(
    conversationId: string,
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
    filename: string,
    sizeBytes: number,
    audioMeta?: { durationMs: number; waveformPeaks: number[] },
  ) {
    const member = await this.conversationsRepo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    if (!member.permissions.can_send_files) throw new ChatError('FORBIDDEN')

    const isImage = mimeType.startsWith('image/')
    const isAudio = mimeType.startsWith('audio/')
    const isVideo = mimeType.startsWith('video/')

    // Vídeo permite até 50MB (não é re-encodado); outros (imagem/áudio) ficam em 6MB.
    const MAX_BYTES = isVideo ? 50 * 1024 * 1024 : 6 * 1024 * 1024
    if (fileBuffer.length > MAX_BYTES) throw new ChatError('ATTACHMENT_TOO_LARGE')

    let uploadBuffer = fileBuffer
    let uploadMimeType = mimeType
    let ext = filename.split('.').pop() ?? 'bin'
    let outputFilename = filename

    if (isImage) {
      uploadBuffer = await sharp(fileBuffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      uploadMimeType = 'image/webp'
      ext = 'webp'
      outputFilename = filename.replace(/\.[^.]+$/, '.webp')
    } else if (isAudio) {
      const ALLOWED_AUDIO = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac'])
      if (!ALLOWED_AUDIO.has(mimeType)) throw new ChatError('UNSUPPORTED_AUDIO_FORMAT')
      if (!audioMeta) throw new ChatError('AUDIO_METADATA_REQUIRED')
      if (!Number.isInteger(audioMeta.durationMs) || audioMeta.durationMs <= 0 || audioMeta.durationMs > 180_000) {
        throw new ChatError('AUDIO_TOO_LONG')
      }
      if (!Array.isArray(audioMeta.waveformPeaks) || audioMeta.waveformPeaks.length !== 64) {
        throw new ChatError('INVALID_WAVEFORM')
      }
      for (const p of audioMeta.waveformPeaks) {
        if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) {
          throw new ChatError('INVALID_WAVEFORM')
        }
      }
      const extByMime: Record<string, string> = {
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/mp4': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/aac': 'aac',
      }
      ext = extByMime[mimeType]
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const stamp =
        `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
        `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
      const short = randomUUID().replace(/-/g, '').slice(0, 8)
      outputFilename = `audio-${stamp}-${short}.${ext}`
    } else if (isVideo) {
      const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
      if (!ALLOWED_VIDEO.has(mimeType)) throw new ChatError('UNSUPPORTED_VIDEO_FORMAT')
      // Sem re-encode no MVP — sobe direto.
      const extByMime: Record<string, string> = {
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov',
      }
      ext = extByMime[mimeType]
    }

    const subfolder = isAudio ? 'audio' : isVideo ? 'video' : 'attachments'
    const key = `chat/${subfolder}/${randomUUID()}.${ext}`
    const url = await this.storageService.upload(key, uploadBuffer, uploadMimeType)

    let videoThumbnailUrl: string | null = null
    let videoDurationMs: number | null = null
    if (isVideo) {
      try {
        const meta = await getVideoMetadata(fileBuffer, ext)
        videoDurationMs = meta.durationMs
        const thumbBuf = await extractThumbnail(fileBuffer, ext)
        if (thumbBuf) {
          const optimized = await sharp(thumbBuf)
            .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer()
          const thumbKey = `chat/video/${randomUUID()}.thumb.webp`
          videoThumbnailUrl = await this.storageService.upload(thumbKey, optimized, 'image/webp')
        }
      } catch {
        // Falha em extrair thumb/duração não bloqueia o upload — vídeo já está no S3
      }
    }

    return this.repo.createAttachment({
      uploadedBy: userId,
      url,
      filename: outputFilename,
      mimeType: uploadMimeType,
      sizeBytes: uploadBuffer.length,
      displayOrder: 0,
      durationMs: isAudio ? audioMeta!.durationMs : videoDurationMs,
      waveformPeaks: isAudio ? audioMeta!.waveformPeaks : null,
      thumbnailUrl: videoThumbnailUrl,
    })
  }

  async forwardMessage(
    messageId: string,
    userId: string,
    targetConversationIds: string[],
  ): Promise<MessageWithAttachments[]> {
    const original = await this.repo.findMessageById(messageId)
    if (!original) throw new ChatError('NOT_FOUND')
    if (original.deletedAt) throw new ChatError('NOT_FOUND')

    // Mensagens temporárias não podem ser encaminhadas — preserva a UX do "some sem deixar rastro"
    if (original.isTemporary) throw new ChatError('SOURCE_TEMPORARY')

    // Usuário precisa ser membro da conversa de origem
    const sourceMember = await this.conversationsRepo.findMember(original.conversationId, userId)
    if (!sourceMember) throw new ChatError('FORBIDDEN')

    if (!original.content && original.attachments.length === 0) {
      throw new ChatError('EMPTY_MESSAGE')
    }

    const results: MessageWithAttachments[] = []
    for (const targetId of targetConversationIds) {
      const member = await this.conversationsRepo.findMember(targetId, userId)
      if (!member) continue
      if (!member.permissions.can_send_messages) continue
      if (original.attachments.length > 0 && !member.permissions.can_send_files) continue

      // DM bloqueada: pula
      const conv = await this.conversationsRepo.findById(targetId)
      if (conv?.type === 'dm') {
        const allMembers = await this.conversationsRepo.findMembers(targetId)
        const other = allMembers.find(m => m.userId !== userId)
        if (other) {
          const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, other.userId)
          if (blocked) continue
        }
      }

      const newMessage = await this.repo.createMessage({
        conversationId: targetId,
        userId,
        content: original.content ?? undefined,
      })
      if (original.attachments.length > 0) {
        await this.repo.cloneAttachmentsToMessage(original.id, newMessage.id, userId)
      }
      const enriched = await this.repo.findMessageById(newMessage.id)
      if (enriched) results.push(enriched)
    }
    return results
  }

  async findMessage(messageId: string, userId: string): Promise<MessageWithAttachments> {
    const message = await this.repo.findMessageById(messageId)
    if (!message) throw new ChatError('NOT_FOUND')
    if (message.userId !== userId) throw new ChatError('FORBIDDEN')
    return message
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.repo.findMessageById(messageId)
    if (!message) throw new ChatError('NOT_FOUND')

    // Autor sempre pode deletar a própria mensagem
    if (message.userId === userId) {
      await this.repo.softDeleteMessage(messageId)
      return
    }

    // Em grupos, admin/owner podem deletar mensagens de qualquer membro
    const conversation = await this.conversationsRepo.findById(message.conversationId)
    if (conversation?.type === 'group') {
      const member = await this.conversationsRepo.findMember(message.conversationId, userId)
      if (member && (member.role === 'owner' || member.role === 'admin')) {
        await this.repo.softDeleteMessage(messageId)
        return
      }
    }

    throw new ChatError('FORBIDDEN')
  }

  async findMessageRaw(messageId: string): Promise<MessageWithAttachments | null> {
    return this.repo.findMessageById(messageId)
  }

  /**
   * Em DMs, retorna IDs de membros que devem ser excluídos de eventos socket
   * porque há bloqueio com o remetente (em qualquer direção).
   * O bloqueio é silencioso: a mensagem é salva e o remetente vê normalmente,
   * mas o destinatário não recebe via socket.
   */
  async getBlockedRecipients(conversationId: string, senderId: string): Promise<string[]> {
    const conversation = await this.conversationsRepo.findById(conversationId)
    if (conversation?.type !== 'dm') return []
    const members = await this.conversationsRepo.findMembers(conversationId)
    const blocked: string[] = []
    for (const m of members) {
      if (m.userId === senderId) continue
      const isBlocked = await this.friendsRepo.isBlockedEitherDirection(senderId, m.userId)
      if (isBlocked) blocked.push(m.userId)
    }
    return blocked
  }

  async getReactions(messageIds: string[]): Promise<Map<string, { emoji: string; userId: string }[]>> {
    return this.repo.findReactionsByMessageIds(messageIds)
  }

  async getHistory(
    conversationId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ messages: MessageWithAttachments[]; nextCursor: MessageCursor | null }> {
    const member = await this.conversationsRepo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')

    let decodedCursor: MessageCursor | undefined
    if (cursor) {
      if (cursor.length > 512) throw new ChatError('INVALID_CURSOR')
      try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
        decodedCursor = { createdAt: new Date(parsed.createdAt), id: parsed.id }
      } catch (err) {
        console.error({ err }, 'chat: invalid cursor token')
        throw new ChatError('INVALID_CURSOR')
      }
    }

    return this.repo.findMessagesByConversation({
      conversationId,
      cursor: decodedCursor,
      limit,
      afterDate: member.hiddenAt ?? undefined,
      excludeHiddenForUserId: userId,
    })
  }

  /**
   * Apaga (hard delete) uma mensagem incluindo os arquivos no storage.
   * Best-effort no S3 (idempotente, ignora falhas).
   * Retorna a `Message` que foi removida (sem attachments) ou `null` se já não existia.
   */
  async hardDeleteMessage(messageId: string): Promise<MessageWithAttachments | null> {
    const message = await this.repo.findMessageById(messageId)
    if (!message) return null
    for (const a of message.attachments) {
      const key = this.storageService.keyFromUrl(a.url)
      if (key) await this.storageService.delete(key).catch(() => {})
      if (a.thumbnailUrl) {
        const thumbKey = this.storageService.keyFromUrl(a.thumbnailUrl)
        if (thumbKey) await this.storageService.delete(thumbKey).catch(() => {})
      }
    }
    await this.repo.hardDeleteMessage(messageId)
    return message
  }

  /**
   * Apaga mensagens temporárias **recebidas** por `userId` (i.e. enviadas por outros)
   * que ele já leu (createdAt <= lastReadAt). Retorna as mensagens deletadas para
   * que o gateway possa emitir `message:deleted` para todos os membros.
   */
  /**
   * Cria a mensagem de sistema que registra "Fulano ativou/desativou o modo temporário".
   * Não é em si uma mensagem temporária — fica permanentemente no histórico como evento.
   */
  async createSystemTemporaryToggleMessage(
    conversationId: string,
    userId: string,
    enabled: boolean,
  ): Promise<MessageWithAttachments> {
    const created = await this.repo.createMessage({
      conversationId,
      userId,
      temporaryEvent: { enabled, byUserId: userId },
    })
    return (await this.repo.findMessageById(created.id))!
  }

  /**
   * Quando `userId` sai da DM, oculta para ele todas as mensagens temporárias
   * que ele "viu" (próprias + recebidas e lidas). Quando todos os membros já
   * ocultaram, hard delete (DB + S3).
   *
   * Retorna 2 listas:
   * - `hiddenOnly`: mensagens que sumiram só para `userId` → emit pra ele
   * - `hardDeleted`: mensagens removidas em definitivo → emit pra room
   */
  async cleanupReadTemporary(
    conversationId: string,
    userId: string,
    lastReadAt: Date,
    memberIds: string[],
  ): Promise<{ hiddenOnly: MessageWithAttachments[]; hardDeleted: MessageWithAttachments[] }> {
    const candidates = await this.repo.findTemporaryToHideFor(conversationId, userId, lastReadAt)
    const hiddenOnly: MessageWithAttachments[] = []
    const hardDeleted: MessageWithAttachments[] = []

    for (const m of candidates) {
      const updated = await this.repo.addHiddenForUser(m.id, userId)
      if (!updated) continue
      const hidden = new Set(updated.hiddenForUserIds)
      const allHidden = memberIds.every(uid => hidden.has(uid))
      if (allHidden) {
        const removed = await this.hardDeleteMessage(updated.id)
        if (removed) hardDeleted.push(removed)
      } else {
        hiddenOnly.push(updated)
      }
    }
    return { hiddenOnly, hardDeleted }
  }

  /**
   * Apaga em lote mensagens temporárias com `created_at < cutoff` (TTL fallback).
   * Limit é aplicado por execução para evitar long-running transactions.
   */
  async cleanupExpiredTemporary(cutoff: Date, limit = 200): Promise<MessageWithAttachments[]> {
    const messages = await this.repo.findExpiredTemporary(cutoff, limit)
    const deleted: MessageWithAttachments[] = []
    for (const m of messages) {
      const removed = await this.hardDeleteMessage(m.id)
      if (removed) deleted.push(removed)
    }
    return deleted
  }
}

