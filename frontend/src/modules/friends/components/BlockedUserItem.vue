<!-- src/modules/friends/components/BlockedUserItem.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { ShieldOff } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'
import type { BlockedUser } from '../types'

const props = defineProps<{ user: BlockedUser }>()
const emit = defineEmits<{ unblocked: [id: string] }>()

const store = useFriends()
const loading = ref(false)

async function handleUnblock() {
  loading.value = true
  try {
    await store.unblockUser(props.user.id)
    emit('unblocked', props.user.id)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-3.5 rounded-xl bg-[#1e2038] border border-[#252640] px-4 py-3">
    <!-- Avatar -->
    <div class="shrink-0">
      <img
        v-if="user.avatarUrl"
        :src="user.avatarUrl"
        :alt="user.displayName"
        class="h-12 w-12 rounded-full object-cover opacity-50 grayscale"
      />
      <div
        v-else
        class="flex h-12 w-12 items-center justify-center rounded-full bg-[#252640] text-base font-bold text-[#94a3b8]"
      >
        {{ user.displayName.charAt(0).toUpperCase() }}
      </div>
    </div>

    <!-- Nome -->
    <div class="min-w-0 flex-1">
      <p class="truncate text-[14px] font-semibold text-[#94a3b8] leading-tight">{{ user.displayName }}</p>
      <p class="mt-0.5 text-[11px] text-[#475569]">Você bloqueou este usuário</p>
    </div>

    <!-- Desbloquear -->
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-lg bg-[#252640] px-3 py-2 text-[12px] font-semibold text-[#94a3b8] hover:bg-[#f59e0b] hover:text-black disabled:opacity-50 transition-all active:scale-95"
      @click="handleUnblock"
    >
      <ShieldOff :size="14" />
      Desbloquear
    </button>
  </div>
</template>
