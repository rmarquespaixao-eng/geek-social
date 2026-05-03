<script setup lang="ts">
import { cn } from '@/lib/utils'
const props = defineProps<{ class?: string }>()
</script>
<template>
  <div :class="cn('rounded-lg border border-slate-200 bg-white shadow-sm', props.class)">
    <slot />
  </div>
</template>
