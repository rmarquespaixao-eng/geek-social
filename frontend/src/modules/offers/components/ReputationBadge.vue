<script setup lang="ts">
import { computed } from 'vue'
import type { UserReputation } from '../services/ratingsService'

const props = defineProps<{
  reputation: UserReputation | null
  /** 'sm' shows condensed ★4.8·12; 'md' shows full label */
  size?: 'sm' | 'md'
}>()

const MIN_RATINGS = 3

const hasReputation = computed(() => props.reputation && props.reputation.count >= MIN_RATINGS)
</script>

<template>
  <span
    v-if="hasReputation && reputation"
    class="inline-flex items-center gap-1 text-(--color-accent-amber)"
    :class="size === 'md' ? 'text-[13px]' : 'text-[11px]'"
  >
    <span class="font-bold">★</span>
    <span class="font-semibold">{{ reputation.score.toFixed(1) }}</span>
    <span class="text-(--color-text-muted)">· {{ reputation.count }}</span>
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1 text-(--color-text-muted)"
    :class="size === 'md' ? 'text-[12px]' : 'text-[10px]'"
  >
    Novo na vitrine
  </span>
</template>
