<!-- src/modules/chat/components/ConversationItem.vue -->
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { MoreVertical, Archive, ArchiveRestore, Trash2, Bell, BellOff } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import { useChat } from '../composables/useChat'
import { usePresence } from '../composables/usePresence'
import { timeAgo } from '@/shared/utils/timeAgo'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import type { Conversation } from '../types'

const props = defineProps<{
  conversation: Conversation
  isActive: boolean
}>()

const auth = useAuthStore()
const presence = usePresence()
const chat = useChat()
const menuOpen = ref(false)
const showHideConfirm = ref(false)
const hiding = ref(false)

async function handleArchive() {
  menuOpen.value = false
  if (props.conversation.isArchived) {
    await chat.unarchiveConversation(props.conversation.id)
  } else {
    await chat.archiveConversation(props.conversation.id)
  }
}

async function handleToggleMute() {
  menuOpen.value = false
  await chat.toggleMute(props.conversation.id)
}

function askHide() {
  menuOpen.value = false
  showHideConfirm.value = true
}

async function confirmHide() {
  if (hiding.value) return
  hiding.value = true
  try {
    await chat.hideConversation(props.conversation.id)
    showHideConfirm.value = false
  } finally {
    hiding.value = false
  }
}

function onDocClick() {
  if (menuOpen.value) menuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

const otherParticipant = computed(() => {
  if (props.conversation.type !== 'dm') return null
  return props.conversation.participants.find((p) => p.userId !== auth.user?.id) ?? null
})

const displayName = computed(() => {
  if (props.conversation.type === 'group') {
    return props.conversation.name ?? 'Grupo'
  }
  return otherParticipant.value?.displayName ?? 'Usuário'
})

// Esconde foto/online só quando o outro lado me bloqueou.
// Quem bloqueou (isBlockedByMe) continua vendo a foto normalmente.
const hidePeerInfo = computed(() => props.conversation.isBlockedByOther === true)

const avatarUrl = computed(() => {
  if (props.conversation.type === 'group') return props.conversation.avatarUrl
  if (hidePeerInfo.value) return null
  return otherParticipant.value?.avatarUrl ?? null
})

const isOnline = computed(() => {
  if (props.conversation.type !== 'dm' || !otherParticipant.value) return false
  if (hidePeerInfo.value) return false
  return presence.isOnline(otherParticipant.value.userId)
})

const lastMessagePreview = computed(() => {
  const msg = props.conversation.lastMessage
  if (!msg) return 'Sem mensagens ainda'
  if (msg.type === 'call') return '📞 Chamada'
  if (msg.type === 'audio') return '🎤 Mensagem de voz'
  if (msg.type === 'image') return '📷 Imagem'
  if (msg.type === 'video') return '🎬 Vídeo'
  if (msg.type === 'file') return '📎 Arquivo'
  if (msg.isEncrypted) return '🔒 Mensagem criptografada'
  const content = msg.content ?? ''
  return content.length > 50 ? content.slice(0, 50) + '…' : content
})

const lastMessageTime = computed(() => {
  const msg = props.conversation.lastMessage
  if (!msg) return ''
  return timeAgo(msg.createdAt)
})

const initials = computed(() => {
  return displayName.value
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
})
</script>

<template>
  <div
    :class="[
      'relative flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-colors group',
      isActive
        ? 'bg-(--color-accent-amber)/10 text-(--color-accent-amber)'
        : 'hover:bg-(--color-bg-elevated)',
    ]"
  >
    <!-- Avatar -->
    <div class="relative flex-shrink-0">
      <div
        v-if="hidePeerInfo"
        class="w-10 h-10 rounded-full bg-slate-700"
      />
      <img
        v-else-if="avatarUrl"
        :src="avatarUrl"
        :alt="displayName"
        class="w-10 h-10 rounded-full object-cover"
      />
      <div
        v-else
        class="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200"
      >
        {{ initials }}
      </div>
      <!-- Online indicator -->
      <span
        v-if="isOnline"
        class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-(--color-status-online) border-2 border-(--color-bg-surface)"
      />
    </div>

    <!-- Menu ⋮ (aparece no hover) -->
    <div class="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
      <div class="relative">
        <button
          @click.stop="menuOpen = !menuOpen"
          class="flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-bg-surface)/80 text-(--color-text-muted) hover:text-(--color-text-primary) backdrop-blur"
        >
          <MoreVertical :size="14" />
        </button>
        <div
          v-if="menuOpen"
          class="absolute right-0 top-8 z-30 min-w-[170px] rounded-xl border border-[#252640] bg-[#1a1b2e] py-1 shadow-xl"
          @click.stop
        >
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors"
            @click="handleToggleMute"
          >
            <component :is="conversation.isMuted ? Bell : BellOff" :size="14" />
            {{ conversation.isMuted ? 'Reativar notificações' : 'Silenciar' }}
          </button>
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors"
            @click="handleArchive"
          >
            <component :is="conversation.isArchived ? ArchiveRestore : Archive" :size="14" />
            {{ conversation.isArchived ? 'Desarquivar' : 'Arquivar' }}
          </button>
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#ef4444] hover:bg-[#252640] transition-colors"
            @click="askHide"
          >
            <Trash2 :size="14" />
            Apagar conversa
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline justify-between gap-1">
        <div class="flex items-center gap-1 min-w-0">
          <span
            :class="[
              'text-sm font-semibold truncate',
              isActive ? 'text-(--color-accent-amber)' : 'text-(--color-text-primary)',
            ]"
          >
            {{ displayName }}
          </span>
          <BellOff
            v-if="conversation.isMuted"
            :size="14"
            class="text-(--color-text-muted) flex-shrink-0"
          />
        </div>
        <span class="text-xs text-(--color-text-muted) flex-shrink-0">{{ lastMessageTime }}</span>
      </div>
      <div class="flex items-center justify-between gap-1 mt-0.5">
        <p class="text-xs text-(--color-text-secondary) truncate">{{ lastMessagePreview }}</p>
        <span
          v-if="conversation.unreadCount > 0"
          :class="[
            'flex-shrink-0 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center px-1',
            conversation.isMuted
              ? 'bg-(--color-bg-elevated) text-(--color-text-secondary)'
              : 'bg-(--color-accent-amber) text-[#0f0f1a]',
          ]"
        >
          {{ conversation.unreadCount > 99 ? '99+' : conversation.unreadCount }}
        </span>
      </div>
    </div>

    <AppConfirmDialog
      :open="showHideConfirm"
      title="Apagar conversa"
      description="A conversa some da sua lista, mas o outro lado continua vendo. Se chegar uma mensagem nova, ela reaparece automaticamente."
      confirm-label="Apagar"
      :loading="hiding"
      @cancel="showHideConfirm = false"
      @confirm="confirmHide"
    />
  </div>
</template>
