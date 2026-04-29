<script setup lang="ts">
import { computed } from 'vue'
import { Phone } from 'lucide-vue-next'
import { useCall } from '../composables/useCall'
import { useAuthStore } from '@/shared/auth/authStore'
import type { Conversation } from '../types'

const props = defineProps<{ conversation: Conversation }>()
const call = useCall()
const auth = useAuthStore()

const isBlocked = computed(
  () => props.conversation.isBlockedByMe === true || props.conversation.isBlockedByOther === true,
)

const disabled = computed(() => isBlocked.value || call.state !== 'idle')

async function startCall() {
  if (disabled.value) return
  const me = auth.user?.id
  const other = props.conversation.participants.find(p => p.userId !== me)
  if (!other) return
  await call.invite(props.conversation.id, {
    userId: other.userId,
    displayName: other.displayName,
    avatarUrl: other.avatarUrl,
  })
}
</script>

<template>
  <button
    v-if="conversation.type === 'dm'"
    :disabled="disabled"
    @click="startCall"
    title="Iniciar chamada de vídeo"
    class="flex h-8 w-8 items-center justify-center rounded-lg text-(--color-text-secondary) hover:text-(--color-accent-amber) hover:bg-(--color-bg-elevated) transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
  >
    <Phone :size="18" />
  </button>
</template>
