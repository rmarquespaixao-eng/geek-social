<!-- src/modules/friends/components/FriendRequestItem.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'
import type { FriendRequest } from '../types'

const props = defineProps<{ request: FriendRequest }>()
const emit = defineEmits<{ handled: [id: string] }>()

const store = useFriends()
const loading = ref(false)

async function handleAccept() {
  loading.value = true
  try {
    await store.acceptRequest(props.request.id)
    emit('handled', props.request.id)
  } finally {
    loading.value = false
  }
}

async function handleReject() {
  loading.value = true
  try {
    await store.rejectRequest(props.request.id)
    emit('handled', props.request.id)
  } finally {
    loading.value = false
  }
}

import { formatShortDate as formatDate } from '@/shared/utils/timeAgo'
</script>

<template>
  <div class="flex items-center gap-3.5 rounded-xl bg-[#1e2038] border border-[#f59e0b]/15 px-4 py-3 hover:border-[#f59e0b]/30 transition-colors">
    <!-- Avatar -->
    <RouterLink :to="`/profile/${request.senderId}`" class="shrink-0">
      <img
        v-if="request.senderAvatarUrl"
        :src="request.senderAvatarUrl"
        :alt="request.senderName"
        class="h-12 w-12 rounded-full object-cover"
      />
      <div
        v-else
        class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#252640] to-[#1a1b2e] text-base font-bold text-[#f59e0b]"
      >
        {{ request.senderName.charAt(0).toUpperCase() }}
      </div>
    </RouterLink>

    <!-- Info -->
    <div class="min-w-0 flex-1">
      <p class="truncate text-[14px] font-semibold text-[#e2e8f0] leading-tight">{{ request.senderName }}</p>
      <p class="mt-0.5 text-[11px] text-[#94a3b8]">Te enviou em {{ formatDate(request.createdAt) }}</p>
    </div>

    <!-- Ações -->
    <div class="flex items-center gap-2">
      <button
        :disabled="loading"
        class="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-black text-[12px] font-semibold disabled:opacity-50 transition-colors active:scale-95"
        @click="handleAccept"
      >
        <Check :size="14" :stroke-width="2.5" />
        <span class="hidden sm:inline">Aceitar</span>
      </button>
      <button
        :disabled="loading"
        class="flex h-9 w-9 items-center justify-center rounded-lg bg-[#252640] text-[#94a3b8] hover:bg-[#ef4444]/20 hover:text-[#ef4444] disabled:opacity-50 transition-colors"
        title="Rejeitar"
        @click="handleReject"
      >
        <X :size="16" />
      </button>
    </div>
  </div>
</template>
