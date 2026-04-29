<template>
  <span
    v-if="count > 0"
    :class="[
      'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white',
      variant === 'danger' ? 'bg-(--color-danger)' : 'bg-(--color-accent-amber)',
    ]"
  >
    {{ count > 99 ? '99+' : count }}
  </span>
</template>

<script setup lang="ts">
defineProps<{
  count: number
  variant?: 'danger' | 'amber'
}>()
</script>
