<script setup lang="ts">
import { computed } from 'vue'
import { DURATION_MAP, type DurationKey } from '../types'

const props = defineProps<{
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const options: { key: DurationKey; label: string }[] = [
  { key: '1h', label: '1 hora' },
  { key: '2h', label: '2 horas' },
  { key: '3h', label: '3 horas' },
  { key: '4h', label: '4 horas' },
  { key: '6h', label: '6 horas' },
  { key: 'noite', label: 'Noite toda (≈ 6h)' },
  { key: 'dia', label: 'Dia todo (≈ 10h)' },
]

const selectedKey = computed<DurationKey>(() => {
  // Prefer exact key match: if 360 minutes, default to '6h' visual; user can pick 'noite' explicitly
  const entries = Object.entries(DURATION_MAP) as [DurationKey, number][]
  const match = entries.find(([, v]) => v === props.modelValue)
  return match ? match[0] : '2h'
})

function onChange(e: Event) {
  const key = (e.target as HTMLSelectElement).value as DurationKey
  emit('update:modelValue', DURATION_MAP[key])
}
</script>

<template>
  <label class="flex flex-col gap-1">
    <span class="text-xs font-semibold text-slate-300">Duração</span>
    <select
      :value="selectedKey"
      @change="onChange"
      data-testid="duration-picker"
      class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
    >
      <option v-for="opt in options" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
    </select>
  </label>
</template>
