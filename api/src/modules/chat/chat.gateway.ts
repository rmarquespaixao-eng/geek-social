import { Server as SocketIOServer } from 'socket.io'
import type { Server as HttpServer } from 'node:http'
import type { ConversationsService } from './conversations.service.js'
import type { MessagesService } from './messages.service.js'
import type { PresenceService } from './presence.service.js'
import type { PushService } from './push.service.js'
import type { ConversationMember } from '../../shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { UsersRepository } from '../users/users.repository.js'
import { env } from '../../config/env.js'

type JwtVerifyFn = (token: string) => { userId: string; [key: string]: unknown }

type CallSession = {
  callId: string
  initiatorId: string
  calleeId: string
  conversationId: string
  startedAt: Date
}

export class ChatGateway {
  private io: SocketIOServer
  private callSessions = new Map<string, CallSession>()
  /**
   * Conjunto de DMs que cada usuário tem abertas no momento (qualquer aba).
   * Usado pelo cron de cleanup de chat temporário pra detectar "destinatário saiu".
   */
  private activeDmByUser = new Map<string, Set<string>>()

  constructor(
    httpServer: HttpServer,
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly presenceService: PresenceService,
    private readonly pushService: PushService,
    private readonly friendsRepo: IFriendsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly jwtVerify: JwtVerifyFn,
  ) {
    this.io = new SocketIOServer(httpServer, {
      cors: { origin: env.FRONTEND_URL, credentials: true },
    })
    this.setup()
  }

  private setup(): void {
    // Middleware de autenticação JWT
    this.io.use(async (socket, next) => {
      const token = (socket.handshake.auth as Record<string, string>).token
        ?? (socket.handshake.query as Record<string, string>).token
      if (!token) return next(new Error('UNAUTHORIZED'))
      try {
        const payload = this.jwtVerify(token as string)
        socket.data.userId = payload.userId
        next()
      } catch {
        next(new Error('UNAUTHORIZED'))
      }
    })

    this.io.on('connection', async (socket) => {
      const userId = socket.data.userId as string

      // Entrar nas rooms de todas as conversas do usuário
      const convIds = await this.conversationsService.getConversationIds(userId)
      for (const convId of convIds) {
        socket.join(`conv:${convId}`)
      }
      socket.join(`user:${userId}`)

      // Presence rooms: friends + DM partners (permite ver online/offline mesmo sem amizade,
      // contanto que tenham conversa direta — útil pra fluxo de marketplace/trocas)
      const friendIds = await this.friendsRepo.findFriendIds(userId)
      const dmPartnerIds = await this.conversationsService.getDmPartnerIds(userId)
      const presenceTargetIds = new Set<string>([...friendIds, ...dmPartnerIds])
      for (const id of presenceTargetIds) {
        socket.join(`presence:${id}`)
      }

      // Marcar online
      this.presenceService.userConnected(userId, socket.id)

      // Emitir presence:update apenas se o user permite
      const me = await this.usersRepository.findById(userId)
      if (me?.showPresence) {
        this.io.to(`presence:${userId}`).emit('presence:update', {
          userId, isOnline: true, lastSeenAt: null,
        })
      }

      // Bulk inicial: presença visível (friends + DM partners) com showPresence=true
      const presenceTargetArr = Array.from(presenceTargetIds)
      const onlineTargets = this.presenceService.getOnlineUserIdsAmong(presenceTargetArr)
      const onlineUserRows = onlineTargets.length
        ? await Promise.all(onlineTargets.map(uid => this.usersRepository.findById(uid)))
        : []
      const visibleOnline = onlineUserRows
        .filter((u): u is NonNullable<typeof u> => !!u && u.showPresence)
        .map(u => ({ userId: u.id, isOnline: true }))
      socket.emit('presence:bulk', visibleOnline)

      // presence:request — pode pedir refresh
      socket.on('presence:request', async () => {
        const fids = await this.friendsRepo.findFriendIds(userId)
        const dmIds = await this.conversationsService.getDmPartnerIds(userId)
        const targetIds = Array.from(new Set([...fids, ...dmIds]))
        const onlineNow = this.presenceService.getOnlineUserIdsAmong(targetIds)
        const rows = await Promise.all(onlineNow.map(uid => this.usersRepository.findById(uid)))
        const list = rows
          .filter((u): u is NonNullable<typeof u> => !!u && u.showPresence)
          .map(u => ({ userId: u.id, isOnline: true }))
        socket.emit('presence:bulk', list)
      })

      // message:send
      socket.on('message:send', async (data: { conversationId: string; content?: string; attachmentIds?: string[] }) => {
        try {
          const message = await this.messagesService.sendMessage(data.conversationId, userId, {
            content: data.content,
            attachmentIds: data.attachmentIds,
          })
          const blocked = await this.messagesService.getBlockedRecipients(data.conversationId, userId)
          this.emitMessageNew(data.conversationId, message, blocked)

          // Push para membros offline (também não notifica bloqueadores)
          const members = await this.conversationsService.getConversationMembers(data.conversationId)
          for (const member of members) {
            if (member.userId !== userId && !blocked.includes(member.userId) && !this.presenceService.isOnline(member.userId)) {
              await this.pushService.notify(member.userId, {
                title: 'Nova mensagem',
                body: message.content ?? '📎 Anexo',
                conversationId: data.conversationId,
              }).catch(() => {})
            }
          }
        } catch (e: any) {
          socket.emit('error', { code: e.code ?? 'INTERNAL_ERROR' })
        }
      })

      // conversation:read
      socket.on('conversation:read', async (data: { conversationId: string }) => {
        await this.conversationsService.markAsRead(data.conversationId, userId).catch(() => {})
        this.emitMessageRead(data.conversationId, userId, new Date())
      })

      // typing
      socket.on('typing:start', (data: { conversationId: string }) => {
        socket.to(`conv:${data.conversationId}`).emit('typing', { conversationId: data.conversationId, userId, isTyping: true })
      })

      socket.on('typing:stop', (data: { conversationId: string }) => {
        socket.to(`conv:${data.conversationId}`).emit('typing', { conversationId: data.conversationId, userId, isTyping: false })
      })

      // ──────── Chat temporário ────────
      // Frontend marca a DM ativa ao entrar
      socket.on('chat:dm:enter', (data: { conversationId: string }) => {
        if (!data?.conversationId) return
        this.markDmActive(userId, data.conversationId)
        // Lembra no socket as DMs que ele abriu, para limpar no disconnect
        const opened: Set<string> = (socket.data.openedDms ??= new Set<string>())
        opened.add(data.conversationId)
      })

      // Frontend sinaliza saída da DM → dispara cleanup imediato de mensagens lidas
      socket.on('chat:dm:leave', async (data: { conversationId: string }) => {
        if (!data?.conversationId) return
        const opened: Set<string> | undefined = socket.data.openedDms
        opened?.delete(data.conversationId)
        const stillActive = this.markDmInactive(userId, data.conversationId)
        if (!stillActive) {
          await this.cleanupTemporaryReadFor(data.conversationId, userId).catch(() => {})
        }
      })

      // ──────── WebRTC signaling ────────
      socket.on('call:invite', async (data: { conversationId: string; callId: string }) => {
        try {
          if (!data?.callId || !data?.conversationId) return
          if (this.callSessions.has(data.callId)) return

          const conv = await this.conversationsService.getConversation(data.conversationId, userId).catch(() => null)
          if (!conv || conv.type !== 'dm') {
            socket.emit('call:failed', { callId: data.callId, code: 'NOT_FOUND' })
            return
          }
          const peer = conv.participants.find(p => p.userId !== userId)
          if (!peer) {
            socket.emit('call:failed', { callId: data.callId, code: 'NOT_FOUND' })
            return
          }
          const isBlocked = await this.friendsRepo.isBlockedEitherDirection(userId, peer.userId)
          if (isBlocked) {
            socket.emit('call:failed', { callId: data.callId, code: 'BLOCKED' })
            return
          }
          if (!this.presenceService.isOnline(peer.userId)) {
            socket.emit('call:failed', { callId: data.callId, code: 'PEER_OFFLINE' })
            return
          }

          this.callSessions.set(data.callId, {
            callId: data.callId,
            initiatorId: userId,
            calleeId: peer.userId,
            conversationId: data.conversationId,
            startedAt: new Date(),
          })

          const callerInfo = await this.usersRepository.findById(userId)
          this.io.to(`user:${peer.userId}`).emit('call:incoming', {
            callId: data.callId,
            conversationId: data.conversationId,
            fromUserId: userId,
            fromName: callerInfo?.displayName ?? 'Usuário',
            fromAvatar: callerInfo?.avatarUrl ?? null,
          })
        } catch {
          socket.emit('call:failed', { callId: data?.callId, code: 'NOT_FOUND' })
        }
      })

      socket.on('call:accept', (data: { callId: string }) => {
        const session = this.callSessions.get(data?.callId)
        if (!session) return
        if (session.calleeId !== userId) return
        this.io.to(`user:${session.initiatorId}`).emit('call:accepted', { callId: session.callId })
      })

      socket.on('call:reject', (data: { callId: string }) => {
        const session = this.callSessions.get(data?.callId)
        if (!session) return
        if (session.calleeId !== userId) return
        this.io.to(`user:${session.initiatorId}`).emit('call:rejected', { callId: session.callId })
        this.callSessions.delete(session.callId)
      })

      socket.on('call:cancel', (data: { callId: string }) => {
        const session = this.callSessions.get(data?.callId)
        if (!session) return
        if (session.initiatorId !== userId) return
        this.io.to(`user:${session.calleeId}`).emit('call:cancelled', { callId: session.callId })
        this.callSessions.delete(session.callId)
      })

      socket.on('call:end', (data: { callId: string; durationSec?: number }) => {
        const session = this.callSessions.get(data?.callId)
        if (!session) return
        if (session.initiatorId !== userId && session.calleeId !== userId) return
        const otherId = session.initiatorId === userId ? session.calleeId : session.initiatorId
        this.io.to(`user:${otherId}`).emit('call:ended', { callId: session.callId, durationSec: data.durationSec ?? 0 })
        this.callSessions.delete(session.callId)
      })

      socket.on('call:signal', (data: { callId: string; type: 'offer' | 'answer' | 'ice'; payload: unknown }) => {
        const session = this.callSessions.get(data?.callId)
        if (!session) return
        if (session.initiatorId !== userId && session.calleeId !== userId) return
        const otherId = session.initiatorId === userId ? session.calleeId : session.initiatorId
        this.io.to(`user:${otherId}`).emit('call:signal', {
          callId: session.callId,
          type: data.type,
          payload: data.payload,
        })
      })

      // Disconnect
      socket.on('disconnect', async () => {
        // Notificar peer das chamadas em andamento envolvendo este usuário
        for (const [callId, session] of this.callSessions.entries()) {
          if (session.initiatorId !== userId && session.calleeId !== userId) continue
          const otherId = session.initiatorId === userId ? session.calleeId : session.initiatorId
          if (this.presenceService.isOnline(otherId)) {
            this.io.to(`user:${otherId}`).emit('call:peer-gone', { callId })
          }
          this.callSessions.delete(callId)
        }

        // Limpa DMs ativas do socket — se for a última aba ativa do user nessa DM,
        // dispara cleanup de mensagens temporárias lidas (caso seja DM temporária).
        const opened: Set<string> | undefined = socket.data.openedDms
        if (opened) {
          for (const convId of opened) {
            const stillActive = this.markDmInactive(userId, convId)
            if (!stillActive) {
              await this.cleanupTemporaryReadFor(convId, userId).catch(() => {})
            }
          }
        }

        const isNowOffline = this.presenceService.userDisconnected(userId, socket.id)
        if (isNowOffline) {
          const lastSeenAt = await this.presenceService.persistLastSeen(userId)
          const me = await this.usersRepository.findById(userId)
          if (me?.showPresence) {
            this.io.to(`presence:${userId}`).emit('presence:update', {
              userId, isOnline: false, lastSeenAt: lastSeenAt.toISOString(),
            })
          }
        }
      })
    })
  }

  emitMessageDeleted(conversationId: string, messageId: string): void {
    this.io.to(`conv:${conversationId}`).emit('message:deleted', { messageId, conversationId })
  }

  emitMessageDeletedForUser(userId: string, conversationId: string, messageId: string): void {
    this.io.to(`user:${userId}`).emit('message:deleted', { messageId, conversationId })
  }

  emitMemberAdded(conversationId: string, member: ConversationMember): void {
    this.io.to(`conv:${conversationId}`).emit('member:added', { conversationId, member })
  }

  emitMemberRemoved(conversationId: string, userId: string): void {
    this.io.to(`conv:${conversationId}`).emit('member:removed', { conversationId, userId })
  }

  emitConversationUpdated(conversationId: string, conversation: unknown): void {
    this.io.to(`conv:${conversationId}`).emit('conversation:updated', { conversation })
  }

  emitNotification(userId: string, notification: unknown): void {
    this.io.to(`user:${userId}`).emit('notification:new', notification)
  }

  emitImportProgress(userId: string, payload: unknown): void {
    this.io.to(`user:${userId}`).emit('steam:import:progress', payload)
  }

  emitImportDone(userId: string, payload: unknown): void {
    this.io.to(`user:${userId}`).emit('steam:import:done', payload)
  }

  emitConversationsRefresh(userIds: string[]): void {
    for (const uid of userIds) {
      this.io.to(`user:${uid}`).emit('conversations:refresh')
    }
  }

  emitMessageNew(conversationId: string, message: unknown, excludeUserIds: string[] = []): void {
    if (excludeUserIds.length === 0) {
      this.io.to(`conv:${conversationId}`).emit('message:new', { message })
      return
    }
    // Bloqueio silencioso: emite para a sala, exceto para userIds bloqueadores
    const excludeRooms = excludeUserIds.map(uid => `user:${uid}`)
    this.io.to(`conv:${conversationId}`).except(excludeRooms).emit('message:new', { message })
  }

  emitMessageReaction(conversationId: string, messageId: string, reactions: unknown): void {
    this.io.to(`conv:${conversationId}`).emit('message:reaction', { conversationId, messageId, reactions })
  }

  emitMessageRead(conversationId: string, userId: string, lastReadAt: Date): void {
    this.io.to(`conv:${conversationId}`).emit('message:read', {
      conversationId,
      userId,
      lastReadAt: lastReadAt.toISOString(),
    })
  }

  emitPresenceUpdate(userId: string, isOnline: boolean, lastSeenAt: Date | null): void {
    this.io.to(`presence:${userId}`).emit('presence:update', {
      userId, isOnline, lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    })
  }

  async refreshConversationsForUserAndPeers(userId: string): Promise<void> {
    const convIds = await this.conversationsService.getConversationIds(userId)
    const userIds = new Set<string>([userId])
    for (const cid of convIds) {
      const members = await this.conversationsService.getConversationMembers(cid)
      members.forEach(m => userIds.add(m.userId))
    }
    this.emitConversationsRefresh(Array.from(userIds))
  }

  async linkFriendship(userIdA: string, userIdB: string): Promise<void> {
    const sockets = await this.io.fetchSockets()
    for (const sock of sockets) {
      const sid = sock.data.userId as string
      if (sid === userIdA) sock.join(`presence:${userIdB}`)
      if (sid === userIdB) sock.join(`presence:${userIdA}`)
    }
    const [a, b] = await Promise.all([
      this.usersRepository.findById(userIdA),
      this.usersRepository.findById(userIdB),
    ])
    if (a?.showPresence && this.presenceService.isOnline(userIdA)) {
      this.io.to(`presence:${userIdA}`).emit('presence:update', { userId: userIdA, isOnline: true, lastSeenAt: null })
    }
    if (b?.showPresence && this.presenceService.isOnline(userIdB)) {
      this.io.to(`presence:${userIdB}`).emit('presence:update', { userId: userIdB, isOnline: true, lastSeenAt: null })
    }
  }

  async unlinkFriendship(userIdA: string, userIdB: string): Promise<void> {
    const sockets = await this.io.fetchSockets()
    for (const sock of sockets) {
      const sid = sock.data.userId as string
      if (sid === userIdA) sock.leave(`presence:${userIdB}`)
      if (sid === userIdB) sock.leave(`presence:${userIdA}`)
    }
  }

  async joinUsersToConversation(conversationId: string, userIds: string[]): Promise<void> {
    const allSockets = await this.io.fetchSockets()
    for (const sock of allSockets) {
      const sockUserId = sock.data.userId as string
      if (userIds.includes(sockUserId)) {
        sock.join(`conv:${conversationId}`)
        // Inscrever em presence dos outros membros — necessário para ver online/offline
        // de quem aceita DM sem ser amigo (fluxo marketplace/trocas).
        for (const otherId of userIds) {
          if (otherId !== sockUserId) sock.join(`presence:${otherId}`)
        }
      }
    }
    // Emite estado online atual (com showPresence) para que cada lado já veja o presente
    for (const uid of userIds) {
      if (this.presenceService.isOnline(uid)) {
        const u = await this.usersRepository.findById(uid)
        if (u?.showPresence) {
          this.io.to(`presence:${uid}`).emit('presence:update', { userId: uid, isOnline: true, lastSeenAt: null })
        }
      }
    }
  }

  // ────── Chat temporário: tracking de DM ativa por usuário ──────

  private markDmActive(userId: string, conversationId: string): void {
    const set = this.activeDmByUser.get(userId) ?? new Set<string>()
    set.add(conversationId)
    this.activeDmByUser.set(userId, set)
  }

  /** Marca a DM como inativa para o socket. Retorna true se ainda há outras abas ativas no usuário. */
  private markDmInactive(userId: string, conversationId: string): boolean {
    // Conta quantos sockets do mesmo usuário ainda têm essa DM aberta
    let stillActive = 0
    for (const [, sock] of this.io.sockets.sockets) {
      if (sock.data.userId !== userId) continue
      const opened: Set<string> | undefined = sock.data.openedDms
      if (opened?.has(conversationId)) stillActive += 1
    }
    if (stillActive === 0) {
      const set = this.activeDmByUser.get(userId)
      if (set) {
        set.delete(conversationId)
        if (set.size === 0) this.activeDmByUser.delete(userId)
      }
    }
    return stillActive > 0
  }

  /** Útil para o cron de cleanup. */
  isUserActiveInDm(userId: string, conversationId: string): boolean {
    return this.activeDmByUser.get(userId)?.has(conversationId) ?? false
  }

  /**
   * Quando `userId` sai da DM, oculta as mensagens temporárias que ele viu apenas
   * para ele (per-user). Hard delete só quando todos os membros saíram.
   *
   * - `hiddenOnly` → emit `message:deleted` apenas para o socket do user
   * - `hardDeleted` → emit `message:deleted` para a room (todos os membros)
   */
  async cleanupTemporaryReadFor(conversationId: string, userId: string): Promise<void> {
    const conv = await this.conversationsService.getConversationType(conversationId)
    if (conv !== 'dm') return
    const member = await this.conversationsService.findMember(conversationId, userId)
    if (!member?.lastReadAt) return
    const allMembers = await this.conversationsService.getConversationMembers(conversationId)
    const memberIds = allMembers.map(m => m.userId)
    const { hiddenOnly, hardDeleted } = await this.messagesService.cleanupReadTemporary(
      conversationId, userId, member.lastReadAt, memberIds,
    )
    for (const msg of hiddenOnly) {
      this.io.to(`user:${userId}`).emit('message:deleted', { messageId: msg.id, conversationId })
    }
    for (const msg of hardDeleted) {
      this.emitMessageDeleted(conversationId, msg.id)
    }
  }
}
