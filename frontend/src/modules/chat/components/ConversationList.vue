<!-- src/modules/chat/components/ConversationList.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Search, Users, MessageCircle, Archive, ArrowLeft, Mail, Check, X, ChevronDown, ChevronUp, Eye } from 'lucide-vue-next'
import { useChat } from '../composables/useChat'
import ConversationItem from './ConversationItem.vue'
import CreateGroupModal from './CreateGroupModal.vue'
import * as chatService from '../services/chatService'
import AppAvatar from '@/shared/ui/AppAvatar.vue'
import { timeAgo } from '@/shared/utils/timeAgo'
import type { DmRequest } from '../types'

const props = defineProps<{
  activeConversationId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', conversationId: string): void
  (e: 'openDmFriend'): void
}>()

const router = useRouter()
const chat = useChat()

const search = ref('')
const menuOpen = ref(false)
const showCreateGroup = ref(false)
const menuRef = ref<HTMLElement | null>(null)

const sourceList = computed(() =>
  chat.viewingArchived ? chat.archivedConversations : chat.conversations,
)

const filtered = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return sourceList.value
  return sourceList.value.filter((c) => {
    const name = c.name ?? c.participants.map((p) => p.displayName).join(' ')
    return name.toLowerCase().includes(q)
  })
})

watch(() => chat.viewingArchived, async (v) => {
  if (v) await chat.fetchArchivedConversations()
})

function showArchived() {
  menuOpen.value = false
  chat.viewingArchived = true
}
function showActive() {
  chat.viewingArchived = false
}

function selectConversation(id: string) {
  emit('select', id)
  router.push(`/chat/${id}`)
}

function openCreateGroup() {
  menuOpen.value = false
  showCreateGroup.value = true
}

function openDm() {
  menuOpen.value = false
  emit('openDmFriend')
}

// Click-outside handler for dropdown menu
function handleOutsideClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))

// ── DM requests recebidos (não-amigos pedindo conversa) ─────────────────────
const dmRequests = ref<DmRequest[]>([])
const dmRequestsLoading = ref(false)
const dmRequestsExpanded = ref(false)
const actingRequestId = ref<string | null>(null)

const route = useRoute()
async function refreshDmRequests() {
  dmRequestsLoading.value = true
  try {
    dmRequests.value = await chatService.listDmRequests()
  } catch {
    dmRequests.value = []
  } finally {
    dmRequestsLoading.value = false
  }
}

async function acceptDmRequest(req: DmRequest) {
  actingRequestId.value = req.id
  try {
    const conv = await chatService.acceptDmRequest(req.id)
    dmRequests.value = dmRequests.value.filter(r => r.id !== req.id)
    await chat.fetchConversations()
    selectConversation(conv.id)
  } finally {
    actingRequestId.value = null
  }
}

async function rejectDmRequest(req: DmRequest) {
  actingRequestId.value = req.id
  try {
    await chatService.rejectDmRequest(req.id)
    dmRequests.value = dmRequests.value.filter(r => r.id !== req.id)
  } finally {
    actingRequestId.value = null
  }
}

onMounted(refreshDmRequests)

// Abre a seção automaticamente quando navegando via notificação (`/chat?requests=open`)
watch(() => route.query.requests, (q) => {
  if (q === 'open') dmRequestsExpanded.value = true
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col h-full bg-(--color-bg-surface)">
    <!-- Header -->
    <div class="h-16 flex items-center justify-between px-4 border-b border-(--color-bg-elevated)">
      <div class="flex items-center gap-2 min-w-0">
        <button
          v-if="chat.viewingArchived"
          @click="showActive"
          class="p-1 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary)"
        >
          <ArrowLeft :size="16" />
        </button>
        <h2 class="text-base font-bold text-(--color-text-primary) truncate">
          {{ chat.viewingArchived ? 'Arquivadas' : 'Mensagens' }}
        </h2>
      </div>
      <!-- Actions menu (apenas em "Mensagens") -->
      <div v-if="!chat.viewingArchived" ref="menuRef" class="relative">
        <button
          @click.stop="menuOpen = !menuOpen"
          class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
        >
          <Plus :size="18" />
        </button>
        <div
          v-if="menuOpen"
          class="absolute right-0 top-9 z-20 bg-(--color-bg-elevated) border border-(--color-bg-surface) rounded-xl py-1 shadow-xl min-w-[180px]"
        >
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#e2e8f0] hover:bg-[#1e2038] transition-colors"
            @click="openDm"
          >
            <MessageCircle :size="14" />
            DM com amigo
          </button>
          <button
            @click="openCreateGroup"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-surface) transition-colors"
          >
            <Users :size="14" /> Criar grupo
          </button>
        </div>
      </div>
    </div>

    <!-- Search -->
    <div class="px-3 py-2">
      <div class="flex items-center gap-2 bg-(--color-bg-elevated) rounded-xl px-3 py-2">
        <Search :size="14" class="text-(--color-text-muted) flex-shrink-0" />
        <input
          v-model="search"
          type="text"
          placeholder="Buscar conversa…"
          class="flex-1 bg-transparent text-sm text-(--color-text-primary) placeholder-(--color-text-muted) focus:outline-none"
        />
      </div>
    </div>

    <!-- Chip de arquivadas (fixo abaixo da busca) -->
    <button
      v-if="!chat.viewingArchived"
      type="button"
      @click="showArchived"
      class="flex items-center justify-between gap-2 mx-3 mb-2 px-3 py-2.5 rounded-xl bg-(--color-bg-elevated) hover:bg-[#252640] transition-colors"
    >
      <div class="flex items-center gap-2 min-w-0">
        <Archive :size="16" class="text-(--color-accent-amber) flex-shrink-0" />
        <span class="text-sm font-medium text-(--color-text-primary)">Arquivadas</span>
      </div>
      <span class="text-xs px-2 py-0.5 rounded-full bg-(--color-bg-surface) text-(--color-text-secondary) font-mono">
        {{ chat.archivedConversations.length }}
      </span>
    </button>

    <!-- DM requests recebidos (de não-amigos) -->
    <div v-if="!chat.viewingArchived && dmRequests.length > 0" class="mx-3 mb-2">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-(--color-accent-amber)/10 border border-(--color-accent-amber)/30 hover:bg-(--color-accent-amber)/15 transition-colors"
        @click="dmRequestsExpanded = !dmRequestsExpanded"
      >
        <div class="flex items-center gap-2 min-w-0">
          <Mail :size="16" class="text-(--color-accent-amber) flex-shrink-0" />
          <span class="text-sm font-medium text-(--color-accent-amber)">Solicitações de conversa</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-xs px-2 py-0.5 rounded-full bg-(--color-accent-amber) text-black font-bold">
            {{ dmRequests.length }}
          </span>
          <component :is="dmRequestsExpanded ? ChevronUp : ChevronDown" :size="14" class="text-(--color-accent-amber)" />
        </div>
      </button>

      <div v-if="dmRequestsExpanded" class="mt-2 space-y-1.5">
        <div
          v-for="req in dmRequests"
          :key="req.id"
          class="flex items-center gap-2 p-2 rounded-xl bg-(--color-bg-elevated) border border-(--color-bg-card)"
        >
          <RouterLink
            :to="`/profile/${req.senderId}`"
            class="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
            title="Ver perfil"
          >
            <AppAvatar :src="req.senderAvatarUrl ?? null" :name="req.senderName ?? 'Usuário'" :size="36" />
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-semibold text-(--color-text-primary) truncate">{{ req.senderName ?? 'Usuário' }}</p>
              <p class="text-[10px] text-(--color-text-muted)">{{ timeAgo(req.createdAt) }}</p>
            </div>
          </RouterLink>
          <div class="flex items-center gap-1 flex-shrink-0">
            <RouterLink
              :to="`/profile/${req.senderId}`"
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-bg-card) hover:bg-(--color-bg-surface) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
              title="Ver perfil"
            >
              <Eye :size="13" />
            </RouterLink>
            <button
              :disabled="actingRequestId === req.id"
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-accent-amber) hover:brightness-110 text-black transition-all disabled:opacity-50"
              title="Aceitar"
              @click="acceptDmRequest(req)"
            >
              <Check :size="13" />
            </button>
            <button
              :disabled="actingRequestId === req.id"
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-bg-card) hover:bg-(--color-danger)/20 text-(--color-text-secondary) hover:text-(--color-danger) transition-colors disabled:opacity-50"
              title="Recusar"
              @click="rejectDmRequest(req)"
            >
              <X :size="13" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
      <div v-if="chat.loading" class="flex items-center justify-center py-8">
        <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
      </div>

      <p
        v-else-if="filtered.length === 0"
        class="text-sm text-(--color-text-muted) text-center py-8"
      >
        {{ search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda' }}
      </p>

      <ConversationItem
        v-for="conv in filtered"
        :key="conv.id"
        :conversation="conv"
        :is-active="conv.id === activeConversationId"
        @click="selectConversation(conv.id)"
      />
    </div>

    <!-- Create Group Modal -->
    <CreateGroupModal
      v-if="showCreateGroup"
      @close="showCreateGroup = false"
      @created="(id) => { showCreateGroup = false; selectConversation(id) }"
    />
  </div>
</template>
