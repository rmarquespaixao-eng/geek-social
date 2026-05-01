// src/modules/chat/composables/useChat.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as chatService from '../services/chatService'
import * as chatCrypto from '../services/chatCrypto'
import { CryptoNotReadyError, PeerHasNoKeysError } from '../services/chatCrypto'
import type {
  Conversation,
  Message,
  MessageReply,
  SendMessagePayload,
  CreateGroupPayload,
  TypingEvent,
  SocketMessageNew,
  SocketMessageDeleted,
  SocketMessageReaction,
  SocketTyping,
  SocketMemberAdded,
  SocketMemberRemoved,
  SocketMemberLeft,
  SocketConversationUpdated,
  SocketMessageRead,
} from '../types'
import { getSocket } from '@/shared/socket/socket'
import { useAuthStore } from '@/shared/auth/authStore'

export const useChat = defineStore('chat', () => {
  const authStore = useAuthStore()
  // ── State ───────────────────────────────────────────────────────────────────
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const messages = ref<Map<string, Message[]>>(new Map())
  const hasMore = ref<Map<string, boolean>>(new Map())
  const cursors = ref<Map<string, string | null>>(new Map())
  const typingUsers = ref<Record<string, Map<string, string>>>({})
  const replyingTo = ref<MessageReply | null>(null)
  const viewingArchived = ref(false)
  const archivedConversations = ref<Conversation[]>([])
  const loading = ref(false)
  const messagesLoading = ref(false)
  const error = ref<string | null>(null)

  // Plaintexts of outgoing encrypted messages, keyed by message id.
  // Why: Signal DM sessions are asymmetric — the sender cannot decrypt the
  // wire ciphertext of their own outgoing message (the receiving chain belongs
  // to the peer). Cached at send time so the local UI (immediate echo, socket
  // round-trip, replies that quote it) renders the plaintext. Lost on reload.
  const _ownPlaintexts = new Map<string, string>()

  // ── Computed ────────────────────────────────────────────────────────────────
  const activeConversation = computed(() =>
    conversations.value.find((c) => c.id === activeConversationId.value) ?? null,
  )

  const activeMessages = computed<Message[]>(() => {
    if (!activeConversationId.value) return []
    return messages.value.get(activeConversationId.value) ?? []
  })

  const activeTypingUsers = computed<TypingEvent[]>(() => {
    if (!activeConversationId.value) return []
    const map = typingUsers.value[activeConversationId.value]
    if (!map) return []
    return Array.from(map.entries()).map(([userId, displayName]) => ({
      conversationId: activeConversationId.value!,
      userId,
      displayName,
    }))
  })

  const totalUnread = computed(() =>
    conversations.value
      .filter(c => !c.isMuted)
      .reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
  )

  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? ''
      const bTime = b.lastMessage?.createdAt ?? ''
      return bTime.localeCompare(aTime)
    }),
  )

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function fetchConversations(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const data = await chatService.listConversations(false)
      conversations.value = data
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao carregar conversas'
    } finally {
      loading.value = false
    }
  }

  async function fetchArchivedConversations(silent = false): Promise<void> {
    if (!silent) loading.value = true
    try {
      archivedConversations.value = await chatService.listConversations(true)
    } finally {
      if (!silent) loading.value = false
    }
  }

  async function archiveConversation(conversationId: string): Promise<void> {
    await chatService.archiveConversation(conversationId)
    const archived = conversations.value.find(c => c.id === conversationId)
    conversations.value = conversations.value.filter(c => c.id !== conversationId)
    if (archived && !archivedConversations.value.some(c => c.id === conversationId)) {
      archivedConversations.value = [{ ...archived, isArchived: true }, ...archivedConversations.value]
    }
  }

  async function unarchiveConversation(conversationId: string): Promise<void> {
    await chatService.unarchiveConversation(conversationId)
    archivedConversations.value = archivedConversations.value.filter(c => c.id !== conversationId)
    await fetchConversations()
  }

  async function toggleMute(conversationId: string): Promise<void> {
    const conv = conversations.value.find(c => c.id === conversationId)
      ?? archivedConversations.value.find(c => c.id === conversationId)
    if (!conv) return
    const next = !(conv.isMuted ?? false)
    if (next) await chatService.muteConversation(conversationId)
    else await chatService.unmuteConversation(conversationId)
    conv.isMuted = next
  }

  async function hideConversation(conversationId: string): Promise<void> {
    await chatService.hideConversation(conversationId)
    conversations.value = conversations.value.filter(c => c.id !== conversationId)
    if (activeConversationId.value === conversationId) {
      activeConversationId.value = null
    }
  }

  async function setActiveConversation(conversationId: string): Promise<void> {
    const previous = activeConversationId.value
    activeConversationId.value = conversationId

    // Sinaliza ao backend que saímos da DM anterior (chat temporário usa isso)
    if (previous && previous !== conversationId) {
      const sock = getSocket()
      sock?.emit('chat:dm:leave', { conversationId: previous })
    }

    // Ensure conversation is in list
    if (!conversations.value.find((c) => c.id === conversationId)) {
      try {
        const conv = await chatService.getConversation(conversationId)
        conversations.value.unshift(conv)
      } catch {
        // ignore
      }
    }

    // Load messages if not already loaded
    if (!messages.value.has(conversationId)) {
      await fetchMessages(conversationId)
    }

    // Mark as read
    await markRead(conversationId)

    // Sinaliza ao backend que entramos nesta DM
    const sock = getSocket()
    sock?.emit('chat:dm:enter', { conversationId })
  }

  /** Marca a DM como inativa explicitamente (ao sair do ChatView). */
  function leaveActiveConversation(): void {
    const id = activeConversationId.value
    if (!id) return
    const sock = getSocket()
    sock?.emit('chat:dm:leave', { conversationId: id })
    activeConversationId.value = null
  }

  async function toggleTemporary(conversationId: string, enabled: boolean): Promise<void> {
    await chatService.setTemporaryMode(conversationId, enabled)
    // Estado real será atualizado via socket conversation:updated
  }

  async function fetchMessages(conversationId: string, cursor?: string | null): Promise<void> {
    messagesLoading.value = true
    try {
      const result = await chatService.listMessages(
        conversationId,
        cursor ?? undefined,
      )

      const conv = conversations.value.find(c => c.id === conversationId)
      const settled = await Promise.allSettled(
        result.messages.map(m => _decryptMessage(m, conv ?? undefined)),
      )
      const decryptedMsgs = settled.map((r, i) =>
        r.status === 'fulfilled' ? r.value : result.messages[i],
      )

      if (cursor) {
        const existing = messages.value.get(conversationId) ?? []
        messages.value = new Map(messages.value).set(conversationId, [
          ...decryptedMsgs,
          ...existing,
        ])
      } else {
        messages.value = new Map(messages.value).set(conversationId, decryptedMsgs)
      }

      hasMore.value = new Map(hasMore.value).set(conversationId, result.hasMore)
      cursors.value = new Map(cursors.value).set(conversationId, result.cursor)
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao carregar mensagens'
    } finally {
      messagesLoading.value = false
    }
  }

  async function loadMessages(conversationId: string, loadMore = false): Promise<void> {
    const cursor = loadMore ? (cursors.value.get(conversationId) ?? null) : null
    await fetchMessages(conversationId, cursor)
  }

  async function markRead(conversationId: string): Promise<void> {
    try {
      await chatService.markAsRead(conversationId)
      const conv = conversations.value.find((c) => c.id === conversationId)
      if (conv) conv.unreadCount = 0
    } catch {
      // ignore
    }
  }

  async function sendMessage(payload: SendMessagePayload): Promise<void> {
    if (!activeConversationId.value) return
    const convId = activeConversationId.value
    const myId = authStore.user?.id
    const conv = activeConversation.value

    let finalContent = payload.content
    let isEncrypted = false

    if (payload.content && myId && conv && chatCrypto.isReady()) {
      try {
        if (conv.type === 'dm') {
          const peer = conv.participants.find(p => p.userId !== myId)
          if (peer) {
            finalContent = await chatCrypto.encryptDm(peer.userId, payload.content)
            isEncrypted = true
          }
        } else if (conv.type === 'group') {
          const enc = await chatCrypto.encryptGroup(convId, payload.content, conv.senderKeyId)
          if (enc !== null) {
            finalContent = enc
            isEncrypted = true
          }
        }
      } catch (e) {
        const msg = _cryptoErrorMessage(e)
        if (msg) {
          // Refuse to silently send plaintext — surface the error so the user
          // knows the message wasn't sent.
          error.value = msg
          throw e
        }
        // Unknown error: fall through with plaintext only if conversation isn't E2E-mandated.
        // Currently there's no per-conv flag, so we still refuse.
        error.value = 'Falha ao criptografar mensagem.'
        throw e
      }
    }

    const finalPayload: SendMessagePayload = {
      ...payload,
      content: finalContent,
      isEncrypted,
      replyToId: replyingTo.value?.id ?? payload.replyToId,
    }
    try {
      const message = await chatService.sendMessage(convId, finalPayload)
      if (isEncrypted && payload.content) _ownPlaintexts.set(message.id, payload.content)
      const decrypted = await _decryptMessage(message, conv ?? undefined)
      handleNewMessage({ conversationId: convId, message: decrypted })
      replyingTo.value = null
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao enviar mensagem'
      throw e
    }
  }

  async function editMessage(conversationId: string, messageId: string, content: string): Promise<void> {
    const myId = authStore.user?.id
    const conv = conversations.value.find(c => c.id === conversationId)

    let finalContent = content
    if (myId && conv && chatCrypto.isReady()) {
      try {
        if (conv.type === 'dm') {
          const peer = conv.participants.find(p => p.userId !== myId)
          if (peer) finalContent = await chatCrypto.encryptDm(peer.userId, content)
        } else if (conv.type === 'group') {
          const enc = await chatCrypto.encryptGroup(conversationId, content, conv.senderKeyId)
          if (enc !== null) finalContent = enc
        }
      } catch (e) {
        const msg = _cryptoErrorMessage(e) ?? 'Falha ao criptografar mensagem.'
        error.value = msg
        throw e
      }
    }

    const updated = await chatService.editMessage(conversationId, messageId, finalContent)
    if (finalContent !== content) _ownPlaintexts.set(updated.id, content)
    const decrypted = await _decryptMessage(updated, conv ?? undefined)
    const list = messages.value.get(conversationId)
    if (list) {
      const idx = list.findIndex(m => m.id === messageId)
      if (idx !== -1) {
        const next = [...list]
        next[idx] = decrypted
        messages.value = new Map(messages.value).set(conversationId, next)
      }
    }
  }

  async function forwardMessage(messageId: string, targetConversationIds: string[]): Promise<void> {
    const myId = authStore.user?.id
    let sourceMessage: Message | undefined
    for (const list of messages.value.values()) {
      const found = list.find(m => m.id === messageId)
      if (found) { sourceMessage = found; break }
    }

    if (sourceMessage?.isEncrypted && myId && sourceMessage.content) {
      // Client-side decrypt + re-send to each target (already decrypted in store)
      for (const targetConvId of targetConversationIds) {
        const targetConv = conversations.value.find(c => c.id === targetConvId)
        if (!targetConv) continue
        let encContent = sourceMessage.content
        let isEncrypted = false
        try {
          if (chatCrypto.isReady()) {
            if (targetConv.type === 'dm') {
              const peer = targetConv.participants.find(p => p.userId !== myId)
              if (peer) {
                encContent = await chatCrypto.encryptDm(peer.userId, sourceMessage.content)
                isEncrypted = true
              }
            } else if (targetConv.type === 'group') {
              const enc = await chatCrypto.encryptGroup(targetConvId, sourceMessage.content, targetConv.senderKeyId)
              if (enc !== null) { encContent = enc; isEncrypted = true }
            }
          }
        } catch (e) {
          const msg = _cryptoErrorMessage(e) ?? 'Falha ao criptografar ao encaminhar.'
          error.value = msg
          throw e
        }
        const sent = await chatService.sendMessage(targetConvId, {
          content: encContent,
          isEncrypted,
        })
        if (isEncrypted && sourceMessage.content) _ownPlaintexts.set(sent.id, sourceMessage.content)
        const decrypted = await _decryptMessage(sent, targetConv)
        const existing = messages.value.get(targetConvId)
        if (existing) {
          messages.value = new Map(messages.value).set(targetConvId, [...existing, decrypted])
        }
      }
    } else {
      const result = await chatService.forwardMessage(messageId, targetConversationIds)
      for (const msg of result.messages) {
        const existing = messages.value.get(msg.conversationId)
        if (existing) {
          messages.value = new Map(messages.value).set(msg.conversationId, [...existing, msg])
        }
      }
    }
  }

  // ── Crypto helpers ─────────────────────────────────────────────────────────

  function _cryptoErrorMessage(err: unknown): string | null {
    if (err instanceof CryptoNotReadyError) {
      return 'Criptografia ainda iniciando. Aguarde alguns segundos e tente novamente.'
    }
    if (err instanceof PeerHasNoKeysError) {
      return 'Esse usuário ainda não está pronto para mensagens criptografadas. Peça para ele abrir o app.'
    }
    return null
  }

  async function _decryptMessage(msg: Message, conv?: Conversation): Promise<Message> {
    if (!msg.isEncrypted || !msg.content) return msg
    const myId = authStore.user?.id
    if (!myId) return { ...msg, decryptError: true }

    const resolvedConv = conv ?? conversations.value.find(c => c.id === msg.conversationId)

    // Own message: Signal DM sessions are asymmetric (sender can't decrypt own
    // ciphertext). Use the plaintext cached at send time. Historical own
    // messages from previous sessions miss the cache and stay encrypted.
    if (msg.senderId === myId) {
      const cached = _ownPlaintexts.get(msg.id)
      if (cached === undefined) return { ...msg, decryptError: true }
      let decryptedReplyTo = msg.replyTo
      if (msg.replyTo?.content) {
        const rc = await _decryptReplyContent(
          msg.replyTo.content, myId, resolvedConv, msg.replyTo.senderId, msg.replyTo.id,
        )
        if (rc !== null) decryptedReplyTo = { ...msg.replyTo, content: rc }
      }
      return { ...msg, content: cached, replyTo: decryptedReplyTo, decryptError: false }
    }

    try {
      let plaintext: string | null = null

      if (resolvedConv?.type === 'dm') {
        const peer = resolvedConv.participants.find(p => p.userId !== myId)
          ?? resolvedConv.participants.find(p => p.userId !== msg.senderId)
        const peerUserId = peer?.userId ?? (msg.senderId !== myId ? msg.senderId : undefined)
        if (peerUserId) plaintext = await chatCrypto.decryptDm(peerUserId, msg.content)
      } else if (resolvedConv?.type === 'group') {
        plaintext = await chatCrypto.decryptGroup(msg.senderId, msg.conversationId, msg.content)
      }

      if (plaintext === null) return { ...msg, decryptError: true }

      let decryptedReplyTo = msg.replyTo
      if (msg.replyTo?.content) {
        const rc = await _decryptReplyContent(
          msg.replyTo.content, myId, resolvedConv, msg.replyTo.senderId, msg.replyTo.id,
        )
        if (rc !== null) decryptedReplyTo = { ...msg.replyTo, content: rc }
      }

      return {
        ...msg,
        content: plaintext,
        replyTo: decryptedReplyTo,
        decryptError: false,
      }
    } catch {
      return { ...msg, decryptError: true }
    }
  }

  async function _decryptReplyContent(
    replyContent: string,
    myId: string,
    conv: Conversation | undefined,
    originalSenderId?: string,
    originalMessageId?: string,
  ): Promise<string | null> {
    if (!conv) return null
    // Reply quotes own message — Signal DM is asymmetric, fall back to cache.
    if (originalSenderId === myId && originalMessageId) {
      return _ownPlaintexts.get(originalMessageId) ?? null
    }
    try {
      if (conv.type === 'dm') {
        const peer = conv.participants.find(p => p.userId !== myId)
        if (!peer) return null
        return await chatCrypto.decryptDm(peer.userId, replyContent)
      } else if (conv.type === 'group') {
        if (!originalSenderId) return null
        return await chatCrypto.decryptGroup(originalSenderId, conv.id, replyContent)
      }
    } catch {
      return null
    }
    return null
  }

  function setReplyingTo(message: Message | null): void {
    if (!message) {
      replyingTo.value = null
      return
    }
    replyingTo.value = {
      id: message.id,
      senderId: message.senderId,
      senderName: message.senderName,
      content: message.content,
    }
  }

  async function toggleReaction(messageId: string, emoji: string, currentlyReacted: boolean): Promise<void> {
    try {
      const result = await chatService.toggleMessageReaction(messageId, emoji, !currentlyReacted)
      // Atualizar localmente
      for (const [convId, list] of messages.value.entries()) {
        const idx = list.findIndex(m => m.id === messageId)
        if (idx !== -1) {
          const updated = [...list]
          updated[idx] = { ...updated[idx], reactions: result.reactions }
          messages.value = new Map(messages.value).set(convId, updated)
          break
        }
      }
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao reagir'
    }
  }

  function handleMessageReaction(data: unknown): void {
    const payload = data as SocketMessageReaction
    const list = messages.value.get(payload.conversationId)
    if (!list) return
    const idx = list.findIndex(m => m.id === payload.messageId)
    if (idx === -1) return
    const updated = [...list]
    updated[idx] = { ...updated[idx], reactions: payload.reactions }
    messages.value = new Map(messages.value).set(payload.conversationId, updated)
  }

  function handleMessageRead(data: unknown): void {
    const payload = data as SocketMessageRead
    const conv = conversations.value.find(c => c.id === payload.conversationId)
    if (!conv) return
    const list = messages.value.get(payload.conversationId)
    if (!list) return
    const myId = authStore.user?.id
    if (!myId) return
    const readAt = new Date(payload.lastReadAt).getTime()
    const updated = list.map(m => {
      if (m.senderId !== myId) return m
      const created = new Date(m.createdAt).getTime()
      if (conv.type === 'dm') {
        if (payload.userId === myId) return m
        const seen = readAt >= created
        return { ...m, seen: { type: 'dm' as const, seen } }
      }
      if (payload.userId === myId) return m
      if (!m.seen || m.seen.type !== 'group') return m
      const wasSeenByThisUser = readAt >= created
      const next = wasSeenByThisUser ? Math.min(m.seen.count + 1, m.seen.total) : m.seen.count
      return { ...m, seen: { ...m.seen, count: next } }
    })
    messages.value = new Map(messages.value).set(payload.conversationId, updated)
  }

  async function deleteMessage(messageId: string): Promise<void> {
    if (!activeConversationId.value) return
    try {
      await chatService.deleteMessage(activeConversationId.value, messageId)
      const convId = activeConversationId.value
      const list = messages.value.get(convId) ?? []
      messages.value = new Map(messages.value).set(
        convId,
        list.filter((m) => m.id !== messageId),
      )
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : 'Erro ao excluir mensagem'
      throw e
    }
  }

  async function openDm(userId: string): Promise<string> {
    const conv = await chatService.getOrCreateDm(userId)
    if (!conversations.value.find((c) => c.id === conv.id)) {
      conversations.value.unshift(conv)
    }
    await setActiveConversation(conv.id)
    return conv.id
  }

  async function createGroup(payload: CreateGroupPayload): Promise<string> {
    const conv = await chatService.createGroup(payload)
    conversations.value.unshift(conv)

    if (chatCrypto.isReady()) {
      const myId = authStore.user?.id
      const recipients = conv.participants
        .map(p => p.userId)
        .filter(id => id !== myId)
      if (recipients.length > 0) {
        try { await chatCrypto.distributeSenderKey(conv.id, recipients, conv.senderKeyId) } catch { /* best-effort; recipients can re-fetch */ }
      }
    }

    await setActiveConversation(conv.id)
    return conv.id
  }

  async function deleteConversation(conversationId: string): Promise<void> {
    await chatService.deleteConversation(conversationId)
    conversations.value = conversations.value.filter((c) => c.id !== conversationId)
    if (activeConversationId.value === conversationId) {
      activeConversationId.value = null
    }
  }

  function emitTyping(conversationId: string): void {
    const sock = getSocket()
    if (!sock) return
    sock.emit('typing:start', { conversationId })
  }

  function emitStopTyping(conversationId: string): void {
    const sock = getSocket()
    if (!sock) return
    sock.emit('typing:stop', { conversationId })
  }

  // ── Socket event handlers ──────────────────────────────────────────────────

  async function handleNewMessage(data: unknown): Promise<void> {
    const payload = data as SocketMessageNew
    const message = payload.message
    const convId = payload.conversationId ?? message.conversationId
    if (!convId) return

    // Resolve conversation before decrypt (needed to determine DM peer or group key)
    let conv = conversations.value.find((c) => c.id === convId)
    if (!conv) {
      try {
        conv = await chatService.getConversation(convId)
        conversations.value = [conv, ...conversations.value]
      } catch {
        return
      }
    }

    // Decrypt before inserting into the cache
    const decrypted = await _decryptMessage(message, conv)

    // Só adiciona ao cache se já fetchamos essa conversa antes;
    // senão a mensagem vai vir no fetch inicial quando o usuário abrir a conversa.
    // Replace-by-id: o socket pode chegar antes do REST de sendMessage retornar
    // (race), inserindo a versão sem plaintext-cached; quando o REST chega depois,
    // queremos sobrescrever a entrada para acoplar o plaintext descriptografado.
    if (messages.value.has(convId)) {
      const existing = messages.value.get(convId)!
      const idx = existing.findIndex((m) => m.id === decrypted.id)
      let next: Message[]
      if (idx === -1) {
        next = [...existing, decrypted]
      } else {
        next = [...existing]
        next[idx] = decrypted
      }
      messages.value = new Map(messages.value).set(convId, next)
    }

    // Já descriptografamos para o preview — marcamos isEncrypted=false
    // pra que o componente exiba o conteúdo (ou o placeholder literal)
    // sem voltar a aplicar o ícone de cadeado.
    const lastContent = decrypted.decryptError
      ? '[Mensagem criptografada]'
      : (decrypted.content ?? message.content)

    conv.lastMessage = {
      id: message.id,
      content: lastContent,
      senderId: message.senderId,
      createdAt: message.createdAt,
      type: message.type,
      isEncrypted: false,
    }
    const isMine = message.senderId === authStore.user?.id
    if (!isMine && convId !== activeConversationId.value) {
      conv.unreadCount = (conv.unreadCount ?? 0) + 1
    } else if (convId === activeConversationId.value) {
      conv.unreadCount = 0
      chatService.markAsRead(convId).catch(() => {})
    }
    conversations.value = [
      conv,
      ...conversations.value.filter((c) => c.id !== convId),
    ]
  }

  function handleDeletedMessage(data: unknown): void {
    const payload = data as SocketMessageDeleted
    const list = messages.value.get(payload.conversationId) ?? []
    messages.value = new Map(messages.value).set(
      payload.conversationId,
      list.filter((m) => m.id !== payload.messageId),
    )
  }

  function handleTyping({ conversationId, userId, isTyping }: SocketTyping): void {
    const conv = conversations.value.find((c) => c.id === conversationId)
    const member = conv?.participants.find((m) => m.userId === userId)
    const displayName = member?.displayName ?? userId

    const current = typingUsers.value[conversationId] ?? new Map<string, string>()
    const updated = new Map(current)
    if (isTyping) {
      updated.set(userId, displayName)
    } else {
      updated.delete(userId)
    }
    typingUsers.value = { ...typingUsers.value, [conversationId]: updated }
  }

  function handleMemberAdded(data: unknown): void {
    const payload = data as SocketMemberAdded
    const conv = conversations.value.find((c) => c.id === payload.conversationId)
    if (conv && !conv.participants.find((p) => p.userId === payload.member.userId)) {
      conv.participants = [...conv.participants, payload.member]
    }

    if (
      conv?.type === 'group'
      && chatCrypto.isReady()
      && payload.member.userId !== authStore.user?.id
    ) {
      // Each existing member distributes their own SenderKey to the newcomer so they can
      // decrypt future messages from us. Best-effort — newcomer can also re-fetch on demand.
      void chatCrypto.distributeSenderKey(payload.conversationId, [payload.member.userId], conv.senderKeyId)
        .catch(() => { /* swallow; lazy fetch on decrypt covers the gap */ })
    }
  }

  function handleMemberRemoved(data: unknown): void {
    const payload = data as SocketMemberRemoved
    const conv = conversations.value.find((c) => c.id === payload.conversationId)
    if (!conv) return
    conv.participants = conv.participants.filter((p) => p.userId !== payload.userId)

    if (payload.userId === authStore.user?.id) {
      // I was removed — just clean local state, do not redistribute
      conversations.value = conversations.value.filter((c) => c.id !== payload.conversationId)
      return
    }

    if (conv.type === 'group' && chatCrypto.isReady()) {
      conv.senderKeyId = payload.senderKeyId
      const remainingIds = conv.participants
        .map((p) => p.userId)
        .filter((id) => id !== authStore.user?.id)
      if (remainingIds.length > 0) {
        void chatCrypto.distributeSenderKey(conv.id, remainingIds, conv.senderKeyId)
          .catch(() => {})
      }
    }
  }

  function handleMemberLeft(data: unknown): void {
    const payload = data as SocketMemberLeft
    const conv = conversations.value.find((c) => c.id === payload.conversationId)
    if (!conv) return
    conv.participants = conv.participants.filter((p) => p.userId !== payload.userId)

    if (payload.userId === authStore.user?.id) {
      // I left — just clean local state, do not redistribute
      conversations.value = conversations.value.filter((c) => c.id !== payload.conversationId)
      return
    }

    if (conv.type === 'group' && chatCrypto.isReady()) {
      conv.senderKeyId = payload.senderKeyId
      const remainingIds = conv.participants
        .map((p) => p.userId)
        .filter((id) => id !== authStore.user?.id)
      if (remainingIds.length > 0) {
        void chatCrypto.distributeSenderKey(conv.id, remainingIds, conv.senderKeyId)
          .catch(() => {})
      }
    }
  }

  function handleConversationUpdated(data: unknown): void {
    const payload = data as SocketConversationUpdated
    const idx = conversations.value.findIndex((c) => c.id === payload.conversation.id)
    if (idx !== -1) {
      conversations.value[idx] = payload.conversation
    } else {
      conversations.value.unshift(payload.conversation)
    }
  }

  // ── Init / Cleanup ─────────────────────────────────────────────────────────

  const initialized = ref(false)

  function init(): void {
    if (initialized.value) return
    const sock = getSocket()
    if (!sock) return
    initialized.value = true
    sock.on('message:new', handleNewMessage)
    sock.on('message:deleted', handleDeletedMessage)
    sock.on('message:reaction', handleMessageReaction)
    sock.on('message:read', handleMessageRead)
    sock.on('typing', handleTyping)
    sock.on('member:added', handleMemberAdded)
    sock.on('member:removed', handleMemberRemoved)
    sock.on('member:left', handleMemberLeft)
    sock.on('conversation:updated', handleConversationUpdated)
    sock.on('conversations:refresh', () => { fetchConversations() })
  }

  function cleanup(): void {
    // no-op: chat listeners persist across views (app-level)
  }

  return {
    // state
    conversations,
    archivedConversations,
    viewingArchived,
    activeConversationId,
    messages,
    hasMore,
    cursors,
    typingUsers,
    replyingTo,
    loading,
    messagesLoading,
    error,
    // computed
    activeConversation,
    activeMessages,
    activeTypingUsers,
    totalUnread,
    sortedConversations,
    // actions
    fetchConversations,
    fetchArchivedConversations,
    archiveConversation,
    unarchiveConversation,
    toggleMute,
    hideConversation,
    setActiveConversation,
    leaveActiveConversation,
    toggleTemporary,
    fetchMessages,
    loadMessages,
    markRead,
    sendMessage,
    editMessage,
    forwardMessage,
    setReplyingTo,
    toggleReaction,
    deleteMessage,
    openDm,
    createGroup,
    deleteConversation,
    emitTyping,
    emitStopTyping,
    init,
    cleanup,
    // legacy alias
    initSocketListeners: init,
  }
})
