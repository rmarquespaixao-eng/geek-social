# Frontend — Sub-projeto 5: Chat em Tempo Real

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo de chat em tempo real do GeekNet com DMs, grupos, presença online, anexos e notificações push via PWA.

**Architecture:** O módulo `src/modules/chat/` encapsula toda a lógica de chat — um Pinia store central (`useChat`) coordena estado de conversas e mensagens, enquanto um singleton de socket.io (já existente em `shared/socket`) distribui eventos em tempo real para composables especializados (`usePresence`, `useSocket`). O layout adota split-panel responsivo: lista fixa (220px) + área de mensagens fluida no desktop, navegação em tela cheia no mobile.

**Tech Stack:** Vue 3 + TypeScript, Tailwind CSS v4, Pinia, socket.io-client, vite-plugin-pwa

**Pré-requisito:** Sub-projetos 1–4 completos. Socket singleton em shared/socket disponível.

---

## Task 1: Types + ChatService

### Objetivo
Definir todos os tipos TypeScript do domínio de chat e implementar o serviço com todas as chamadas REST.

### Checklist

- [ ] Criar `src/modules/chat/types.ts` com os tipos completos do domínio

```ts
// src/modules/chat/types.ts

export type ConversationType = 'dm' | 'group'

export interface MessageAttachment {
  id: string
  url: string
  filename: string
  mimeType: string
  size: number
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  content: string
  attachments: MessageAttachment[]
  createdAt: string
  deletedAt: string | null
}

export interface ConversationMember {
  userId: string
  displayName: string
  avatarUrl: string | null
  role: 'owner' | 'admin' | 'member'
  isOnline: boolean
  permissions?: Record<string, boolean>
}

export interface DmRequest {
  id: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  status: 'pending' | 'accepted' | 'rejected'
  conversationId?: string
}

export interface Conversation {
  id: string
  type: ConversationType
  name: string
  coverUrl: string | null
  lastMessage: Message | null
  unreadCount: number
  members: ConversationMember[]
  dmRequest?: DmRequest | null
}

export interface PaginatedMessages {
  messages: Message[]
  nextCursor: string | null
}

export interface CreateGroupPayload {
  name: string
  description?: string
}

export interface RegisterPushPayload {
  endpoint: string
  p256dh: string
  auth: string
}

export interface SocketMessageNew {
  conversationId: string
  message: Message
}

export interface SocketMessageDeleted {
  conversationId: string
  messageId: string
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
}

export interface SocketConversationUpdated {
  conversation: Conversation
}
```

- [ ] Criar `src/modules/chat/services/chatService.ts` com todas as funções REST

```ts
// src/modules/chat/services/chatService.ts
import axios from '@/shared/http/axios'
import type {
  Conversation,
  PaginatedMessages,
  DmRequest,
  CreateGroupPayload,
  RegisterPushPayload,
} from '../types'

// ── Conversas ──────────────────────────────────────────────────────────────

export async function listConversations(): Promise<Conversation[]> {
  const { data } = await axios.get<Conversation[]>('/chat/conversations')
  return data
}

export async function getMessages(
  conversationId: string,
  cursor?: string,
  limit = 30,
): Promise<PaginatedMessages> {
  const params: Record<string, string | number> = { limit }
  if (cursor) params.cursor = cursor
  const { data } = await axios.get<PaginatedMessages>(
    `/chat/conversations/${conversationId}/messages`,
    { params },
  )
  return data
}

export async function deleteMessage(messageId: string): Promise<void> {
  await axios.delete(`/chat/messages/${messageId}`)
}

export async function uploadAttachment(
  conversationId: string,
  file: File,
): Promise<{ id: string; url: string }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await axios.post(
    `/chat/conversations/${conversationId}/attachments`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

// ── DMs ───────────────────────────────────────────────────────────────────

export async function openDm(friendUserId: string): Promise<Conversation> {
  const { data } = await axios.post<Conversation>('/chat/dm', { friendUserId })
  return data
}

export async function sendDmRequest(targetUserId: string): Promise<DmRequest> {
  const { data } = await axios.post<DmRequest>('/chat/dm-requests', { targetUserId })
  return data
}

export async function listDmRequests(): Promise<DmRequest[]> {
  const { data } = await axios.get<DmRequest[]>('/chat/dm-requests')
  return data
}

export async function acceptDmRequest(requestId: string): Promise<Conversation> {
  const { data } = await axios.post<Conversation>(`/chat/dm-requests/${requestId}/accept`)
  return data
}

export async function rejectDmRequest(requestId: string): Promise<void> {
  await axios.post(`/chat/dm-requests/${requestId}/reject`)
}

// ── Grupos ────────────────────────────────────────────────────────────────

export async function createGroup(payload: CreateGroupPayload): Promise<Conversation> {
  const { data } = await axios.post<Conversation>('/chat/groups', payload)
  return data
}

export async function getGroup(groupId: string): Promise<Conversation> {
  const { data } = await axios.get<Conversation>(`/chat/groups/${groupId}`)
  return data
}

export async function updateGroup(
  groupId: string,
  payload: { name?: string; description?: string },
): Promise<Conversation> {
  const { data } = await axios.patch<Conversation>(`/chat/groups/${groupId}`, payload)
  return data
}

export async function deleteGroup(groupId: string): Promise<void> {
  await axios.delete(`/chat/groups/${groupId}`)
}

export async function uploadGroupCover(groupId: string, file: File): Promise<{ coverUrl: string }> {
  const form = new FormData()
  form.append('cover', file)
  const { data } = await axios.post(`/chat/groups/${groupId}/cover`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function inviteMember(groupId: string, userId: string): Promise<void> {
  await axios.post(`/chat/groups/${groupId}/members`, { userId })
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await axios.delete(`/chat/groups/${groupId}/members/${userId}`)
}

export async function updateMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  await axios.patch(`/chat/groups/${groupId}/members/${userId}/role`, { role })
}

export async function updateMemberPermissions(
  groupId: string,
  userId: string,
  permissions: Record<string, boolean>,
): Promise<void> {
  await axios.patch(`/chat/groups/${groupId}/members/${userId}/permissions`, { permissions })
}

export async function leaveGroup(groupId: string): Promise<void> {
  await axios.post(`/chat/groups/${groupId}/leave`)
}

// ── Push Notifications ────────────────────────────────────────────────────

export async function registerPush(payload: RegisterPushPayload): Promise<{ id: string }> {
  const { data } = await axios.post('/chat/push-subscriptions', payload)
  return data
}

export async function removePush(subscriptionId: string): Promise<void> {
  await axios.delete(`/chat/push-subscriptions/${subscriptionId}`)
}
```

- [ ] Commit: `feat(chat): add domain types and chatService REST functions`

---

## Task 2: useSocket composable + shared/socket singleton

### Objetivo
Garantir que o singleton de socket.io esteja corretamente configurado e expor um composable que registra/limpa handlers de forma segura com o ciclo de vida Vue.

### Checklist

- [ ] Verificar/atualizar `src/shared/socket/socket.ts` para garantir a estrutura correta

```ts
// src/shared/socket/socket.ts
import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket

  socket = io(import.meta.env.VITE_API_URL as string, {
    auth: { token },
    autoConnect: false,
    transports: ['websocket'],
  })

  socket.connect()
  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function getSocket(): Socket | null {
  return socket
}
```

- [ ] Criar `src/modules/chat/composables/useSocket.ts`

```ts
// src/modules/chat/composables/useSocket.ts
import { onUnmounted } from 'vue'
import { getSocket } from '@/shared/socket/socket'
import type { Socket } from 'socket.io-client'

type EventHandler = (...args: unknown[]) => void

export function useSocket() {
  const handlers: Array<{ event: string; handler: EventHandler }> = []

  function on(event: string, handler: EventHandler): void {
    const sock = getSocket()
    if (!sock) return
    sock.on(event, handler)
    handlers.push({ event, handler })
  }

  function off(event: string, handler: EventHandler): void {
    const sock = getSocket()
    if (!sock) return
    sock.off(event, handler)
  }

  function emit(event: string, data?: unknown): void {
    const sock = getSocket()
    if (!sock) return
    sock.emit(event, data)
  }

  function getSocketInstance(): Socket | null {
    return getSocket()
  }

  onUnmounted(() => {
    const sock = getSocket()
    if (!sock) return
    for (const { event, handler } of handlers) {
      sock.off(event, handler)
    }
    handlers.length = 0
  })

  return { on, off, emit, getSocketInstance }
}
```

- [ ] Em `src/shared/auth/useAuth.ts`, integrar connect/disconnect do socket

```ts
// Adicionar dentro do useAuth (após login bem-sucedido):
import { connectSocket, disconnectSocket } from '@/shared/socket/socket'
import { requestPushPermission } from '@/shared/pwa/usePush'

// Dentro da função de login, após obter o token:
connectSocket(token)
await requestPushPermission()

// Dentro da função de logout:
disconnectSocket()
```

- [ ] Commit: `feat(chat): configure socket singleton and useSocket composable`

---

## Task 3: usePresence

### Objetivo
Manter um mapa reativo de presença (userId → isOnline) atualizado via Socket.io.

### Checklist

- [ ] Criar `src/modules/chat/composables/usePresence.ts`

```ts
// src/modules/chat/composables/usePresence.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getSocket } from '@/shared/socket/socket'
import type { SocketPresenceUpdate } from '../types'

export const usePresence = defineStore('presence', () => {
  const onlineMap = ref<Map<string, boolean>>(new Map())
  let registered = false

  function init(): void {
    if (registered) return
    const sock = getSocket()
    if (!sock) return
    registered = true

    sock.on('presence:update', ({ userId, isOnline }: SocketPresenceUpdate) => {
      onlineMap.value = new Map(onlineMap.value).set(userId, isOnline)
    })
  }

  function isOnline(userId: string): boolean {
    return onlineMap.value.get(userId) ?? false
  }

  function cleanup(): void {
    const sock = getSocket()
    if (sock) {
      sock.off('presence:update')
    }
    onlineMap.value = new Map()
    registered = false
  }

  return { onlineMap, init, isOnline, cleanup }
})
```

- [ ] Commit: `feat(chat): add usePresence store for realtime online status`

---

## Task 4: useChat Pinia store

### Objetivo
Store central que gerencia estado de conversas, mensagens, cursores de paginação e indicadores de digitação, além de registrar todos os handlers de eventos socket.

### Checklist

- [ ] Criar `src/modules/chat/composables/useChat.ts`

```ts
// src/modules/chat/composables/useChat.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSocket } from '@/shared/socket/socket'
import * as chatService from '../services/chatService'
import type {
  Conversation,
  Message,
  SocketMessageNew,
  SocketMessageDeleted,
  SocketTyping,
  SocketMemberAdded,
  SocketMemberRemoved,
  SocketConversationUpdated,
} from '../types'

export const useChat = defineStore('chat', () => {
  // ── State ──────────────────────────────────────────────────────────────
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const messages = ref<Record<string, Message[]>>({})
  const cursors = ref<Record<string, string | null>>({})
  const typingUsers = ref<Record<string, Set<string>>>({})
  const loading = ref(false)
  const messagesLoading = ref<Record<string, boolean>>({})

  // ── Computed ───────────────────────────────────────────────────────────
  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? ''
      const bTime = b.lastMessage?.createdAt ?? ''
      return bTime.localeCompare(aTime)
    }),
  )

  const activeConversation = computed(() =>
    conversations.value.find((c) => c.id === activeConversationId.value) ?? null,
  )

  const activeMessages = computed(() =>
    activeConversationId.value ? (messages.value[activeConversationId.value] ?? []) : [],
  )

  // ── Actions ────────────────────────────────────────────────────────────
  async function fetchConversations(): Promise<void> {
    loading.value = true
    try {
      conversations.value = await chatService.listConversations()
    } finally {
      loading.value = false
    }
  }

  function setActiveConversation(id: string | null): void {
    activeConversationId.value = id
    if (id && !messages.value[id]) {
      fetchMessages(id)
    }
  }

  async function fetchMessages(convId: string, cursor?: string): Promise<void> {
    if (messagesLoading.value[convId]) return
    const existingCursor = cursors.value[convId]
    if (cursor !== undefined && existingCursor === null) return // no more pages

    messagesLoading.value[convId] = true
    try {
      const result = await chatService.getMessages(convId, cursor)
      cursors.value[convId] = result.nextCursor

      if (!messages.value[convId]) {
        messages.value[convId] = []
      }

      if (cursor) {
        // Prepend older messages (infinite scroll inverso)
        messages.value = {
          ...messages.value,
          [convId]: [...result.messages, ...messages.value[convId]],
        }
      } else {
        // Initial load — newest messages
        messages.value = {
          ...messages.value,
          [convId]: result.messages,
        }
      }
    } finally {
      messagesLoading.value[convId] = false
    }
  }

  function sendMessage(convId: string, content: string, attachmentIds?: string[]): void {
    const sock = getSocket()
    if (!sock) return
    sock.emit('message:send', {
      conversationId: convId,
      content,
      ...(attachmentIds?.length ? { attachmentIds } : {}),
    })
  }

  function handleNewMessage({ conversationId, message }: SocketMessageNew): void {
    // Append message to conversation
    if (!messages.value[conversationId]) {
      messages.value[conversationId] = []
    }
    messages.value = {
      ...messages.value,
      [conversationId]: [...messages.value[conversationId], message],
    }

    // Update lastMessage in conversation list
    const convIndex = conversations.value.findIndex((c) => c.id === conversationId)
    if (convIndex !== -1) {
      const updated = { ...conversations.value[convIndex], lastMessage: message }
      if (conversationId !== activeConversationId.value) {
        updated.unreadCount = (updated.unreadCount ?? 0) + 1
      }
      conversations.value = [
        ...conversations.value.slice(0, convIndex),
        updated,
        ...conversations.value.slice(convIndex + 1),
      ]
    }
  }

  function handleDeletedMessage({ conversationId, messageId }: SocketMessageDeleted): void {
    if (!messages.value[conversationId]) return
    messages.value = {
      ...messages.value,
      [conversationId]: messages.value[conversationId].map((m) =>
        m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m,
      ),
    }
  }

  function handleTyping({ conversationId, userId, isTyping }: SocketTyping): void {
    const current = typingUsers.value[conversationId] ?? new Set<string>()
    const updated = new Set(current)
    if (isTyping) {
      updated.add(userId)
    } else {
      updated.delete(userId)
    }
    typingUsers.value = { ...typingUsers.value, [conversationId]: updated }
  }

  function markRead(convId: string): void {
    const sock = getSocket()
    if (!sock) return
    sock.emit('conversation:read', { conversationId: convId })

    // Zero unread count locally
    const convIndex = conversations.value.findIndex((c) => c.id === convId)
    if (convIndex !== -1 && conversations.value[convIndex].unreadCount > 0) {
      const updated = { ...conversations.value[convIndex], unreadCount: 0 }
      conversations.value = [
        ...conversations.value.slice(0, convIndex),
        updated,
        ...conversations.value.slice(convIndex + 1),
      ]
    }
  }

  function handleMemberAdded({ conversationId, member }: SocketMemberAdded): void {
    const convIndex = conversations.value.findIndex((c) => c.id === conversationId)
    if (convIndex === -1) return
    const conv = conversations.value[convIndex]
    if (conv.members.some((m) => m.userId === member.userId)) return
    const updated = { ...conv, members: [...conv.members, member] }
    conversations.value = [
      ...conversations.value.slice(0, convIndex),
      updated,
      ...conversations.value.slice(convIndex + 1),
    ]
  }

  function handleMemberRemoved({ conversationId, userId }: SocketMemberRemoved): void {
    const convIndex = conversations.value.findIndex((c) => c.id === conversationId)
    if (convIndex === -1) return
    const conv = conversations.value[convIndex]
    const updated = {
      ...conv,
      members: conv.members.filter((m) => m.userId !== userId),
    }
    conversations.value = [
      ...conversations.value.slice(0, convIndex),
      updated,
      ...conversations.value.slice(convIndex + 1),
    ]
  }

  function handleConversationUpdated({ conversation }: SocketConversationUpdated): void {
    const convIndex = conversations.value.findIndex((c) => c.id === conversation.id)
    if (convIndex === -1) {
      conversations.value = [...conversations.value, conversation]
    } else {
      conversations.value = [
        ...conversations.value.slice(0, convIndex),
        conversation,
        ...conversations.value.slice(convIndex + 1),
      ]
    }
  }

  // ── Socket Init ────────────────────────────────────────────────────────
  function init(): void {
    const sock = getSocket()
    if (!sock) return

    sock.on('message:new', handleNewMessage)
    sock.on('message:deleted', handleDeletedMessage)
    sock.on('typing', handleTyping)
    sock.on('member:added', handleMemberAdded)
    sock.on('member:removed', handleMemberRemoved)
    sock.on('conversation:updated', handleConversationUpdated)
  }

  function cleanup(): void {
    const sock = getSocket()
    if (!sock) return
    sock.off('message:new', handleNewMessage)
    sock.off('message:deleted', handleDeletedMessage)
    sock.off('typing', handleTyping)
    sock.off('member:added', handleMemberAdded)
    sock.off('member:removed', handleMemberRemoved)
    sock.off('conversation:updated', handleConversationUpdated)
  }

  return {
    // State
    conversations,
    activeConversationId,
    messages,
    cursors,
    typingUsers,
    loading,
    messagesLoading,
    // Computed
    sortedConversations,
    activeConversation,
    activeMessages,
    // Actions
    fetchConversations,
    setActiveConversation,
    fetchMessages,
    sendMessage,
    handleNewMessage,
    handleDeletedMessage,
    handleTyping,
    markRead,
    init,
    cleanup,
  }
})
```

- [ ] Commit: `feat(chat): add useChat Pinia store with socket event handlers`

---

## Task 5: ConversationItem + ConversationList

### Objetivo
Implementar os componentes da barra lateral esquerda com lista de conversas, busca e indicador de presença.

### Checklist

- [ ] Criar `src/modules/chat/components/ConversationItem.vue`

```vue
<!-- src/modules/chat/components/ConversationItem.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { usePresence } from '../composables/usePresence'
import type { Conversation } from '../types'

const props = defineProps<{
  conversation: Conversation
  isActive: boolean
  currentUserId: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const presence = usePresence()

const dmPeer = computed(() => {
  if (props.conversation.type !== 'dm') return null
  return props.conversation.members.find((m) => m.userId !== props.currentUserId) ?? null
})

const isOnline = computed(() => {
  if (dmPeer.value) return presence.isOnline(dmPeer.value.userId)
  return false
})

const displayName = computed(() => {
  if (props.conversation.type === 'dm' && dmPeer.value) {
    return dmPeer.value.displayName
  }
  return props.conversation.name
})

const avatarUrl = computed(() => {
  if (props.conversation.type === 'dm' && dmPeer.value) {
    return dmPeer.value.avatarUrl
  }
  return props.conversation.coverUrl
})

const lastMessageText = computed(() => {
  const msg = props.conversation.lastMessage
  if (!msg) return 'Sem mensagens ainda'
  if (msg.deletedAt) return 'Mensagem apagada'
  const text = msg.content || (msg.attachments.length ? '📎 Anexo' : '')
  return text.length > 40 ? text.slice(0, 40) + '…' : text
})

const lastMessageTime = computed(() => {
  const msg = props.conversation.lastMessage
  if (!msg) return ''
  const date = new Date(msg.createdAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return date.toLocaleDateString('pt-BR', { weekday: 'short' })
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
})

const groupInitial = computed(() => displayName.value.charAt(0).toUpperCase())
</script>

<template>
  <button
    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150"
    :class="[
      isActive
        ? 'bg-[#252640]'
        : 'hover:bg-[#1e2038]',
    ]"
    @click="emit('select', conversation.id)"
  >
    <!-- Avatar / Ícone -->
    <div class="relative flex-shrink-0">
      <!-- DM Avatar -->
      <template v-if="conversation.type === 'dm'">
        <div class="w-10 h-10 rounded-full overflow-hidden bg-[#252640]">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="displayName"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-sm font-semibold text-[#e2e8f0]"
          >
            {{ groupInitial }}
          </div>
        </div>
        <!-- Dot de presença -->
        <span
          class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#1a1b2e]"
          :class="isOnline ? 'bg-[#22c55e]' : 'bg-[#475569]'"
        />
      </template>

      <!-- Grupo Ícone -->
      <template v-else>
        <div class="w-10 h-10 rounded-lg overflow-hidden">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="displayName"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-sm font-semibold text-white"
            style="background: linear-gradient(135deg, #f59e0b, #d97706)"
          >
            {{ groupInitial }}
          </div>
        </div>
      </template>
    </div>

    <!-- Texto -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between gap-1">
        <span class="text-sm font-medium text-[#e2e8f0] truncate">{{ displayName }}</span>
        <span class="text-[10px] text-[#94a3b8] flex-shrink-0">{{ lastMessageTime }}</span>
      </div>
      <div class="flex items-center justify-between gap-1 mt-0.5">
        <span class="text-xs text-[#94a3b8] truncate">{{ lastMessageText }}</span>
        <span
          v-if="conversation.unreadCount > 0"
          class="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#f59e0b] text-black text-[10px] font-bold flex items-center justify-center"
        >
          {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
        </span>
      </div>
    </div>
  </button>
</template>
```

- [ ] Criar `src/modules/chat/components/ConversationList.vue`

```vue
<!-- src/modules/chat/components/ConversationList.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Plus, MessageCircle, Users } from 'lucide-vue-next'
import { useChat } from '../composables/useChat'
import ConversationItem from './ConversationItem.vue'

const props = defineProps<{
  currentUserId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  openCreateGroup: []
  openDmFriend: []
}>()

const chat = useChat()
const searchQuery = ref('')
const menuOpen = ref(false)

const filteredConversations = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return chat.sortedConversations
  return chat.sortedConversations.filter((c) =>
    c.name.toLowerCase().includes(q) ||
    c.members.some((m) => m.displayName.toLowerCase().includes(q)),
  )
})

function handleSelect(id: string) {
  emit('select', id)
  menuOpen.value = false
}

function openDm() {
  menuOpen.value = false
  emit('openDmFriend')
}

function openGroup() {
  menuOpen.value = false
  emit('openCreateGroup')
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#1a1b2e] border-r border-[#252640]">
    <!-- Header -->
    <div class="px-3 py-4 border-b border-[#252640]">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-[#e2e8f0]">Mensagens</h2>
        <div class="relative">
          <button
            class="w-7 h-7 flex items-center justify-center rounded-md text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#252640] transition-colors"
            @click="menuOpen = !menuOpen"
          >
            <Plus :size="16" />
          </button>
          <!-- Dropdown menu -->
          <div
            v-if="menuOpen"
            class="absolute right-0 top-8 z-20 w-44 rounded-lg bg-[#252640] shadow-xl border border-[#1e2038] py-1"
          >
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#e2e8f0] hover:bg-[#1e2038] transition-colors"
              @click="openDm"
            >
              <MessageCircle :size="14" />
              DM com amigo
            </button>
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#e2e8f0] hover:bg-[#1e2038] transition-colors"
              @click="openGroup"
            >
              <Users :size="14" />
              Criar grupo
            </button>
          </div>
        </div>
      </div>

      <!-- Busca -->
      <div class="relative">
        <Search :size="13" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#475569]" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Buscar conversa..."
          class="w-full bg-[#0f0f1a] text-[#e2e8f0] text-xs placeholder-[#475569] rounded-md pl-7 pr-3 py-2 outline-none focus:ring-1 focus:ring-[#f59e0b]"
        />
      </div>
    </div>

    <!-- Lista -->
    <div class="flex-1 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-[#252640]">
      <div
        v-if="chat.loading"
        class="flex items-center justify-center h-24 text-[#94a3b8] text-sm"
      >
        Carregando...
      </div>
      <div
        v-else-if="filteredConversations.length === 0"
        class="flex flex-col items-center justify-center h-24 text-[#94a3b8] text-xs gap-1"
      >
        <MessageCircle :size="20" class="opacity-40" />
        <span>Nenhuma conversa</span>
      </div>
      <template v-else>
        <ConversationItem
          v-for="conv in filteredConversations"
          :key="conv.id"
          :conversation="conv"
          :is-active="conv.id === chat.activeConversationId"
          :current-user-id="currentUserId"
          @select="handleSelect"
        />
      </template>
    </div>
  </div>
</template>
```

- [ ] Commit: `feat(chat): add ConversationItem and ConversationList components`

---

## Task 6: MessageBubble + TypingIndicator

### Objetivo
Implementar as bolhas de mensagem individuais com menu de ações e o indicador de digitação animado.

### Checklist

- [ ] Criar `src/modules/chat/components/MessageBubble.vue`

```vue
<!-- src/modules/chat/components/MessageBubble.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { MoreHorizontal, Trash2, Download } from 'lucide-vue-next'
import * as chatService from '../services/chatService'
import type { Message } from '../types'

const props = defineProps<{
  message: Message
  isMine: boolean
}>()

const menuOpen = ref(false)

const formattedTime = computed(() => {
  const date = new Date(props.message.createdAt)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
})

const isDeleted = computed(() => !!props.message.deletedAt)

async function deleteMessage() {
  menuOpen.value = false
  await chatService.deleteMessage(props.message.id)
}

function isImage(mimeType: string) {
  return mimeType.startsWith('image/')
}
</script>

<template>
  <div
    class="flex items-end gap-2 px-4 py-1"
    :class="isMine ? 'flex-row-reverse' : 'flex-row'"
  >
    <!-- Avatar (apenas para mensagens de outros) -->
    <div v-if="!isMine" class="flex-shrink-0 w-7 h-7 mb-1">
      <div class="w-7 h-7 rounded-full overflow-hidden bg-[#252640]">
        <img
          v-if="message.senderAvatarUrl"
          :src="message.senderAvatarUrl"
          :alt="message.senderName"
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-[10px] font-semibold text-[#e2e8f0]"
        >
          {{ message.senderName.charAt(0).toUpperCase() }}
        </div>
      </div>
    </div>

    <!-- Conteúdo da bolha -->
    <div class="max-w-[70%] group relative" :class="isMine ? 'items-end' : 'items-start'">
      <!-- Nome do remetente (apenas para outros em grupos) -->
      <p
        v-if="!isMine"
        class="text-[10px] text-[#94a3b8] mb-1 ml-1"
      >
        {{ message.senderName }}
      </p>

      <div class="flex items-end gap-1" :class="isMine ? 'flex-row-reverse' : 'flex-row'">
        <!-- Bolha -->
        <div
          class="rounded-2xl px-3 py-2 relative"
          :class="[
            isMine
              ? 'bg-[#f59e0b] text-black rounded-br-sm'
              : 'bg-[#252640] text-[#e2e8f0] rounded-bl-sm',
          ]"
        >
          <!-- Mensagem deletada -->
          <p
            v-if="isDeleted"
            class="text-sm italic opacity-50"
          >
            Mensagem apagada
          </p>

          <!-- Texto normal -->
          <p
            v-else
            class="text-sm whitespace-pre-wrap break-words leading-relaxed"
          >
            {{ message.content }}
          </p>

          <!-- Anexos -->
          <div
            v-if="!isDeleted && message.attachments.length > 0"
            class="mt-2 flex flex-col gap-1.5"
          >
            <template v-for="attachment in message.attachments" :key="attachment.id">
              <!-- Imagem inline -->
              <img
                v-if="isImage(attachment.mimeType)"
                :src="attachment.url"
                :alt="attachment.filename"
                class="max-w-[240px] rounded-lg object-cover cursor-pointer"
                @click="window.open(attachment.url, '_blank')"
              />
              <!-- Arquivo genérico -->
              <a
                v-else
                :href="attachment.url"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-2 bg-black/10 rounded-lg px-2 py-1.5 text-xs hover:bg-black/20 transition-colors"
                :class="isMine ? 'text-black' : 'text-[#e2e8f0]'"
              >
                <Download :size="12" />
                <span class="truncate max-w-[180px]">{{ attachment.filename }}</span>
              </a>
            </template>
          </div>
        </div>

        <!-- Menu de ações (apenas para mensagens próprias não deletadas) -->
        <div
          v-if="isMine && !isDeleted"
          class="opacity-0 group-hover:opacity-100 transition-opacity relative"
        >
          <button
            class="w-6 h-6 flex items-center justify-center rounded-full text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#252640]"
            @click="menuOpen = !menuOpen"
          >
            <MoreHorizontal :size="14" />
          </button>
          <div
            v-if="menuOpen"
            class="absolute right-0 bottom-7 z-10 w-32 rounded-lg bg-[#252640] shadow-xl border border-[#1e2038] py-1"
          >
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#ef4444] hover:bg-[#1e2038] transition-colors"
              @click="deleteMessage"
            >
              <Trash2 :size="12" />
              Apagar
            </button>
          </div>
        </div>
      </div>

      <!-- Timestamp -->
      <p
        class="text-[10px] text-[#475569] mt-0.5 px-1"
        :class="isMine ? 'text-right' : 'text-left'"
      >
        {{ formattedTime }}
      </p>
    </div>
  </div>
</template>
```

- [ ] Criar `src/modules/chat/components/TypingIndicator.vue`

```vue
<!-- src/modules/chat/components/TypingIndicator.vue -->
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  users: string[]
}>()

const label = computed(() => {
  if (props.users.length === 0) return ''
  if (props.users.length === 1) return `${props.users[0]} está digitando`
  if (props.users.length === 2) return `${props.users[0]} e ${props.users[1]} estão digitando`
  return `${props.users[0]} e outros estão digitando`
})
</script>

<template>
  <div
    v-if="users.length > 0"
    class="flex items-center gap-2 px-4 py-2"
  >
    <!-- Avatar placeholder (menor) -->
    <div class="flex-shrink-0 w-6 h-6 rounded-full bg-[#252640] overflow-hidden" />

    <div class="flex items-center gap-2">
      <!-- Três dots animados -->
      <div class="flex items-center gap-1 bg-[#252640] rounded-full px-3 py-2">
        <span
          class="w-1.5 h-1.5 rounded-full bg-[#94a3b8] animate-bounce"
          style="animation-delay: 0ms"
        />
        <span
          class="w-1.5 h-1.5 rounded-full bg-[#94a3b8] animate-bounce"
          style="animation-delay: 150ms"
        />
        <span
          class="w-1.5 h-1.5 rounded-full bg-[#94a3b8] animate-bounce"
          style="animation-delay: 300ms"
        />
      </div>
      <span class="text-xs text-[#94a3b8] italic">{{ label }}</span>
    </div>
  </div>
</template>
```

- [ ] Commit: `feat(chat): add MessageBubble and TypingIndicator components`

---

## Task 7: MessageArea

### Objetivo
Implementar o painel principal de mensagens com scroll inverso, input de texto com envio de anexo, indicador de digitação com debounce e auto-scroll.

### Checklist

- [ ] Criar `src/modules/chat/components/AttachmentPreview.vue`

```vue
<!-- src/modules/chat/components/AttachmentPreview.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { X, FileText } from 'lucide-vue-next'

const props = defineProps<{
  file: File
}>()

const emit = defineEmits<{
  remove: []
}>()

const previewUrl = computed(() => {
  if (props.file.type.startsWith('image/')) {
    return URL.createObjectURL(props.file)
  }
  return null
})

const sizeLabel = computed(() => {
  const kb = props.file.size / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
})
</script>

<template>
  <div class="flex items-center gap-2 bg-[#252640] rounded-lg px-2 py-1.5">
    <img
      v-if="previewUrl"
      :src="previewUrl"
      class="w-8 h-8 rounded object-cover"
      :alt="file.name"
    />
    <FileText v-else :size="16" class="text-[#94a3b8] flex-shrink-0" />
    <div class="min-w-0">
      <p class="text-xs text-[#e2e8f0] truncate max-w-[120px]">{{ file.name }}</p>
      <p class="text-[10px] text-[#94a3b8]">{{ sizeLabel }}</p>
    </div>
    <button
      class="flex-shrink-0 text-[#94a3b8] hover:text-[#ef4444] transition-colors ml-1"
      @click="emit('remove')"
    >
      <X :size="14" />
    </button>
  </div>
</template>
```

- [ ] Criar `src/modules/chat/components/DmRequestBanner.vue`

```vue
<!-- src/modules/chat/components/DmRequestBanner.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { UserCheck, UserX } from 'lucide-vue-next'
import { acceptDmRequest, rejectDmRequest } from '../services/chatService'
import type { DmRequest } from '../types'

const props = defineProps<{
  request: DmRequest
}>()

const emit = defineEmits<{
  accepted: [conversationId: string]
  rejected: []
}>()

const loading = ref(false)

async function accept() {
  loading.value = true
  try {
    const conv = await acceptDmRequest(props.request.id)
    emit('accepted', conv.id)
  } finally {
    loading.value = false
  }
}

async function reject() {
  loading.value = true
  try {
    await rejectDmRequest(props.request.id)
    emit('rejected')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="bg-[#1e2038] border-b border-[#252640] px-4 py-3 flex items-center justify-between gap-3">
    <p class="text-sm text-[#e2e8f0]">
      <span class="font-medium text-[#f59e0b]">{{ request.senderName }}</span>
      enviou um pedido de conversa.
    </p>
    <div class="flex items-center gap-2 flex-shrink-0">
      <button
        :disabled="loading"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#22c55e]/20 text-[#22c55e] text-xs font-medium hover:bg-[#22c55e]/30 transition-colors disabled:opacity-50"
        @click="accept"
      >
        <UserCheck :size="13" />
        Aceitar
      </button>
      <button
        :disabled="loading"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#ef4444]/20 text-[#ef4444] text-xs font-medium hover:bg-[#ef4444]/30 transition-colors disabled:opacity-50"
        @click="reject"
      >
        <UserX :size="13" />
        Rejeitar
      </button>
    </div>
  </div>
</template>
```

- [ ] Criar `src/modules/chat/components/MessageArea.vue`

```vue
<!-- src/modules/chat/components/MessageArea.vue -->
<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { Send, Paperclip, ArrowLeft, Users } from 'lucide-vue-next'
import { useChat } from '../composables/useChat'
import { usePresence } from '../composables/usePresence'
import { getSocket } from '@/shared/socket/socket'
import * as chatService from '../services/chatService'
import MessageBubble from './MessageBubble.vue'
import TypingIndicator from './TypingIndicator.vue'
import AttachmentPreview from './AttachmentPreview.vue'
import DmRequestBanner from './DmRequestBanner.vue'

const props = defineProps<{
  currentUserId: string
}>()

const emit = defineEmits<{
  back: []
}>()

const chat = useChat()
const presence = usePresence()

const scrollContainer = ref<HTMLDivElement | null>(null)
const topSentinel = ref<HTMLDivElement | null>(null)
const messageInput = ref('')
const pendingFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const isSending = ref(false)

const conv = computed(() => chat.activeConversation)
const convId = computed(() => chat.activeConversationId)

// Typing users para a conversa ativa
const typingUserNames = computed(() => {
  if (!convId.value) return []
  const userIds = Array.from(chat.typingUsers[convId.value] ?? new Set())
  return userIds
    .filter((uid) => uid !== props.currentUserId)
    .map((uid) => {
      const member = conv.value?.members.find((m) => m.userId === uid)
      return member?.displayName ?? uid
    })
})

// Presença para DMs
const peerIsOnline = computed(() => {
  if (!conv.value || conv.value.type !== 'dm') return false
  const peer = conv.value.members.find((m) => m.userId !== props.currentUserId)
  return peer ? presence.isOnline(peer.userId) : false
})

// Pedido de DM pendente
const pendingDmRequest = computed(() => {
  const req = conv.value?.dmRequest
  if (!req || req.status !== 'pending') return null
  if (req.senderId === props.currentUserId) return null // só para o receiver
  return req
})

// ── Scroll ─────────────────────────────────────────────────────────────────

let isAtBottom = true

function scrollToBottom(smooth = false) {
  const el = scrollContainer.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

function onScroll() {
  const el = scrollContainer.value
  if (!el) return
  isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50
}

// Auto-scroll ao receber nova mensagem se estava no fundo
watch(
  () => chat.activeMessages.length,
  async () => {
    if (isAtBottom) {
      await nextTick()
      scrollToBottom()
    }
  },
)

// Scroll para o fim ao trocar de conversa
watch(convId, async (newId) => {
  if (!newId) return
  await nextTick()
  scrollToBottom()
  chat.markRead(newId)
})

// ── Infinite Scroll (inverso — carregar mais ao chegar no topo) ────────────

let observer: IntersectionObserver | null = null

function setupIntersectionObserver() {
  if (observer) observer.disconnect()
  const sentinel = topSentinel.value
  if (!sentinel) return

  observer = new IntersectionObserver(
    async (entries) => {
      const entry = entries[0]
      if (!entry.isIntersecting || !convId.value) return

      const cursor = chat.cursors[convId.value]
      if (!cursor) return // sem mais páginas

      const el = scrollContainer.value
      const prevScrollHeight = el?.scrollHeight ?? 0
      const prevScrollTop = el?.scrollTop ?? 0

      await chat.fetchMessages(convId.value, cursor)

      // Restaurar posição de scroll para evitar jump
      await nextTick()
      if (el) {
        const newScrollHeight = el.scrollHeight
        el.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight)
      }
    },
    { root: scrollContainer.value, threshold: 0.1 },
  )

  observer.observe(sentinel)
}

watch(topSentinel, (el) => {
  if (el) setupIntersectionObserver()
})

onUnmounted(() => {
  observer?.disconnect()
  clearTypingTimeout()
})

// ── Typing ─────────────────────────────────────────────────────────────────

let typingTimeout: ReturnType<typeof setTimeout> | null = null
let isTyping = false

function clearTypingTimeout() {
  if (typingTimeout) {
    clearTimeout(typingTimeout)
    typingTimeout = null
  }
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
    return
  }
  handleTyping()
}

function handleTyping() {
  if (!convId.value) return
  const sock = getSocket()
  if (!sock) return

  if (!isTyping) {
    isTyping = true
    sock.emit('typing:start', { conversationId: convId.value })
  }

  clearTypingTimeout()
  typingTimeout = setTimeout(() => {
    isTyping = false
    sock.emit('typing:stop', { conversationId: convId.value })
  }, 2000)
}

// ── Envio de Mensagem ──────────────────────────────────────────────────────

async function send() {
  const content = messageInput.value.trim()
  if ((!content && !pendingFile.value) || !convId.value || isSending.value) return

  isSending.value = true

  // Parar indicador de digitação imediatamente
  clearTypingTimeout()
  if (isTyping) {
    isTyping = false
    getSocket()?.emit('typing:stop', { conversationId: convId.value })
  }

  try {
    let attachmentIds: string[] | undefined

    if (pendingFile.value) {
      const uploaded = await chatService.uploadAttachment(convId.value, pendingFile.value)
      attachmentIds = [uploaded.id]
      pendingFile.value = null
    }

    chat.sendMessage(convId.value, content, attachmentIds)
    messageInput.value = ''
  } finally {
    isSending.value = false
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    pendingFile.value = input.files[0]
  }
  // Reset para permitir selecionar o mesmo arquivo novamente
  input.value = ''
}

function triggerFileInput() {
  fileInput.value?.click()
}

function handleDmRequestAccepted() {
  if (convId.value) chat.fetchConversations()
}

function handleDmRequestRejected() {
  chat.setActiveConversation(null)
}
</script>

<template>
  <div class="flex flex-col h-full bg-[#0f0f1a]">
    <!-- Header -->
    <div class="flex items-center gap-3 px-4 py-3 bg-[#1a1b2e] border-b border-[#252640] flex-shrink-0">
      <!-- Botão voltar (mobile) -->
      <button
        class="md:hidden text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
        @click="emit('back')"
      >
        <ArrowLeft :size="20" />
      </button>

      <!-- Avatar -->
      <div class="relative flex-shrink-0">
        <div class="w-9 h-9 rounded-full overflow-hidden bg-[#252640]" :class="conv?.type === 'group' ? 'rounded-lg' : 'rounded-full'">
          <img
            v-if="conv?.coverUrl"
            :src="conv.coverUrl"
            :alt="conv?.name"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-sm font-semibold text-[#e2e8f0]"
            :style="conv?.type === 'group' ? 'background: linear-gradient(135deg, #f59e0b, #d97706)' : ''"
          >
            {{ conv?.name?.charAt(0).toUpperCase() }}
          </div>
        </div>
        <!-- Dot de presença (apenas DM) -->
        <span
          v-if="conv?.type === 'dm'"
          class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#1a1b2e]"
          :class="peerIsOnline ? 'bg-[#22c55e]' : 'bg-[#475569]'"
        />
      </div>

      <!-- Nome + status -->
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-semibold text-[#e2e8f0] truncate">{{ conv?.name }}</h3>
        <p v-if="conv?.type === 'dm'" class="text-xs" :class="peerIsOnline ? 'text-[#22c55e]' : 'text-[#475569]'">
          {{ peerIsOnline ? 'Online' : 'Offline' }}
        </p>
        <p v-else class="text-xs text-[#94a3b8]">
          {{ conv?.members.length }} membros
        </p>
      </div>

      <!-- Ações de grupo -->
      <button
        v-if="conv?.type === 'group'"
        class="text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
        title="Informações do grupo"
      >
        <Users :size="18" />
      </button>
    </div>

    <!-- Banner de pedido de DM pendente -->
    <DmRequestBanner
      v-if="pendingDmRequest"
      :request="pendingDmRequest"
      @accepted="handleDmRequestAccepted"
      @rejected="handleDmRequestRejected"
    />

    <!-- Histórico de mensagens -->
    <div
      ref="scrollContainer"
      class="flex-1 overflow-y-auto py-2"
      @scroll="onScroll"
    >
      <!-- Sentinel para carregar mais (topo) -->
      <div ref="topSentinel" class="h-1" />

      <!-- Loader de paginação -->
      <div
        v-if="convId && chat.messagesLoading[convId]"
        class="flex justify-center py-3 text-xs text-[#94a3b8]"
      >
        Carregando mensagens...
      </div>

      <!-- Sem mensagens -->
      <div
        v-if="!convId"
        class="flex flex-col items-center justify-center h-full text-[#475569] text-sm"
      >
        Selecione uma conversa
      </div>

      <!-- Mensagens -->
      <template v-else>
        <MessageBubble
          v-for="message in chat.activeMessages"
          :key="message.id"
          :message="message"
          :is-mine="message.senderId === currentUserId"
        />

        <!-- Indicador de digitação -->
        <TypingIndicator :users="typingUserNames" />
      </template>
    </div>

    <!-- Área de input -->
    <div class="flex-shrink-0 bg-[#1a1b2e] border-t border-[#252640] px-3 py-3">
      <!-- Preview do arquivo pendente -->
      <div v-if="pendingFile" class="mb-2">
        <AttachmentPreview :file="pendingFile" @remove="pendingFile = null" />
      </div>

      <div class="flex items-end gap-2">
        <!-- Botão de anexo -->
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
          @change="onFileChange"
        />
        <button
          class="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#252640] transition-colors"
          :disabled="isSending"
          @click="triggerFileInput"
        >
          <Paperclip :size="18" />
        </button>

        <!-- Textarea -->
        <textarea
          v-model="messageInput"
          rows="1"
          placeholder="Digite uma mensagem..."
          class="flex-1 bg-[#0f0f1a] text-[#e2e8f0] text-sm placeholder-[#475569] rounded-lg px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-[#f59e0b] min-h-[36px] max-h-[120px]"
          style="field-sizing: content"
          :disabled="!convId"
          @keydown="onInputKeydown"
          @input="handleTyping"
        />

        <!-- Botão enviar -->
        <button
          class="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
          :class="
            (messageInput.trim() || pendingFile) && !isSending
              ? 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
              : 'bg-[#252640] text-[#475569] cursor-not-allowed'
          "
          :disabled="(!messageInput.trim() && !pendingFile) || isSending || !convId"
          @click="send"
        >
          <Send :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] Commit: `feat(chat): add MessageArea with infinite scroll, typing debounce and attachment upload`

---

## Task 8: ChatView (split layout)

### Objetivo
Montar o layout principal responsivo com split-panel no desktop e navegação em tela cheia no mobile.

### Checklist

- [ ] Criar `src/modules/chat/views/ChatView.vue`

```vue
<!-- src/modules/chat/views/ChatView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChat } from '../composables/useChat'
import { usePresence } from '../composables/usePresence'
import ConversationList from '../components/ConversationList.vue'
import MessageArea from '../components/MessageArea.vue'
import CreateGroupModal from '../components/CreateGroupModal.vue'

// Deve ser injetado via provide/inject ou Pinia auth store
const currentUserId = ref<string>('')

// Inicializar a partir do store de auth
import { useAuthStore } from '@/shared/auth/useAuthStore'
const authStore = useAuthStore()
currentUserId.value = authStore.user?.id ?? ''

const chat = useChat()
const presence = usePresence()
const route = useRoute()
const router = useRouter()

const showCreateGroupModal = ref(false)
const showMobileList = computed(() => !chat.activeConversationId)

onMounted(async () => {
  chat.init()
  presence.init()
  await chat.fetchConversations()

  // Restaurar conversa da URL se houver
  const convIdParam = route.params.conversationId as string | undefined
  if (convIdParam) {
    chat.setActiveConversation(convIdParam)
  }
})

onUnmounted(() => {
  chat.cleanup()
  presence.cleanup()
})

function handleSelectConversation(id: string) {
  chat.setActiveConversation(id)
  router.replace(`/chat/${id}`)
}

function handleBack() {
  chat.setActiveConversation(null)
  router.replace('/chat')
}

function handleOpenDmFriend() {
  // Abrir seletor de amigos — pode ser um modal simples
  // Para MVP, pode ser implementado como um modal separado
  // que lista amigos e ao selecionar chama chatService.openDm()
}
</script>

<template>
  <div class="flex h-screen bg-[#0f0f1a] overflow-hidden">
    <!-- Painel esquerdo: Lista de conversas -->
    <div
      class="flex-shrink-0 w-[220px] h-full"
      :class="[
        // Mobile: full screen quando não há conversa ativa
        showMobileList ? 'block w-full md:w-[220px]' : 'hidden md:block',
      ]"
    >
      <ConversationList
        :current-user-id="currentUserId"
        @select="handleSelectConversation"
        @open-create-group="showCreateGroupModal = true"
        @open-dm-friend="handleOpenDmFriend"
      />
    </div>

    <!-- Painel direito: Área de mensagens -->
    <div
      class="flex-1 h-full overflow-hidden"
      :class="[
        // Mobile: full screen quando há conversa ativa
        !showMobileList ? 'block' : 'hidden md:flex md:flex-1',
      ]"
    >
      <MessageArea
        v-if="chat.activeConversationId"
        :current-user-id="currentUserId"
        @back="handleBack"
      />

      <!-- Placeholder quando nenhuma conversa está ativa (desktop) -->
      <div
        v-else
        class="hidden md:flex h-full flex-col items-center justify-center text-[#475569] gap-3"
      >
        <div class="w-16 h-16 rounded-full bg-[#1e2038] flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p class="text-sm">Selecione uma conversa para começar</p>
      </div>
    </div>

    <!-- Modal criar grupo -->
    <CreateGroupModal
      v-if="showCreateGroupModal"
      :current-user-id="currentUserId"
      @close="showCreateGroupModal = false"
      @created="(convId) => { showCreateGroupModal = false; handleSelectConversation(convId) }"
    />
  </div>
</template>
```

- [ ] Adicionar rotas em `src/router/index.ts`

```ts
// Adicionar dentro do array de rotas:
{
  path: '/chat',
  name: 'chat',
  component: () => import('@/modules/chat/views/ChatView.vue'),
  meta: { requiresAuth: true },
},
{
  path: '/chat/:conversationId',
  name: 'chat-conversation',
  component: () => import('@/modules/chat/views/ChatView.vue'),
  meta: { requiresAuth: true },
},
```

- [ ] Commit: `feat(chat): add ChatView split layout with responsive mobile navigation`

---

## Task 9: CreateGroupModal + DmRequestBanner

### Objetivo
Implementar o modal de criação de grupos com seleção de membros e o banner de DM já desenvolvido na Task 7 (referenciado no MessageArea).

### Checklist

- [ ] Criar `src/modules/chat/components/CreateGroupModal.vue`

```vue
<!-- src/modules/chat/components/CreateGroupModal.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, Search, Users } from 'lucide-vue-next'
import * as chatService from '../services/chatService'

// Ajuste o import conforme a estrutura real do projeto
import { useFriendsStore } from '@/modules/friends/useFriendsStore'

const props = defineProps<{
  currentUserId: string
}>()

const emit = defineEmits<{
  close: []
  created: [conversationId: string]
}>()

const friendsStore = useFriendsStore()

const name = ref('')
const description = ref('')
const searchQuery = ref('')
const selectedUserIds = ref<Set<string>>(new Set())
const isCreating = ref(false)
const error = ref('')

const MAX_MEMBERS = 14

const filteredFriends = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return friendsStore.friends
  return friendsStore.friends.filter((f: { displayName: string }) =>
    f.displayName.toLowerCase().includes(q),
  )
})

const canCreate = computed(
  () => name.value.trim().length >= 2 && !isCreating.value,
)

const selectedCount = computed(() => selectedUserIds.value.size)

function toggleUser(userId: string) {
  const set = new Set(selectedUserIds.value)
  if (set.has(userId)) {
    set.delete(userId)
  } else {
    if (set.size >= MAX_MEMBERS) return
    set.add(userId)
  }
  selectedUserIds.value = set
}

async function create() {
  if (!canCreate.value) return
  isCreating.value = true
  error.value = ''
  try {
    const conversation = await chatService.createGroup({
      name: name.value.trim(),
      description: description.value.trim() || undefined,
    })

    // Convidar membros selecionados em paralelo
    const invites = Array.from(selectedUserIds.value).map((uid) =>
      chatService.inviteMember(conversation.id, uid),
    )
    await Promise.all(invites)

    emit('created', conversation.id)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erro ao criar grupo'
  } finally {
    isCreating.value = false
  }
}

onMounted(() => {
  if (!friendsStore.friends.length) {
    friendsStore.fetchFriends()
  }
})
</script>

<template>
  <!-- Overlay -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md bg-[#1a1b2e] rounded-2xl border border-[#252640] shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-[#252640]">
        <div class="flex items-center gap-2">
          <Users :size="18" class="text-[#f59e0b]" />
          <h2 class="text-sm font-semibold text-[#e2e8f0]">Criar grupo</h2>
        </div>
        <button
          class="text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4 space-y-4">
        <!-- Nome -->
        <div>
          <label class="block text-xs text-[#94a3b8] mb-1.5">Nome do grupo *</label>
          <input
            v-model="name"
            type="text"
            maxlength="80"
            placeholder="Ex: Gamers do GeekNet"
            class="w-full bg-[#0f0f1a] text-[#e2e8f0] text-sm placeholder-[#475569] rounded-lg px-3 py-2.5 outline-none focus:ring-1 focus:ring-[#f59e0b]"
          />
        </div>

        <!-- Descrição -->
        <div>
          <label class="block text-xs text-[#94a3b8] mb-1.5">Descrição (opcional)</label>
          <textarea
            v-model="description"
            rows="2"
            maxlength="300"
            placeholder="Sobre o que é esse grupo?"
            class="w-full bg-[#0f0f1a] text-[#e2e8f0] text-sm placeholder-[#475569] rounded-lg px-3 py-2.5 resize-none outline-none focus:ring-1 focus:ring-[#f59e0b]"
          />
        </div>

        <!-- Seleção de amigos -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs text-[#94a3b8]">Convidar amigos</label>
            <span class="text-xs text-[#475569]">{{ selectedCount }}/{{ MAX_MEMBERS }}</span>
          </div>

          <!-- Busca -->
          <div class="relative mb-2">
            <Search :size="13" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#475569]" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Buscar amigo..."
              class="w-full bg-[#0f0f1a] text-[#e2e8f0] text-xs placeholder-[#475569] rounded-md pl-7 pr-3 py-2 outline-none focus:ring-1 focus:ring-[#f59e0b]"
            />
          </div>

          <!-- Lista de amigos -->
          <div class="max-h-48 overflow-y-auto space-y-1">
            <div
              v-if="filteredFriends.length === 0"
              class="py-4 text-center text-xs text-[#475569]"
            >
              Nenhum amigo encontrado
            </div>
            <label
              v-for="friend in filteredFriends"
              :key="friend.userId"
              class="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors"
              :class="selectedUserIds.has(friend.userId) ? 'bg-[#252640]' : 'hover:bg-[#1e2038]'"
            >
              <input
                type="checkbox"
                class="accent-[#f59e0b]"
                :checked="selectedUserIds.has(friend.userId)"
                :disabled="!selectedUserIds.has(friend.userId) && selectedCount >= MAX_MEMBERS"
                @change="toggleUser(friend.userId)"
              />
              <div class="w-7 h-7 rounded-full overflow-hidden bg-[#252640] flex-shrink-0">
                <img
                  v-if="friend.avatarUrl"
                  :src="friend.avatarUrl"
                  :alt="friend.displayName"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-[10px] font-semibold text-[#e2e8f0]"
                >
                  {{ friend.displayName.charAt(0).toUpperCase() }}
                </div>
              </div>
              <span class="text-sm text-[#e2e8f0] truncate">{{ friend.displayName }}</span>
            </label>
          </div>
        </div>

        <!-- Erro -->
        <p v-if="error" class="text-xs text-[#ef4444]">{{ error }}</p>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-[#252640] flex justify-end gap-2">
        <button
          class="px-4 py-2 rounded-lg text-sm text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#252640] transition-colors"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          :disabled="!canCreate"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="
            canCreate
              ? 'bg-[#f59e0b] text-black hover:bg-[#d97706]'
              : 'bg-[#252640] text-[#475569] cursor-not-allowed'
          "
          @click="create"
        >
          {{ isCreating ? 'Criando...' : 'Criar grupo' }}
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] Confirmar que `DmRequestBanner.vue` já foi criado na Task 7
- [ ] Commit: `feat(chat): add CreateGroupModal with friend selection`

---

## Task 10: PWA — Push Notifications

### Objetivo
Integrar notificações push via Web Push API e configurar o vite-plugin-pwa com manifest e workbox para caching offline.

### Checklist

- [ ] Criar `src/shared/pwa/usePush.ts`

```ts
// src/shared/pwa/usePush.ts
import { registerPush } from '@/modules/chat/services/chatService'

export async function requestPushPermission(): Promise<void> {
  if (!('Notification' in window)) return
  if (!('serviceWorker' in navigator)) return

  // Não pedir permissão se já foi negada
  if (Notification.permission === 'denied') return

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  try {
    const registration = await navigator.serviceWorker.ready

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        import.meta.env.VITE_VAPID_PUBLIC_KEY as string,
      ),
    })

    const p256dhBuffer = subscription.getKey('p256dh')
    const authBuffer = subscription.getKey('auth')

    if (!p256dhBuffer || !authBuffer) return

    await registerPush({
      endpoint: subscription.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dhBuffer))),
      auth: btoa(String.fromCharCode(...new Uint8Array(authBuffer))),
    })
  } catch (error) {
    console.error('[PWA] Falha ao registrar push subscription:', error)
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)))
}
```

- [ ] Atualizar `vite.config.ts` para configurar vite-plugin-pwa

```ts
// Adicionar/atualizar em vite.config.ts:
import { VitePWA } from 'vite-plugin-pwa'

// Dentro de plugins:
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
  manifest: {
    name: 'GeekNet',
    short_name: 'GeekNet',
    description: 'Rede Social Geek',
    theme_color: '#0f0f1a',
    background_color: '#0f0f1a',
    display: 'standalone',
    start_url: '/',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [
      {
        // API — NetworkFirst (dados sempre atualizados)
        urlPattern: ({ url }: { url: URL }) =>
          url.pathname.startsWith('/api') || url.origin === import.meta.env.VITE_API_URL,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60, // 1 hora
          },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Assets estáticos — CacheFirst
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|woff|woff2)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
          },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
}),
```

- [ ] Adicionar `VITE_VAPID_PUBLIC_KEY=` ao `.env.example`

```
# Push Notifications (Web Push VAPID)
VITE_VAPID_PUBLIC_KEY=
```

- [ ] Chamar `requestPushPermission()` no useAuth após login bem-sucedido (integração com Task 2)
- [ ] Criar ícones PWA em `public/icons/icon-192x192.png` e `public/icons/icon-512x512.png` (pode ser placeholder para MVP)
- [ ] Commit: `feat(chat): add PWA push notification support with vite-plugin-pwa`

---

## Resumo de Commits

| Task | Commit Message |
|------|---------------|
| 1 | `feat(chat): add domain types and chatService REST functions` |
| 2 | `feat(chat): configure socket singleton and useSocket composable` |
| 3 | `feat(chat): add usePresence store for realtime online status` |
| 4 | `feat(chat): add useChat Pinia store with socket event handlers` |
| 5 | `feat(chat): add ConversationItem and ConversationList components` |
| 6 | `feat(chat): add MessageBubble and TypingIndicator components` |
| 7 | `feat(chat): add MessageArea with infinite scroll, typing debounce and attachment upload` |
| 8 | `feat(chat): add ChatView split layout with responsive mobile navigation` |
| 9 | `feat(chat): add CreateGroupModal with friend selection` |
| 10 | `feat(chat): add PWA push notification support with vite-plugin-pwa` |

## Notas de Implementação

- **Axios instance:** Assumir que `@/shared/http/axios` exporta uma instância pré-configurada com `baseURL` e interceptor de token Bearer (já existente dos sub-projetos anteriores).
- **Auth store:** Assumir que `useAuthStore` expõe `user.id` e `token`. Ajustar imports conforme a estrutura real do projeto.
- **Friends store:** O `CreateGroupModal` assume que `useFriendsStore().friends` retorna array com `{ userId, displayName, avatarUrl }`. Ajustar conforme a API real do sub-projeto 3.
- **`field-sizing: content`** no textarea pode precisar de fallback para browsers mais antigos — adicionar `@input` que ajusta `rows` dinamicamente se necessário.
- **Ícones PWA:** Para MVP, usar um script Node simples para gerar PNGs sólidos com as dimensões corretas, ou usar ferramentas como `sharp` ou `pwa-asset-generator`.
- **Cleanup de socket:** Cada componente/store que registra handlers via `sock.on()` DEVE remover via `sock.off()` no cleanup. A store `useChat` e `usePresence` expõem `cleanup()` chamado em `onUnmounted` do `ChatView`.
