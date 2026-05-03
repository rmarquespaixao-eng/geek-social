<!-- src/modules/chat/components/FloatingChatBar.vue -->
<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { X, MessageCircle, Inbox } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import { useChat } from '../composables/useChat'
import { useFloatingChats } from '../composables/useFloatingChats'
import { timeAgo } from '@/shared/utils/timeAgo'
import MiniChatWindow from './MiniChatWindow.vue'
import type { Conversation } from '../types'

const auth = useAuthStore()
const chat = useChat()
const floating = useFloatingChats()
const route = useRoute()

const isAuthed = computed(() => auth.isAuthenticated)
const isOnFullChat = computed(() => route.path.startsWith('/chat'))
/** Container visível em qualquer rota autenticada que não seja /chat. */
const visible = computed(() => isAuthed.value && !isOnFullChat.value)

const expandedConversation = computed(() => {
  const id = floating.expanded?.id
  if (!id) return null
  return chat.conversations.find((c) => c.id === id) ?? null
})

const minimizedConversations = computed(() =>
  floating.minimizedWindows
    .map((w) => chat.conversations.find((c) => c.id === w.id))
    .filter((c): c is Conversation => Boolean(c)),
)

/** Lista do painel: ordenadas por última atividade, top 12. */
const recentConversations = computed(() => chat.sortedConversations.slice(0, 12))

function chipName(c: Conversation): string {
  if (c.type === 'group') return c.name ?? 'Grupo'
  const other = c.participants.find((p) => p.userId !== auth.user?.id)
  return other?.displayName ?? 'Usuário'
}

function chipAvatar(c: Conversation): string | null {
  if (c.avatarUrl) return c.avatarUrl
  const other = c.participants.find((p) => p.userId !== auth.user?.id)
  return other?.avatarUrl ?? null
}

function lastMessagePreview(c: Conversation): string {
  const lm = c.lastMessage
  if (!lm) return 'Nenhuma mensagem ainda'
  if (lm.type === 'image') return '📷 Foto'
  if (lm.type === 'video') return '🎬 Vídeo'
  if (lm.type === 'audio') return '🎤 Áudio'
  if (lm.type === 'file') return '📎 Arquivo'
  if (lm.type === 'call') return '📞 Chamada'
  if (lm.isEncrypted) return '🔒 Mensagem criptografada'
  return lm.content || ''
}

const panelOpen = ref(false)
const panelRef = ref<HTMLElement | null>(null)

function togglePanel() {
  panelOpen.value = !panelOpen.value
}

function pickFromPanel(id: string) {
  panelOpen.value = false
  void floating.expandChat(id)
}

function onDocClick(e: MouseEvent) {
  if (!panelOpen.value) return
  const target = e.target as Node
  if (panelRef.value && !panelRef.value.contains(target)) panelOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

// authInit já chama chat.fetchConversations() no boot. Fallback caso o usuário
// abra o painel antes do fetch inicial completar ou em estados de erro.
watch(panelOpen, async (open) => {
  if (open && isAuthed.value && chat.conversations.length === 0 && !chat.loading) {
    await chat.fetchConversations()
  }
})

watch(isAuthed, (now) => {
  if (!now) {
    floating.clear()
    panelOpen.value = false
  }
})
</script>

<template>
  <div
    v-if="visible"
    class="fixed bottom-4 right-4 z-40 hidden md:flex items-end gap-3 pointer-events-none"
  >
    <!-- Chips de minimizadas -->
    <div v-if="minimizedConversations.length > 0" class="flex flex-col gap-2 pointer-events-auto">
      <div
        v-for="conv in minimizedConversations"
        :key="conv.id"
        class="group relative max-w-[180px]"
      >
        <button
          type="button"
          class="flex items-center gap-2 pl-2 pr-3 py-1.5 w-full rounded-full bg-(--color-bg-card) border border-(--color-bg-elevated) shadow-lg shadow-black/30 hover:border-(--color-accent-amber)/40 transition-colors"
          @click="floating.expandChat(conv.id)"
        >
          <img
            v-if="chipAvatar(conv)"
            :src="chipAvatar(conv) ?? ''"
            :alt="chipName(conv)"
            class="h-7 w-7 rounded-full object-cover flex-shrink-0"
          />
          <div
            v-else
            class="h-7 w-7 rounded-full bg-slate-600 flex items-center justify-center text-[11px] font-semibold text-slate-200 flex-shrink-0"
          >
            {{ chipName(conv).charAt(0).toUpperCase() }}
          </div>
          <span class="text-[12px] font-medium text-(--color-text-primary) truncate">{{ chipName(conv) }}</span>
          <span
            v-if="(conv.unreadCount ?? 0) > 0 && !conv.isMuted"
            class="flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-danger) px-1 text-[10px] font-bold text-white"
          >
            {{ conv.unreadCount }}
          </span>
        </button>
        <button
          type="button"
          class="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-(--color-bg-elevated) text-(--color-text-muted) hover:text-(--color-danger) transition-colors"
          @click="floating.closeChat(conv.id)"
          title="Fechar"
        >
          <X :size="10" />
        </button>
      </div>
    </div>

    <!-- Janela expandida -->
    <div v-if="expandedConversation" class="pointer-events-auto">
      <MiniChatWindow :conversation="expandedConversation" />
    </div>

    <!-- Launcher: balão sempre visível + painel toggleable -->
    <div ref="panelRef" class="relative pointer-events-auto">
      <!-- Painel acima do balão -->
      <div
        v-if="panelOpen"
        class="absolute bottom-16 right-0 w-[320px] max-h-[420px] bg-(--color-bg-card) rounded-xl border border-(--color-bg-elevated) shadow-2xl shadow-black/40 overflow-hidden flex flex-col"
      >
        <div class="flex items-center justify-between px-4 h-12 border-b border-(--color-bg-elevated) flex-shrink-0">
          <p class="text-sm font-bold text-(--color-text-primary)">Conversas</p>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="panelOpen = false"
            title="Fechar"
          >
            <X :size="14" />
          </button>
        </div>

        <div v-if="chat.loading && recentConversations.length === 0" class="flex items-center justify-center py-10">
          <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
        </div>

        <div
          v-else-if="recentConversations.length === 0"
          class="flex flex-col items-center justify-center py-10 px-4 text-center flex-1"
        >
          <Inbox :size="32" class="text-(--color-text-muted) mb-2" />
          <p class="text-sm text-(--color-text-muted)">Nenhuma conversa ainda.</p>
          <p class="mt-1 text-xs text-(--color-text-muted)">Abra um DM pelo perfil de um amigo.</p>
        </div>

        <div v-else class="overflow-y-auto flex-1">
          <button
            v-for="conv in recentConversations"
            :key="conv.id"
            type="button"
            class="flex items-center gap-3 px-3 py-2.5 w-full hover:bg-(--color-bg-elevated)/50 transition-colors text-left border-b border-(--color-bg-elevated)/50 last:border-b-0"
            @click="pickFromPanel(conv.id)"
          >
            <img
              v-if="chipAvatar(conv)"
              :src="chipAvatar(conv) ?? ''"
              :alt="chipName(conv)"
              class="h-9 w-9 rounded-full object-cover flex-shrink-0"
            />
            <div
              v-else
              class="h-9 w-9 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-200 flex-shrink-0"
            >
              {{ chipName(conv).charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[13px] font-semibold text-(--color-text-primary) truncate">{{ chipName(conv) }}</p>
                <span v-if="conv.lastMessage?.createdAt" class="text-[10px] text-(--color-text-muted) flex-shrink-0">
                  {{ timeAgo(conv.lastMessage.createdAt) }}
                </span>
              </div>
              <p class="text-[11px] text-(--color-text-muted) truncate mt-0.5">{{ lastMessagePreview(conv) }}</p>
            </div>
            <span
              v-if="(conv.unreadCount ?? 0) > 0 && !conv.isMuted"
              class="flex h-5 min-w-5 items-center justify-center rounded-full bg-(--color-danger) px-1.5 text-[10px] font-bold text-white flex-shrink-0"
            >
              {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
            </span>
          </button>
        </div>
      </div>

      <!-- Balão (sempre visível) -->
      <button
        type="button"
        class="relative h-14 w-14 rounded-full bg-(--color-accent-amber) text-black shadow-2xl shadow-black/40 hover:brightness-110 transition-all flex items-center justify-center"
        :class="panelOpen ? 'ring-2 ring-(--color-accent-amber)/40' : ''"
        @click="togglePanel"
        :title="panelOpen ? 'Fechar conversas' : 'Abrir conversas'"
      >
        <MessageCircle :size="24" :stroke-width="2.5" />
        <span
          v-if="chat.totalUnread > 0"
          class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--color-danger) px-1.5 text-[11px] font-bold text-white border-2 border-(--color-bg-base) animate-pulse"
        >
          {{ chat.totalUnread > 99 ? '99+' : chat.totalUnread }}
        </span>
      </button>
    </div>
  </div>
</template>
