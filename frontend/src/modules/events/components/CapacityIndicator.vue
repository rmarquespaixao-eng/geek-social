<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  confirmed: number
  capacity: number | null
  waitlist?: number
}>()

const display = computed(() => {
  if (props.capacity == null) {
    return `${props.confirmed} inscritos · sem limite`
  }
  return `${props.confirmed}/${props.capacity} vagas`
})

const waitlistText = computed(() => {
  const w = props.waitlist ?? 0
  if (w === 0) return null
  return `${w} na lista`
})

const isFull = computed(() => props.capacity != null && props.confirmed >= props.capacity)
</script>

<template>
  <div class="flex items-center gap-2 text-xs" data-testid="capacity-indicator">
    <span aria-hidden="true">👥</span>
    <span class="font-mono" :class="isFull ? 'text-amber-400' : 'text-slate-300'">{{ display }}</span>
    <span v-if="waitlistText" class="text-slate-500">·</span>
    <span v-if="waitlistText" class="text-slate-400 font-mono">{{ waitlistText }}</span>
  </div>
</template>
