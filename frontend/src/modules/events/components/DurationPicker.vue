<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const MIN_MINUTES = 15
const MAX_MINUTES = 24 * 60

const helper = computed(() => {
  const m = props.modelValue
  if (!Number.isFinite(m) || m <= 0) return ''
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}min`
  if (r === 0) return `${h}h`
  return `${h}h ${r}min`
})

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).valueAsNumber
  if (!Number.isFinite(raw)) return
  const clamped = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(raw)))
  emit('update:modelValue', clamped)
}
</script>

<template>
  <label class="flex flex-col gap-1">
    <span class="text-xs font-semibold text-slate-300">Duração (em minutos)</span>
    <input
      type="number"
      :min="MIN_MINUTES"
      :max="MAX_MINUTES"
      step="5"
      :value="modelValue"
      @input="onInput"
      data-testid="duration-picker"
      class="bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
    />
    <span class="text-[11px] text-slate-500">
      {{ helper || `Entre ${MIN_MINUTES} e ${MAX_MINUTES} minutos` }}
    </span>
  </label>
</template>
