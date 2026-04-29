<template>
  <label
    class="flex items-center gap-3 px-4 py-3 border-b border-(--color-bg-elevated) last:border-b-0 transition-colors"
    :class="alreadyInCollection
      ? 'opacity-50 cursor-not-allowed bg-(--color-bg-elevated)/20'
      : 'hover:bg-(--color-bg-elevated)/40 cursor-pointer'"
  >
    <input
      type="checkbox"
      :checked="selected"
      :disabled="alreadyInCollection"
      class="accent-(--color-accent-amber) scale-110 disabled:cursor-not-allowed"
      @change="!alreadyInCollection && $emit('toggle')"
    />
    <img
      :src="coverUrl"
      :alt="game.name"
      class="w-10 h-14 rounded object-cover bg-(--color-bg-elevated)"
      :class="alreadyInCollection ? 'grayscale' : ''"
      @error="onCoverError"
    />
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-(--color-text-primary) truncate">{{ game.name }}</p>
      <p class="text-xs text-(--color-text-muted)">
        {{ playtimeText }}
      </p>
    </div>
    <span
      v-if="alreadyInCollection"
      class="flex items-center gap-1 text-xs text-(--color-status-online) bg-(--color-status-online)/15 px-2 py-1 rounded font-medium"
    >
      <Check :size="12" />
      Já importado
    </span>
  </label>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check } from 'lucide-vue-next'
import type { SteamGame } from '../services/steamService'

const props = defineProps<{
  game: SteamGame
  selected: boolean
  alreadyInCollection: boolean
}>()

defineEmits<{ (e: 'toggle'): void }>()

const fallbackUsed = ref(false)

const coverUrl = computed(() => {
  if (fallbackUsed.value) {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${props.game.appId}/header.jpg`
  }
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${props.game.appId}/library_600x900_2x.jpg`
})

function onCoverError() {
  fallbackUsed.value = true
}

const playtimeText = computed(() => {
  const m = props.game.playtimeForever
  if (m === 0) return 'Nunca jogado'
  const hours = Math.floor(m / 60)
  const mins = m % 60
  if (hours === 0) return `${mins}min`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}min`
})
</script>
