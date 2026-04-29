<script setup lang="ts">
import { computed } from 'vue'
import { Phone, PhoneOff, PhoneMissed } from 'lucide-vue-next'
import type { CallMetadata } from '../types'

const props = defineProps<{
  metadata: CallMetadata
  isOwn: boolean
}>()

const label = computed(() => {
  switch (props.metadata.status) {
    case 'completed': {
      const d = props.metadata.durationSec
      const m = Math.floor(d / 60)
      const s = d % 60
      return `Chamada de vídeo · ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    case 'missed':
      return props.isOwn ? 'Chamada não atendida' : 'Chamada perdida'
    case 'rejected':
      return props.isOwn ? 'Chamada recusada' : 'Você recusou'
    case 'cancelled':
      return 'Chamada cancelada'
    case 'failed':
      return 'Falha na chamada'
  }
})

const Icon = computed(() => {
  if (props.metadata.status === 'completed') return Phone
  if (props.metadata.status === 'missed') return PhoneMissed
  return PhoneOff
})

const iconColor = computed(() => {
  if (props.metadata.status === 'completed') return 'text-green-400'
  if (props.metadata.status === 'missed') return 'text-red-400'
  return 'text-(--color-text-muted)'
})
</script>

<template>
  <div class="flex justify-center my-2">
    <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--color-bg-elevated) border border-white/5 text-xs">
      <component :is="Icon" :class="['w-3.5 h-3.5', iconColor]" />
      <span class="text-(--color-text-secondary)">{{ label }}</span>
    </div>
  </div>
</template>
