<script setup lang="ts">
import { computed } from 'vue'
import type { EventType } from '../types'

const props = defineProps<{
  type: EventType
}>()

const meta = computed(() => {
  if (props.type === 'online') {
    return { label: 'Online', icon: '🌐', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' }
  }
  return { label: 'Presencial', icon: '📍', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
})
</script>

<template>
  <span
    :class="['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', meta.cls]"
    :data-testid="`event-type-${type}`"
  >
    <span aria-hidden="true">{{ meta.icon }}</span>
    {{ meta.label }}
  </span>
</template>
