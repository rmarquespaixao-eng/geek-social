<script setup lang="ts">
import { cn } from '@/lib/utils'

const props = defineProps<{ modelValue?: boolean; disabled?: boolean; class?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="emit('update:modelValue', !modelValue)"
    :class="cn(
      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
      'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      modelValue ? 'bg-indigo-600' : 'bg-slate-200',
      props.class
    )"
  >
    <span
      :class="cn(
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
        modelValue ? 'translate-x-5' : 'translate-x-0'
      )"
    />
  </button>
</template>
