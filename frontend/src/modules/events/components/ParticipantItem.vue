<script setup lang="ts">
import { computed } from 'vue'
import type { EventParticipant } from '../types'

const props = defineProps<{
  participant: EventParticipant
}>()

const initial = computed(() => props.participant.userName.charAt(0).toUpperCase())

const statusLabel = computed(() => {
  switch (props.participant.status) {
    case 'confirmed':
      return { text: 'Confirmado', cls: 'text-emerald-400' }
    case 'subscribed':
      return { text: 'Inscrito', cls: 'text-sky-400' }
    case 'waitlist':
      return { text: `Lista #${props.participant.waitlistPosition ?? '?'}`, cls: 'text-purple-400' }
    case 'left':
      return { text: 'Saiu', cls: 'text-slate-500' }
  }
})
</script>

<template>
  <RouterLink
    :to="`/profile/${participant.userId}`"
    class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/40 transition-colors"
    data-testid="participant-item"
  >
    <img
      v-if="participant.userAvatarUrl"
      :src="participant.userAvatarUrl"
      :alt="participant.userName"
      class="w-9 h-9 rounded-full object-cover"
    />
    <div
      v-else
      class="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-300"
    >
      {{ initial }}
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold text-slate-200 truncate">{{ participant.userName }}</p>
      <p :class="['text-xs', statusLabel.cls]">{{ statusLabel.text }}</p>
    </div>
  </RouterLink>
</template>
