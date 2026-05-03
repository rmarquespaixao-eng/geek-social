<!-- src/modules/chat/components/MiniChatWindow.vue -->
<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { X, MoreVertical, Maximize2, Minus, Eye, Bell, BellOff, Hourglass, UserX, Flag, Shield } from 'lucide-vue-next'
import ReportDialog from '@/modules/reports/components/ReportDialog.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { useChat } from '../composables/useChat'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { usePresence } from '../composables/usePresence'
import { useFloatingChats } from '../composables/useFloatingChats'
import MessageArea from './MessageArea.vue'
import SafetyNumberDialog from './SafetyNumberDialog.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import type { Conversation } from '../types'

const props = defineProps<{
  conversation: Conversation
}>()

const auth = useAuthStore()
const chat = useChat()
const friends = useFriends()
const presence = usePresence()
const floating = useFloatingChats()
const router = useRouter()

// MessageArea lê de chat.active* — garantir que a conversa exibida seja a ativa
async function syncActive() {
  if (chat.activeConversationId !== props.conversation.id) {
    await chat.setActiveConversation(props.conversation.id)
  }
}
onMounted(syncActive)
watch(() => props.conversation.id, syncActive)

const otherDmUser = computed(() => {
  if (props.conversation.type !== 'dm') return null
  return props.conversation.participants.find((p) => p.userId !== auth.user?.id) ?? null
})

const title = computed(() => {
  if (props.conversation.type === 'group') return props.conversation.name ?? 'Grupo'
  return otherDmUser.value?.displayName ?? 'Usuário'
})

const avatarUrl = computed(() => {
  if (props.conversation.avatarUrl) return props.conversation.avatarUrl
  return otherDmUser.value?.avatarUrl ?? null
})

const presenceLabel = computed(() => {
  if (props.conversation.type !== 'dm' || !otherDmUser.value) return null
  if (props.conversation.isBlockedByMe) return 'Bloqueado'
  if (props.conversation.isBlockedByOther) return null
  return presence.isOnline(otherDmUser.value.userId) ? 'Online' : 'Offline'
})

const isDm = computed(() => props.conversation.type === 'dm')
const canTemporaryToggle = computed(
  () => isDm.value && !props.conversation.isBlockedByMe && !props.conversation.isBlockedByOther,
)
const canBlock = computed(() => isDm.value && otherDmUser.value && !props.conversation.isBlockedByMe)

const menuOpen = ref(false)
const togglingTemporary = ref(false)
const showBlockConfirm = ref(false)
const blocking = ref(false)
const showReportDialog = ref(false)
const showSafetyDialog = ref(false)

function openSafetyDialog() {
  menuOpen.value = false
  showSafetyDialog.value = true
}

function openReport() {
  menuOpen.value = false
  showReportDialog.value = true
}

function viewProfile() {
  if (!otherDmUser.value) return
  menuOpen.value = false
  router.push(`/profile/${otherDmUser.value.userId}`)
}

async function toggleMute() {
  menuOpen.value = false
  await chat.toggleMute(props.conversation.id)
}

async function toggleTemporary() {
  if (togglingTemporary.value) return
  togglingTemporary.value = true
  menuOpen.value = false
  try {
    await chat.toggleTemporary(props.conversation.id, !props.conversation.isTemporary)
  } finally {
    togglingTemporary.value = false
  }
}

function askBlock() {
  menuOpen.value = false
  showBlockConfirm.value = true
}

async function confirmBlock() {
  if (!otherDmUser.value || blocking.value) return
  blocking.value = true
  try {
    await friends.blockUser(otherDmUser.value.userId)
    await chat.fetchConversations()
    showBlockConfirm.value = false
    floating.closeChat(props.conversation.id)
  } finally {
    blocking.value = false
  }
}

function openInFullView() {
  menuOpen.value = false
  router.push(`/chat/${props.conversation.id}`)
}

</script>

<template>
  <div
    class="relative isolate flex flex-col w-[340px] h-[480px] rounded-t-xl bg-(--color-bg-card) border border-(--color-bg-elevated) shadow-2xl shadow-black/40 overflow-hidden"
    @click.stop
  >
    <!-- Backdrop para fechar o menu ⋮ ao clicar fora dele dentro da janela -->
    <div
      v-if="menuOpen"
      class="absolute inset-0 z-20 cursor-default"
      @click="menuOpen = false"
    />
    <!-- Header -->
    <div class="flex items-center gap-2 px-2.5 h-12 bg-(--color-bg-surface) border-b border-(--color-bg-elevated) flex-shrink-0">
      <button
        type="button"
        class="flex items-center gap-2 flex-1 min-w-0 text-left"
        @click="floating.minimizeChat(conversation.id)"
        :title="`Minimizar ${title}`"
      >
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          :alt="title"
          class="w-8 h-8 rounded-full object-cover flex-shrink-0"
        />
        <div
          v-else
          class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-200 flex-shrink-0"
        >
          {{ title.charAt(0).toUpperCase() }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[13px] font-semibold text-(--color-text-primary) truncate leading-tight">{{ title }}</p>
          <p v-if="presenceLabel" class="text-[10px] text-(--color-text-muted) truncate">
            {{ presenceLabel }}
          </p>
        </div>
      </button>

      <!-- Menu ⋮ -->
      <div class="relative flex-shrink-0">
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors relative z-30"
          @click.stop="menuOpen = !menuOpen"
          title="Mais opções"
        >
          <MoreVertical :size="14" />
        </button>
        <div
          v-if="menuOpen"
          class="absolute right-0 top-9 z-30 min-w-[200px] whitespace-nowrap rounded-xl border border-(--color-bg-elevated) bg-(--color-bg-card) py-1 shadow-xl"
          @click.stop
        >
          <button
            v-if="otherDmUser"
            type="button"
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="viewProfile"
          >
            <Eye :size="14" />
            Ver perfil
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="toggleMute"
          >
            <component :is="conversation.isMuted ? BellOff : Bell" :size="14" />
            {{ conversation.isMuted ? 'Reativar notificações' : 'Silenciar' }}
          </button>
          <button
            v-if="canTemporaryToggle"
            type="button"
            :disabled="togglingTemporary"
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors disabled:opacity-50"
            @click="toggleTemporary"
          >
            <Hourglass :size="14" />
            {{ conversation.isTemporary ? 'Desativar' : 'Ativar' }} modo temporário
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="openSafetyDialog"
          >
            <Shield :size="14" />
            Verificar identidade
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="openInFullView"
          >
            <Maximize2 :size="14" />
            Abrir em tela cheia
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="floating.minimizeChat(conversation.id); menuOpen = false"
          >
            <Minus :size="14" />
            Minimizar
          </button>
          <div class="my-1 border-t border-(--color-bg-elevated)" />
          <button
            type="button"
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            @click="openReport"
          >
            <Flag :size="14" />
            Denunciar conversa
          </button>
          <button
            v-if="canBlock"
            type="button"
            :disabled="blocking"
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-(--color-danger) hover:bg-(--color-bg-elevated) transition-colors disabled:opacity-50"
            @click="askBlock"
          >
            <UserX :size="14" />
            Bloquear usuário
          </button>
        </div>
      </div>

      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md text-(--color-text-muted) hover:text-(--color-danger) hover:bg-(--color-bg-elevated) transition-colors flex-shrink-0"
        @click="floating.closeChat(conversation.id)"
        title="Fechar"
      >
        <X :size="14" />
      </button>
    </div>

    <!-- Banner do modo temporário -->
    <div
      v-if="conversation.isTemporary"
      class="flex items-center gap-1.5 px-3 py-1 text-[10px] text-(--color-accent-amber) bg-(--color-accent-amber)/10 border-b border-(--color-accent-amber)/20 flex-shrink-0"
    >
      <Hourglass :size="11" />
      <span>Modo temporário ativo</span>
    </div>

    <!-- Body — reutiliza o MessageArea por completo -->
    <MessageArea :conversation="conversation" class="flex-1 min-h-0" />
  </div>

  <AppConfirmDialog
    :open="showBlockConfirm && !!otherDmUser"
    :title="otherDmUser ? `Bloquear ${otherDmUser.displayName}?` : ''"
    description="Vocês deixarão de ver mensagens um do outro até que você desbloqueie. A amizade entre vocês também será desfeita."
    confirm-label="Bloquear"
    :loading="blocking"
    @cancel="showBlockConfirm = false"
    @confirm="confirmBlock"
  />

  <ReportDialog
    :open="showReportDialog"
    target-type="conversation"
    :target-id="conversation.id"
    :blockable-user-id="otherDmUser?.userId ?? null"
    :blockable-user-name="otherDmUser?.displayName ?? null"
    :deletable-conversation-id="conversation.id"
    @close="showReportDialog = false"
    @reported="showReportDialog = false"
  />

  <SafetyNumberDialog
    v-if="showSafetyDialog"
    :conversation="conversation"
    @close="showSafetyDialog = false"
  />
</template>
