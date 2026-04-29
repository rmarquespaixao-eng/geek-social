<script setup lang="ts">
defineProps<{
  position: number
}>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border bg-purple-500/15 text-purple-400 border-purple-500/30"
    data-testid="waitlist-position-badge"
  >
    Lista de espera · #{{ position }}
  </span>
</template>
