<script setup lang="ts">
import { cn } from '@/lib/utils'
const props = defineProps<{ class?: string; orientation?: 'horizontal' | 'vertical' }>()
</script>
<template>
  <div
    :class="cn(
      props.orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
      'bg-slate-200',
      props.class
    )"
  />
</template>
