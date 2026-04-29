<template>
  <div
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="relative flex-shrink-0 rounded-full"
  >
    <div class="w-full h-full rounded-full overflow-hidden">
      <img
        v-if="src"
        :src="src"
        :alt="name"
        class="w-full h-full object-cover"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center bg-(--color-bg-elevated) text-(--color-text-secondary) font-semibold"
        :style="{ fontSize: `${Math.floor(size * 0.38)}px` }"
      >
        {{ initials }}
      </div>
    </div>
    <!-- Indicador de status online (fora do overflow-hidden para não ser cortado) -->
    <span
      v-if="showStatus"
      class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-(--color-status-online) border-2 border-(--color-bg-surface)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  src?: string | null
  name: string
  size?: number
  showStatus?: boolean
}>(), {
  src: null,
  size: 36,
  showStatus: false,
})

const initials = computed(() => {
  return props.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
})
</script>
