import type { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import type { ConversationsService } from './conversations.service.js'
import type { MessagesService } from './messages.service.js'
import { computeSeen, type SeenResult } from './messages.service.js'
import type { DmRequestsService } from './dm-requests.service.js'
import type { PushService } from './push.service.js'
import type { ChatGateway } from './chat.gateway.js'
import type { UsersRepository } from '../users/users.repository.js'
import type { FriendsService } from '../friends/friends.service.js'
import type { MessageWithAttachments } from '../../shared/contracts/messages.repository.contract.js'
import { ChatError } from './chat.errors.js'
import {
  createGroupSchema, updateGroupSchema, inviteMemberSchema,
  updateMemberRoleSchema, updateMemberPermissionsSchema,
  openDmSchema, sendDmRequestSchema, registerPushSchema,
  getHistoryQuerySchema, sendMessageBodySchema, forwardMessageSchema,
  setTemporarySchema,
} from './chat.schema.js'

const CHAT_STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  ALREADY_EXISTS: 409,
  ALREADY_MEMBER: 409,
  NOT_PENDING: 409,
  FRIENDS_USE_DM: 422,
  NOT_FRIENDS: 422,
  SELF_REQUEST: 422,
  EMPTY_MESSAGE: 422,
  BLOCKED: 403,
  ATTACHMENT_TOO_LARGE: 413,
  AUDIO_TOO_LONG: 400,
  AUDIO_METADATA_REQUIRED: 400,
  UNSUPPORTED_AUDIO_FORMAT: 400,
  INVALID_WAVEFORM: 400,
  NOT_DM: 422,
  SOURCE_TEMPORARY: 422,
}

function handleChatError(error: unknown, reply: FastifyReply) {
  if (error instanceof ChatError) {
    const status = CHAT_STATUS_BY_CODE[error.code] ?? 400
    reply.request.log.warn(
      { url: reply.request.url, method: reply.request.method, code: error.code, status },
      'ChatError',
    )
    return reply.status(status).send({ error: error.code })
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'INVALID_INPUT', issues: error.issues })
  }
  throw error
}

function deriveMessageType(msg: {
  attachments: Array<{ mimeType: string }>
  callMetadata?: unknown | null
  temporaryEvent?: unknown | null
}): 'text' | 'image' | 'audio' | 'video' | 'file' | 'call' | 'temporary_toggle' {
  if (msg.temporaryEvent) return 'temporary_toggle'
  if (msg.callMetadata) return 'call'
  if (msg.attachments.length === 0) return 'text'
  const first = msg.attachments[0].mimeType
  if (first.startsWith('image/')) return 'image'
  if (first.startsWith('audio/')) return 'audio'
  if (first.startsWith('video/')) return 'video'
  return 'file'
}

export class ChatController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly dmRequestsService: DmRequestsService,
    private readonly pushService: PushService,
    private readonly chatGateway: ChatGateway,
    private readonly usersRepository: UsersRepository,
    private readonly friendsService: FriendsService,
  ) {}

  private async enrichMessage(msg: MessageWithAttachments, viewerId?: string): Promise<any> {
    return (await this.enrichMessages([msg], viewerId))[0]
  }

  private async enrichMessages(msgs: MessageWithAttachments[], viewerId?: string): Promise<any[]> {
    if (msgs.length === 0) return []

    // Sender info
    const senderIds = [...new Set(msgs.map(m => m.userId))]
    const replyIds = [...new Set(msgs.map(m => m.replyToId).filter((x): x is string => !!x))]
    const messageIds = msgs.map(m => m.id)

    const senderRows = await Promise.all(senderIds.map(id => this.usersRepository.findById(id)))
    const senderMap = new Map(senderRows.filter((u): u is NonNullable<typeof u> => !!u).map(u => [u.id, u]))

    // Carregar viewer e membros das conversas pra calcular seen
    const viewer = viewerId ? await this.usersRepository.findById(viewerId) : null
    const conversationsTouched = [...new Set(msgs.map(m => m.conversationId))]
    const membersByConv = new Map<string, Array<{ userId: string; lastReadAt: Date | null; showReadReceipts: boolean }>>()
    const convTypeByConv = new Map<string, 'dm' | 'group'>()
    if (viewer && viewer.showReadReceipts) {
      for (const cid of conversationsTouched) {
        const members = await this.conversationsService.findMembersWithReceiptsFlag(cid)
        membersByConv.set(cid, members)
      }
      for (const cid of conversationsTouched) {
        const convType = await this.conversationsService.getConversationType(cid)
        if (convType) convTypeByConv.set(cid, convType)
      }
    }

    // Se viewer foi bloqueado por algum sender, esconder avatar dele nas mensagens
    const blockedBySenderIds = new Set<string>()
    if (viewerId) {
      for (const sid of senderIds) {
        if (sid === viewerId) continue
        const blocked = await this.friendsService.isBlockedBy(viewerId, sid)
        if (blocked) blockedBySenderIds.add(sid)
      }
    }

    // Replies
    const replyMap = new Map<string, any>()
    for (const rid of replyIds) {
      const replied = await this.messagesService.findMessageRaw(rid).catch(() => null)
      if (replied) {
        const replier = await this.usersRepository.findById(replied.userId)
        const replyHidden = blockedBySenderIds.has(replied.userId)
        replyMap.set(rid, {
          id: replied.id,
          senderId: replied.userId,
          senderName: replyHidden ? 'Usuário do Geek Social' : (replier?.displayName ?? 'Usuário'),
          content: replied.content ?? '',
          type: deriveMessageType(replied),
        })
      } else {
        // Original foi hard-deleted (provavelmente mensagem temporária expirada).
        // Mantém placeholder para a UI renderizar a bolha do reply.
        replyMap.set(rid, {
          id: rid,
          senderId: null,
          senderName: 'Sistema',
          content: 'Mensagem expirada',
          type: 'text',
        })
      }
    }

    // Reactions (batch query)
    const reactionsMap = await this.messagesService.getReactions(messageIds)

    return msgs.map(msg => {
      const sender = senderMap.get(msg.userId)
      const senderAvatarHidden = blockedBySenderIds.has(msg.userId)
      const rawReactions = reactionsMap.get(msg.id) ?? []
      const grouped = new Map<string, string[]>()
      for (const r of rawReactions) {
        const list = grouped.get(r.emoji) ?? []
        list.push(r.userId)
        grouped.set(r.emoji, list)
      }
      const reactions = Array.from(grouped.entries()).map(([emoji, userIds]) => ({
        emoji, count: userIds.length, userIds,
      }))

      let seen: SeenResult = null
      if (viewerId && viewer && msg.userId === viewerId) {
        const convType = convTypeByConv.get(msg.conversationId)
        const allMembers = membersByConv.get(msg.conversationId) ?? []
        if (convType) {
          const otherMembers = allMembers.filter(m => m.userId !== viewerId)
          seen = computeSeen({
            message: { id: msg.id, userId: msg.userId, conversationId: msg.conversationId, createdAt: msg.createdAt },
            viewerId,
            viewerShowsReceipts: viewer.showReadReceipts,
            conversationType: convType,
            otherMembers,
          })
        }
      }

      return {
        id: msg.id,
        conversationId: msg.conversationId,
        senderId: msg.userId,
        senderName: senderAvatarHidden ? 'Usuário do Geek Social' : (sender?.displayName ?? 'Usuário'),
        senderAvatarUrl: senderAvatarHidden ? null : (sender?.avatarUrl ?? null),
        content: msg.content ?? '',
        type: deriveMessageType(msg),
        callMetadata: msg.callMetadata ?? null,
        isTemporary: msg.isTemporary,
        temporaryEvent: msg.temporaryEvent ?? null,
        attachments: msg.attachments.map(a => ({
          id: a.id,
          url: a.url,
          type: a.mimeType?.startsWith('image/')
            ? 'image' as const
            : a.mimeType?.startsWith('audio/')
              ? 'audio' as const
              : a.mimeType?.startsWith('video/')
                ? 'video' as const
                : 'file' as const,
          name: a.filename,
          size: a.sizeBytes,
          mimeType: a.mimeType,
          durationMs: a.durationMs,
          waveformPeaks: a.waveformPeaks,
          thumbnailUrl: a.thumbnailUrl,
        })),
        replyTo: msg.replyToId ? replyMap.get(msg.replyToId) ?? null : null,
        reactions,
        seen,
        createdAt: msg.createdAt,
        editedAt: null,
        deletedAt: msg.deletedAt,
      }
    })
  }

  // DM direto entre amigos
  async openDm(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const { friendId } = openDmSchema.parse(req.body)
      const conversation = await this.conversationsService.openDirectDm(userId, friendId)
      await this.chatGateway.joinUsersToConversation(conversation.id, [userId, friendId]).catch(() => {})
      return reply.status(201).send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  // Pedidos de DM
  async sendDmRequest(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const { receiverId } = sendDmRequestSchema.parse(req.body)
      const request = await this.dmRequestsService.sendRequest(userId, receiverId)
      return reply.status(201).send(request)
    } catch (e) { return handleChatError(e, reply) }
  }

  async listDmRequests(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    const requests = await this.dmRequestsService.listReceivedPending(userId)
    return reply.send(requests)
  }

  async acceptDmRequest(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const { conversation, senderId, receiverId } = await this.dmRequestsService.acceptRequest(req.params.id, userId)
      // Coloca ambos os lados na sala socket da nova DM (real-time de mensagens)
      await this.chatGateway.joinUsersToConversation(conversation.id, [senderId, receiverId]).catch(() => {})
      return reply.status(201).send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  async rejectDmRequest(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.dmRequestsService.rejectRequest(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  // Grupos
  async createGroup(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const data = createGroupSchema.parse(req.body)
      const conversation = await this.conversationsService.createGroup(userId, data)
      return reply.status(201).send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  async getGroup(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const conversation = await this.conversationsService.getConversation(req.params.id, userId)
      return reply.send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  async updateGroup(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const data = updateGroupSchema.parse(req.body)
      const conversation = await this.conversationsService.updateGroup(req.params.id, userId, data)
      this.chatGateway.emitConversationUpdated(req.params.id, conversation)
      return reply.send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  async deleteGroup(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.deleteGroup(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async uploadGroupCover(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'FILE_REQUIRED' })
    const buffer = await file.toBuffer()
    try {
      const conversation = await this.conversationsService.uploadGroupCover(req.params.id, userId, buffer, file.mimetype)
      this.chatGateway.emitConversationUpdated(req.params.id, conversation)
      return reply.send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  // Membros
  async inviteMember(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const { userId: targetUserId } = inviteMemberSchema.parse(req.body)
      const member = await this.conversationsService.inviteMember(req.params.id, userId, targetUserId)
      this.chatGateway.emitMemberAdded(req.params.id, member)
      return reply.status(201).send(member)
    } catch (e) { return handleChatError(e, reply) }
  }

  async removeMember(req: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const callerId = (req.user as any).userId as string
    try {
      await this.conversationsService.removeMember(req.params.id, callerId, req.params.userId)
      this.chatGateway.emitMemberRemoved(req.params.id, req.params.userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async updateMemberRole(req: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const callerId = (req.user as any).userId as string
    try {
      const { role } = updateMemberRoleSchema.parse(req.body)
      await this.conversationsService.updateMemberRole(req.params.id, callerId, req.params.userId, role)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async updateMemberPermissions(req: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const callerId = (req.user as any).userId as string
    try {
      const permissions = updateMemberPermissionsSchema.parse(req.body)
      await this.conversationsService.updateMemberPermissions(req.params.id, callerId, req.params.userId, permissions)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async leaveConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.leaveConversation(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  // Mensagens
  async getHistory(req: FastifyRequest<{ Params: { id: string }; Querystring: unknown }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const { cursor, limit } = getHistoryQuerySchema.parse(req.query)
      const result = await this.messagesService.getHistory(req.params.id, userId, cursor, limit)
      const enriched = await this.enrichMessages([...result.messages].reverse(), userId)
      const nextCursorToken = result.nextCursor
        ? Buffer.from(JSON.stringify({ createdAt: result.nextCursor.createdAt, id: result.nextCursor.id })).toString('base64')
        : null
      return reply.send({
        messages: enriched,
        hasMore: result.nextCursor !== null,
        cursor: nextCursorToken,
      })
    } catch (e) { return handleChatError(e, reply) }
  }

  async deleteMessage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const message = await this.messagesService.findMessage(req.params.id, userId)
      const conversationId = message.conversationId
      await this.messagesService.deleteMessage(req.params.id, userId)
      this.chatGateway.emitMessageDeleted(conversationId, req.params.id)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async sendMessage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const body = sendMessageBodySchema.parse(req.body ?? {})
      const raw = await this.messagesService.sendMessage(req.params.id, userId, {
        content: body.content,
        attachmentIds: body.attachmentIds,
        replyToId: body.replyToId,
        callMetadata: body.callMetadata,
      })
      const enriched = await this.enrichMessage(raw)
      this.chatGateway.emitMessageNew(req.params.id, enriched)
      return reply.status(201).send(enriched)
    } catch (e) { return handleChatError(e, reply) }
  }

  async forwardMessage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const { conversationIds } = forwardMessageSchema.parse(req.body)
      const created = await this.messagesService.forwardMessage(req.params.id, userId, conversationIds)
      const enriched = await this.enrichMessages(created, userId)
      for (const msg of enriched) {
        this.chatGateway.emitMessageNew(msg.conversationId, msg)
      }
      return reply.status(201).send({ messages: enriched, forwardedCount: enriched.length })
    } catch (e) { return handleChatError(e, reply) }
  }

  async toggleReaction(req: FastifyRequest<{ Params: { id: string }; Body: { emoji: string; add: boolean } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.messagesService.toggleReaction(req.params.id, userId, req.body.emoji, req.body.add)
      const message = await this.messagesService.findMessageRaw(req.params.id)
      if (!message) throw new ChatError('NOT_FOUND')
      const enriched = await this.enrichMessage(message)
      this.chatGateway.emitMessageReaction(message.conversationId, req.params.id, enriched.reactions)
      return reply.status(200).send({ reactions: enriched.reactions })
    } catch (e) { return handleChatError(e, reply) }
  }

  async uploadAttachment(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    let fileBuffer: Buffer | null = null
    let fileMimeType = ''
    let fileFilename = ''
    let durationMs: number | undefined
    let waveformPeaks: number[] | undefined

    try {
      const parts = req.parts({ limits: { fileSize: 10 * 1024 * 1024 } })
      for await (const part of parts) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer()
          fileMimeType = part.mimetype
          fileFilename = part.filename
        } else if (part.fieldname === 'durationMs' && typeof part.value === 'string') {
          const n = parseInt(part.value, 10)
          if (Number.isFinite(n)) durationMs = n
        } else if (part.fieldname === 'waveformPeaks' && typeof part.value === 'string') {
          try {
            const parsed = JSON.parse(part.value)
            if (Array.isArray(parsed)) waveformPeaks = parsed
          } catch { /* deixa undefined */ }
        }
      }
    } catch (e: any) {
      if (e?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({ error: 'ATTACHMENT_TOO_LARGE' })
      }
      throw e
    }

    if (!fileBuffer) return reply.status(400).send({ error: 'FILE_REQUIRED' })

    const audioMeta =
      fileMimeType.startsWith('audio/') && durationMs !== undefined && waveformPeaks !== undefined
        ? { durationMs, waveformPeaks }
        : undefined

    try {
      const attachment = await this.messagesService.uploadAttachment(
        req.params.id, userId, fileBuffer, fileMimeType, fileFilename, fileBuffer.length, audioMeta,
      )
      return reply.status(201).send(attachment)
    } catch (e) { return handleChatError(e, reply) }
  }

  // Conversas
  async listConversations(req: FastifyRequest<{ Querystring: { archived?: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    const archived = req.query?.archived === 'true'
    const conversations = await this.conversationsService.listConversations(userId, archived)
    return reply.send(conversations)
  }

  async archiveConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.archiveConversation(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async unarchiveConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.unarchiveConversation(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async hideConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.hideConversation(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async getConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const conversation = await this.conversationsService.getConversation(req.params.id, userId)
      return reply.send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  async markAsRead(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    const ok = await this.conversationsService.markAsRead(req.params.id, userId).then(() => true).catch(() => false)
    if (ok) this.chatGateway.emitMessageRead(req.params.id, userId, new Date())
    return reply.status(204).send()
  }

  async muteConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.setMuted(req.params.id, userId, true)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async unmuteConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      await this.conversationsService.setMuted(req.params.id, userId, false)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async setTemporary(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const { enabled } = setTemporarySchema.parse(req.body)
      const { changed } = await this.conversationsService.toggleTemporary(req.params.id, userId, enabled)
      if (changed) {
        // Mensagem de sistema registrando a transição
        const systemMsg = await this.messagesService.createSystemTemporaryToggleMessage(req.params.id, userId, enabled)
        const enriched = await this.enrichMessage(systemMsg)
        this.chatGateway.emitMessageNew(req.params.id, enriched)
        // Atualiza a conversa para os dois lados
        const conversation = await this.conversationsService.getConversation(req.params.id, userId)
        this.chatGateway.emitConversationUpdated(req.params.id, conversation)
      }
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  // Push
  async registerPush(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).userId as string
    try {
      const data = registerPushSchema.parse(req.body)
      const subscription = await this.pushService.registerSubscription(userId, data)
      return reply.status(201).send(subscription)
    } catch (e) { return handleChatError(e, reply) }
  }

  async removePush(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    await this.pushService.removeSubscription(req.params.id)
    return reply.status(204).send()
  }
}
