<!-- src/modules/chat/components/TypingIndicator.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { TypingEvent } from '../types'

const props = defineProps<{
  typingUsers: TypingEvent[]
}>()

const label = computed(() => {
  const names = props.typingUsers.map((t) => t.displayName)
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} está digitando…`
  if (names.length === 2) return `${names[0]} e ${names[1]} estão digitando…`
  return `${names[0]} e mais ${names.length - 1} estão digitando…`
})
</script>

<template>
  <div
    v-if="typingUsers.length > 0"
    class="flex items-center gap-2 px-4 py-1 text-xs text-(--color-text-muted)"
  >
    <!-- Animated dots -->
    <span class="flex items-center gap-0.5">
      <span
        v-for="i in 3"
        :key="i"
        class="w-1.5 h-1.5 rounded-full bg-(--color-text-muted) animate-bounce"
        :style="{ animationDelay: `${(i - 1) * 150}ms` }"
      />
    </span>
    <span>{{ label }}</span>
  </div>
</template>
