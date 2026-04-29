<!-- src/modules/chat/views/ChatView.vue -->
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Users, MoreVertical, Eye, UserX, Bell, BellOff, PanelLeftClose, PanelLeftOpen, Hourglass, Flag, Settings } from 'lucide-vue-next'
import ReportDialog from '@/modules/reports/components/ReportDialog.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { useChat } from '../composables/useChat'
import { usePresence } from '../composables/usePresence'
import { useFriends } from '@/modules/friends/composables/useFriends'
import ConversationList from '../components/ConversationList.vue'
import MessageArea from '../components/MessageArea.vue'
import OpenDmModal from '../components/OpenDmModal.vue'
import CallButton from '../components/CallButton.vue'
import GroupSettingsModal from '../components/GroupSettingsModal.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import AppImageLightbox from '@/shared/ui/AppImageLightbox.vue'
import { useUiPreferences } from '@/shared/ui/useUiPreferences'

const ui = useUiPreferences()

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const chat = useChat()
const presence = usePresence()

const friends = useFriends()
const mobileShowMessages = ref(false)
const showDmModal = ref(false)
const headerMenuOpen = ref(false)
const blocking = ref(false)
const showGroupSettings = ref(false)
const showBlockConfirm = ref(false)
const headerAvatarZoom = ref(false)
const showReportDialog = ref(false)

function openReportDialog() {
  headerMenuOpen.value = false
  showReportDialog.value = true
}

const otherDmUser = computed(() => {
  const conv = activeConversation.value
  if (!conv || conv.type !== 'dm') return null
  return conv.participants.find(p => p.userId !== auth.user?.id) ?? null
})

const peerAvatarUrl = computed(() => otherDmUser.value?.avatarUrl ?? null)
const hidePeerPhoto = computed(() => activeConversation.value?.isBlockedByOther === true)

function askBlock() {
  if (!otherDmUser.value || blocking.value) return
  headerMenuOpen.value = false
  showBlockConfirm.value = true
}

async function confirmBlock() {
  const other = otherDmUser.value
  if (!other || blocking.value) return
  blocking.value = true
  try {
    await friends.blockUser(other.userId)
    await chat.fetchConversations()
    showBlockConfirm.value = false
  } finally {
    blocking.value = false
  }
}

function viewProfile() {
  const other = otherDmUser.value
  if (!other) return
  headerMenuOpen.value = false
  router.push(`/profile/${other.userId}`)
}

const togglingTemporary = ref(false)
async function toggleTemporary() {
  const conv = activeConversation.value
  if (!conv || togglingTemporary.value) return
  togglingTemporary.value = true
  headerMenuOpen.value = false
  try {
    await chat.toggleTemporary(conv.id, !conv.isTemporary)
  } finally {
    togglingTemporary.value = false
  }
}

function onDocClick() {
  if (headerMenuOpen.value) headerMenuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

const activeConversationId = computed(() => {
  const id = route.params.conversationId
  return typeof id === 'string' ? id : null
})

const activeConversation = computed(() => chat.activeConversation)

// Header title for active conversation
const conversationTitle = computed(() => {
  const conv = activeConversation.value
  if (!conv) return ''
  if (conv.type === 'group') return conv.name ?? 'Grupo'
  const other = conv.participants.find((p) => p.userId !== auth.user?.id)
  return other?.displayName ?? 'Usuário'
})

// Sync URL param → store
watch(
  activeConversationId,
  async (id) => {
    if (id) {
      await chat.setActiveConversation(id)
      mobileShowMessages.value = true
    } else {
      mobileShowMessages.value = false
    }
  },
  { immediate: true },
)

function onSelectConversation(id: string) {
  router.push(`/chat/${id}`)
}

function goBack() {
  mobileShowMessages.value = false
  router.push('/chat')
}

onMounted(async () => {
  chat.init()
  presence.init()
  if (chat.conversations.length === 0) {
    await chat.fetchConversations()
  }
})

// Sair da DM ativa quando deixar a tela do chat (chat:dm:leave socket)
onUnmounted(() => {
  chat.leaveActiveConversation()
})
</script>

<template>
  <div class="flex flex-1 h-full overflow-hidden">
    <!-- Sidebar: conversation list -->
    <div
      v-if="ui.chatListVisible"
      :class="[
        'flex-shrink-0 border-r border-(--color-bg-elevated) transition-all duration-200',
        // Desktop: always visible (when not toggled hidden); Mobile: hide when message area is open
        'w-full md:w-[300px] lg:w-[340px]',
        mobileShowMessages ? 'hidden md:flex' : 'flex',
        'flex-col',
      ]"
    >
      <ConversationList
        :active-conversation-id="activeConversationId"
        @select="onSelectConversation"
        @open-dm-friend="showDmModal = true"
      />
    </div>

    <!-- Main: message area -->
    <div
      :class="[
        'flex-1 flex flex-col min-w-0',
        !mobileShowMessages ? 'hidden md:flex' : 'flex',
      ]"
    >
      <!-- No conversation selected (desktop empty state) -->
      <div
        v-if="!activeConversation"
        class="flex-1 flex flex-col items-center justify-center gap-3 text-(--color-text-muted)"
      >
        <Users :size="48" class="opacity-30" />
        <p class="text-sm">Selecione uma conversa para começar</p>
        <button
          v-if="!ui.chatListVisible"
          type="button"
          class="mt-2 px-3 py-1.5 rounded-lg text-xs bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-card) transition-colors flex items-center gap-1.5"
          @click="ui.toggleChatList"
        >
          <PanelLeftOpen :size="14" />
          Mostrar lista de conversas
        </button>
      </div>

      <!-- Active conversation -->
      <template v-else>
        <!-- Header -->
        <div class="h-16 flex items-center gap-3 px-4 border-b border-(--color-bg-elevated) bg-(--color-bg-surface)">
          <!-- Back button (mobile) -->
          <button
            class="md:hidden p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            @click="goBack"
          >
            <ArrowLeft :size="20" />
          </button>

          <!-- Toggle chat list (desktop) -->
          <button
            class="hidden md:flex p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            :title="ui.chatListVisible ? 'Ocultar lista' : 'Mostrar lista'"
            @click="ui.toggleChatList"
          >
            <component :is="ui.chatListVisible ? PanelLeftClose : PanelLeftOpen" :size="18" />
          </button>

          <!-- Avatar (oculta foto se foi bloqueado pelo outro lado) -->
          <div class="relative">
            <div
              v-if="hidePeerPhoto"
              class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center"
            >
              <Users :size="16" class="text-slate-400" />
            </div>
            <img
              v-else-if="activeConversation.avatarUrl || peerAvatarUrl"
              :src="activeConversation.avatarUrl ?? peerAvatarUrl ?? ''"
              :alt="conversationTitle"
              class="w-9 h-9 rounded-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
              title="Ver foto"
              @click="headerAvatarZoom = true"
            />
            <div
              v-else
              class="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200"
            >
              {{ conversationTitle.charAt(0).toUpperCase() }}
            </div>
          </div>

          <!-- Name + status -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-(--color-text-primary) truncate">
              {{ conversationTitle }}
            </p>
            <p
              v-if="activeConversation.type === 'group'"
              class="text-xs text-(--color-text-muted)"
            >
              {{ activeConversation.participants.length }} participantes
            </p>
            <p v-else class="text-xs text-(--color-text-muted)">
              {{
                (() => {
                  if (activeConversation.isBlockedByMe) return 'Bloqueado'
                  if (activeConversation.isBlockedByOther) return ''
                  const peer = activeConversation.participants.find((p) => p.userId !== auth.user?.id)
                  return peer && presence.isOnline(peer.userId) ? 'Online' : 'Offline'
                })()
              }}
            </p>
          </div>

          <!-- Botão de chamada (apenas DM, oculto se bloqueado) -->
          <CallButton
            v-if="activeConversation.type === 'dm' && otherDmUser && !activeConversation.isBlockedByMe && !activeConversation.isBlockedByOther"
            :conversation="activeConversation"
          />

          <!-- Botão sino (silenciar/reativar notificações) -->
          <button
            v-if="activeConversation"
            @click="chat.toggleMute(activeConversation.id)"
            class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
            :title="activeConversation.isMuted ? 'Reativar notificações' : 'Silenciar conversa'"
          >
            <component :is="activeConversation.isMuted ? BellOff : Bell" :size="18" />
          </button>

          <!-- Menu ⋮ para grupos (Detalhes/Denunciar) -->
          <div v-if="activeConversation.type === 'group'" class="relative">
            <button
              class="flex h-8 w-8 items-center justify-center rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
              @click.stop="headerMenuOpen = !headerMenuOpen"
              title="Mais opções"
            >
              <MoreVertical :size="18" />
            </button>
            <div
              v-if="headerMenuOpen"
              class="absolute right-0 top-10 z-20 min-w-[180px] whitespace-nowrap rounded-xl border border-[#252640] bg-[#1a1b2e] py-1 shadow-xl"
              @click.stop
            >
              <button
                class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors"
                @click="showGroupSettings = true; headerMenuOpen = false"
              >
                <Settings :size="15" />
                Detalhes do grupo
              </button>
              <button
                class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors"
                @click="openReportDialog"
              >
                <Flag :size="15" />
                Denunciar conversa
              </button>
            </div>
          </div>

          <!-- Menu ⋮ (apenas DM) -->
          <div v-if="activeConversation.type === 'dm' && otherDmUser" class="relative">
            <button
              class="flex h-8 w-8 items-center justify-center rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
              @click.stop="headerMenuOpen = !headerMenuOpen"
              title="Mais opções"
            >
              <MoreVertical :size="18" />
            </button>
            <div
              v-if="headerMenuOpen"
              class="absolute right-0 top-10 z-20 min-w-[180px] whitespace-nowrap rounded-xl border border-[#252640] bg-[#1a1b2e] py-1 shadow-xl"
              @click.stop
            >
              <button
                class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors"
                @click="viewProfile"
              >
                <Eye :size="15" />
                Ver perfil
              </button>
              <button
                :disabled="togglingTemporary || activeConversation.isBlockedByMe || activeConversation.isBlockedByOther"
                class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors disabled:opacity-50"
                @click="toggleTemporary"
              >
                <Hourglass :size="15" />
                {{ activeConversation.isTemporary ? 'Desativar' : 'Ativar' }} modo temporário
              </button>
              <button
                class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors"
                @click="openReportDialog"
              >
                <Flag :size="15" />
                Denunciar conversa
              </button>
              <button
                v-if="!activeConversation.isBlockedByMe"
                :disabled="blocking"
                class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#ef4444] hover:bg-[#252640] transition-colors disabled:opacity-50"
                @click="askBlock"
              >
                <UserX :size="15" />
                Bloquear usuário
              </button>
            </div>
          </div>
        </div>

        <!-- Banner do modo temporário -->
        <div
          v-if="activeConversation.isTemporary"
          class="flex items-center gap-2 px-4 py-2 text-xs text-(--color-accent-amber) bg-(--color-accent-amber)/10 border-b border-(--color-accent-amber)/20"
        >
          <Hourglass :size="12" />
          <span>Modo temporário ativo · Mensagens somem ao serem visualizadas</span>
        </div>

        <!-- Message area -->
        <MessageArea :conversation="activeConversation" class="flex-1 min-h-0" />
      </template>
    </div>

    <!-- Open DM modal -->
    <OpenDmModal
      v-if="showDmModal"
      @close="showDmModal = false"
      @opened="(id) => { showDmModal = false; router.push(`/chat/${id}`) }"
    />

    <!-- Group settings modal -->
    <GroupSettingsModal
      v-if="showGroupSettings && activeConversation && activeConversation.type === 'group'"
      :conversation="activeConversation"
      @close="showGroupSettings = false"
      @left="router.push('/chat')"
    />

    <AppImageLightbox
      :open="headerAvatarZoom && !!(activeConversation?.avatarUrl ?? peerAvatarUrl)"
      :src="activeConversation?.avatarUrl ?? peerAvatarUrl"
      :alt="conversationTitle"
      variant="circular"
      @close="headerAvatarZoom = false"
    />

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
      v-if="activeConversation"
      :open="showReportDialog"
      target-type="conversation"
      :target-id="activeConversation.id"
      :blockable-user-id="otherDmUser?.userId ?? null"
      :blockable-user-name="otherDmUser?.displayName ?? null"
      :deletable-conversation-id="activeConversation.id"
      @close="showReportDialog = false"
      @reported="showReportDialog = false"
    />
  </div>
</template>
