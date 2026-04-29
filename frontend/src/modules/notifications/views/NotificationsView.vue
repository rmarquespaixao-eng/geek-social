<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { Bell, UserCheck, UserPlus, MessageSquare, Zap, CheckCheck, Gamepad2, AlertTriangle, Trash2, X, HandCoins, Check, ArrowLeftRight, Clock, Mail } from 'lucide-vue-next'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import { useNotifications } from '../composables/useNotifications'
import AppAvatar from '@/shared/ui/AppAvatar.vue'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'

const store = useNotifications()
const router = useRouter()

onMounted(() => {
  store.fetchAll()
  store.init()
})

import { timeAgo } from '@/shared/utils/timeAgo'

function notificationLabel(type: string): string {
  switch (type) {
    case 'friend_request': return 'enviou um pedido de amizade'
    case 'friend_accepted': return 'aceitou seu pedido de amizade'
    case 'post_comment': return 'comentou na sua postagem'
    case 'post_reaction': return 'reagiu à sua postagem'
    case 'steam_import_done': return 'importação da Steam concluída'
    case 'steam_import_partial': return 'importação da Steam concluída com falhas'
    case 'offer_received': return 'fez uma oferta no seu item'
    case 'offer_accepted': return 'aceitou sua oferta — confirme a transação'
    case 'offer_rejected': return 'recusou sua oferta'
    case 'offer_completed': return 'a transação foi concluída'
    case 'offer_cancelled': return 'cancelou a oferta após o aceite'
    case 'offer_expired': return 'sua oferta expirou (sem confirmação por 7 dias)'
    case 'dm_request_received': return 'quer iniciar uma conversa com você'
    default: return 'interagiu com você'
  }
}

function notificationIcon(type: string) {
  switch (type) {
    case 'friend_request': return UserPlus
    case 'friend_accepted': return UserCheck
    case 'post_comment': return MessageSquare
    case 'post_reaction': return Zap
    case 'steam_import_done': return Gamepad2
    case 'steam_import_partial': return AlertTriangle
    case 'offer_received': return HandCoins
    case 'offer_accepted': return Check
    case 'offer_rejected': return X
    case 'offer_completed': return ArrowLeftRight
    case 'offer_cancelled': return X
    case 'offer_expired': return Clock
    case 'dm_request_received': return Mail
    default: return Bell
  }
}

function notificationIconColor(type: string): string {
  switch (type) {
    case 'friend_request': return 'text-[#f59e0b]'
    case 'friend_accepted': return 'text-[#22c55e]'
    case 'post_comment': return 'text-[#60a5fa]'
    case 'post_reaction': return 'text-[#f59e0b]'
    case 'steam_import_done': return 'text-[#22c55e]'
    case 'steam_import_partial': return 'text-[#f59e0b]'
    case 'offer_received': return 'text-[#f59e0b]'
    case 'offer_accepted': return 'text-[#60a5fa]'
    case 'offer_rejected': return 'text-[#ef4444]'
    case 'offer_completed': return 'text-[#22c55e]'
    case 'offer_cancelled': return 'text-[#94a3b8]'
    case 'offer_expired': return 'text-[#94a3b8]'
    case 'dm_request_received': return 'text-[#f59e0b]'
    default: return 'text-[#94a3b8]'
  }
}

const showClearAllConfirm = ref(false)
const clearingAll = ref(false)

async function confirmClearAll() {
  clearingAll.value = true
  try {
    await store.deleteAll()
    showClearAllConfirm.value = false
  } finally {
    clearingAll.value = false
  }
}

async function deleteOne(id: string) {
  await store.deleteOne(id)
}

async function handleClick(id: string, actorId: string, type: string, entityId: string | null) {
  await store.markRead(id)
  if (type === 'steam_import_done' || type === 'steam_import_partial') {
    if (entityId) router.push(`/collections/${entityId}`)
    return
  }
  if (type.startsWith('offer_')) {
    router.push('/trades')
    return
  }
  if (type === 'dm_request_received') {
    router.push('/chat?requests=open')
    return
  }
  if (type === 'friend_request' || type === 'friend_accepted') {
    router.push(`/profile/${actorId}`)
  } else if (entityId) {
    router.push(`/profile/${actorId}`)
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <AppPageHeader :icon="Bell" title="Notificações">
      <template #subtitle>
        <span class="font-semibold text-[#cbd5e1]">{{ store.items.length }}</span>
        <span>{{ store.items.length === 1 ? 'notificação' : 'notificações' }}</span>
        <template v-if="store.unreadCount > 0">
          <span class="text-[#475569]">·</span>
          <span class="font-semibold text-[#f59e0b]">{{ store.unreadCount }}</span>
          <span>{{ store.unreadCount === 1 ? 'não lida' : 'não lidas' }}</span>
        </template>
      </template>
      <template v-if="store.items.length > 0" #action>
        <div class="flex items-center gap-1.5">
          <button
            v-if="store.unreadCount > 0"
            class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#94a3b8] hover:bg-[#1e2038] hover:text-[#e2e8f0] transition-colors"
            @click="store.markAllRead()"
          >
            <CheckCheck :size="15" />
            <span class="hidden sm:inline">Marcar todas como lidas</span>
            <span class="sm:hidden">Marcar lidas</span>
          </button>
          <button
            class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#94a3b8] hover:bg-[#ef4444]/10 hover:text-[#ef4444] transition-colors"
            @click="showClearAllConfirm = true"
          >
            <Trash2 :size="15" />
            <span class="hidden sm:inline">Limpar todas</span>
            <span class="sm:hidden">Limpar</span>
          </button>
        </div>
      </template>
    </AppPageHeader>

    <div class="px-4 py-6 md:px-8">
      <div class="mx-auto max-w-2xl">

      <!-- Loading -->
      <div v-if="store.loading" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-16 animate-pulse rounded-xl bg-[#1e2038]" />
      </div>

      <!-- Empty -->
      <div
        v-else-if="store.items.length === 0"
        class="rounded-xl bg-[#1e2038] px-4 py-12 text-center"
      >
        <Bell class="mx-auto mb-3 h-10 w-10 text-[#475569]" />
        <p class="font-medium text-[#e2e8f0]">Nenhuma notificação</p>
        <p class="mt-1 text-sm text-[#94a3b8]">Você está em dia com tudo.</p>
      </div>

      <!-- List -->
      <div v-else class="space-y-2">
        <div
          v-for="notification in store.items"
          :key="notification.id"
          class="group relative flex items-center gap-3 rounded-xl px-4 py-3 transition-colors cursor-pointer"
          :class="notification.read ? 'bg-[#1e2038] hover:bg-[#252640]' : 'bg-[#252640] hover:bg-[#2a2c4a] ring-1 ring-[#f59e0b]/20'"
          role="button"
          tabindex="0"
          @click="handleClick(notification.id, notification.actorId, notification.type, notification.entityId)"
          @keydown.enter="handleClick(notification.id, notification.actorId, notification.type, notification.entityId)"
        >
          <div class="relative flex-shrink-0">
            <AppAvatar :src="notification.actorAvatar" :name="notification.actorName" :size="40" />
            <div
              class="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#0f0f1a]"
            >
              <component
                :is="notificationIcon(notification.type)"
                :size="12"
                :class="notificationIconColor(notification.type)"
              />
            </div>
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-sm text-[#e2e8f0]">
              <span class="font-semibold">{{ notification.actorName }}</span>
              {{ notificationLabel(notification.type) }}
            </p>
            <p class="text-xs text-[#94a3b8]">{{ timeAgo(notification.createdAt) }}</p>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <div v-if="!notification.read" class="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
            <button
              type="button"
              class="w-7 h-7 rounded-full text-[#94a3b8] hover:bg-[#ef4444]/15 hover:text-[#ef4444] flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Excluir notificação"
              @click.stop="deleteOne(notification.id)"
            >
              <X :size="14" />
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>

    <AppConfirmDialog
      :open="showClearAllConfirm"
      title="Limpar todas as notificações?"
      description="Todas as suas notificações serão removidas permanentemente. Essa ação não pode ser desfeita."
      confirm-label="Limpar todas"
      :loading="clearingAll"
      @cancel="showClearAllConfirm = false"
      @confirm="confirmClearAll"
    />
  </div>
</template>
