<script setup lang="ts">
import { computed } from 'vue'
import type { EventStatus } from '../types'

const props = defineProps<{
  status: EventStatus
}>()

const meta = computed(() => {
  switch (props.status) {
    case 'scheduled':
      return { label: 'Agendado', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
    case 'cancelled':
      return { label: 'Cancelado', cls: 'bg-red-500/15 text-red-400 border-red-500/30' }
    case 'ended':
      return { label: 'Encerrado', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' }
  }
})
</script>

<template>
  <span
    :class="['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', meta.cls]"
    :data-testid="`event-status-${status}`"
  >
    {{ meta.label }}
  </span>
</template>
