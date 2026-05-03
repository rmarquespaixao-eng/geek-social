<!-- src/modules/friends/components/FriendItem.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle, MoreHorizontal, UserMinus, UserX, Eye } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'
import { useChat } from '@/modules/chat/composables/useChat'
import { useFloatingChats } from '@/modules/chat/composables/useFloatingChats'
import { useFeatureFlagsStore } from '@/shared/featureFlags/featureFlagsStore'
import type { Friend } from '../types'

const props = defineProps<{ friend: Friend }>()
const emit = defineEmits<{ removed: [id: string] }>()

const router = useRouter()
const store = useFriends()
const chat = useChat()
const floating = useFloatingChats()
const featureFlagsStore = useFeatureFlagsStore()
const chatEnabled = computed(() => featureFlagsStore.isEnabled('module_chat'))
const menuOpen = ref(false)
const openingDm = ref(false)

async function handleOpenDm() {
  if (openingDm.value) return
  openingDm.value = true
  try {
    const convId = await chat.openDm(props.friend.id)
    await floating.openOrRoute(convId, router)
  } catch {
    // ignore - se não for amigo (improvável aqui), apenas vai para a lista
    router.push('/chat')
  } finally {
    openingDm.value = false
  }
}

function onDocumentClick() {
  if (menuOpen.value) menuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'há algum tempo'
  const diff = Date.now() - new Date(lastSeenAt).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'há menos de 1h'
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

async function handleRemove() {
  menuOpen.value = false
  await store.removeFriend(props.friend.id)
  emit('removed', props.friend.id)
}

async function handleBlock() {
  menuOpen.value = false
  await store.blockUser(props.friend.id)
}
</script>

<template>
  <div
    class="group flex items-center gap-3.5 rounded-xl bg-[#1e2038] border border-transparent hover:border-[#252640] px-4 py-3 transition-all cursor-pointer"
    @click="$router.push(`/profile/${friend.id}`)"
  >
    <!-- Avatar + dot de presença -->
    <div class="relative shrink-0">
      <img
        v-if="friend.avatarUrl"
        :src="friend.avatarUrl"
        :alt="friend.displayName"
        class="h-12 w-12 rounded-full object-cover"
      />
      <div
        v-else
        class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#252640] to-[#1a1b2e] text-base font-bold text-[#f59e0b]"
      >
        {{ friend.displayName.charAt(0).toUpperCase() }}
      </div>
      <span
        v-if="chatEnabled"
        :class="[
          'absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#1e2038] transition-all',
          friend.isOnline
            ? 'bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.6)]'
            : 'bg-[#475569]',
        ]"
      />
    </div>

    <!-- Nome + status -->
    <div class="min-w-0 flex-1">
      <p class="truncate text-[14px] font-semibold text-[#e2e8f0] leading-tight">{{ friend.displayName }}</p>
      <p v-if="chatEnabled" class="mt-0.5 text-[11px] flex items-center gap-1">
        <span v-if="friend.isOnline" class="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
        <span :class="friend.isOnline ? 'text-[#22c55e] font-medium' : 'text-[#94a3b8]'">
          {{ friend.isOnline ? 'online agora' : `visto ${formatLastSeen(friend.lastSeenAt)}` }}
        </span>
      </p>
    </div>

    <!-- Ações -->
    <div class="flex items-center gap-1.5" @click.stop>
      <!-- Botão chat (abre DM com este amigo) -->
      <button
        v-if="chatEnabled"
        :disabled="openingDm"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#252640] text-[#94a3b8] hover:bg-[#f59e0b] hover:text-black transition-all disabled:opacity-50"
        title="Enviar mensagem"
        @click="handleOpenDm"
      >
        <MessageCircle :size="16" />
      </button>

      <!-- Menu ⋯ -->
      <div class="relative">
        <button
          class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#252640] text-[#94a3b8] hover:bg-[#2e3050] hover:text-[#e2e8f0] transition-colors"
          @click.stop="menuOpen = !menuOpen"
        >
          <MoreHorizontal :size="16" />
        </button>

        <div
          v-if="menuOpen"
          class="absolute right-0 top-9 z-20 min-w-[170px] rounded-xl border border-[#252640] bg-[#1a1b2e] py-1 shadow-xl"
          @click.stop
          @mouseleave="menuOpen = false"
        >
          <router-link
            :to="`/profile/${friend.id}`"
            class="flex items-center gap-2 px-4 py-2 text-sm text-[#e2e8f0] hover:bg-[#252640] transition-colors"
            @click="menuOpen = false"
          >
            <Eye class="h-4 w-4" />
            Ver perfil
          </router-link>
          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#ef4444] hover:bg-[#252640] transition-colors"
            @click="handleRemove"
          >
            <UserMinus class="h-4 w-4" />
            Remover amigo
          </button>
          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#94a3b8] hover:bg-[#252640] transition-colors"
            @click="handleBlock"
          >
            <UserX class="h-4 w-4" />
            Bloquear
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
