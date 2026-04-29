<script setup lang="ts">
import { computed } from 'vue'
import { Hourglass } from 'lucide-vue-next'
import { useChat } from '../composables/useChat'
import type { TemporaryEvent } from '../types'

const props = defineProps<{
  event: TemporaryEvent
  conversationId: string
}>()

const chat = useChat()

const actorName = computed(() => {
  const conv = chat.conversations.find(c => c.id === props.conversationId)
  const actor = conv?.participants.find(p => p.userId === props.event.byUserId)
  return actor?.displayName ?? 'Alguém'
})

const label = computed(() =>
  props.event.enabled
    ? `${actorName.value} ativou o modo temporário`
    : `${actorName.value} desativou o modo temporário`,
)
</script>

<template>
  <div class="flex justify-center my-2">
    <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-(--color-bg-elevated) border border-(--color-accent-amber)/20 text-xs">
      <Hourglass class="w-3.5 h-3.5 text-(--color-accent-amber)" />
      <span class="text-(--color-text-secondary)">{{ label }}</span>
    </div>
  </div>
</template>
