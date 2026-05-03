<!-- src/modules/chat/components/IdentityChangedBanner.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ShieldAlert, Check } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import { useIdentityWarnings } from '../composables/useIdentityWarnings'
import type { Conversation } from '../types'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{
  (e: 'verify', peerId: string): void
}>()

const auth = useAuthStore()
const warnings = useIdentityWarnings()
const acking = ref<string | null>(null)
const ackError = ref<string | null>(null)

onMounted(() => {
  warnings.startListening()
  void warnings.refresh()
})

const peers = computed(() =>
  props.conversation.participants.filter((p) => p.userId !== auth.user?.id),
)

const changedPeers = computed(() =>
  peers.value
    .map((peer) => ({ peer, change: warnings.getForPeer(peer.userId) }))
    .filter((entry): entry is { peer: typeof entry.peer; change: NonNullable<typeof entry.change> } =>
      entry.change !== null,
    ),
)

async function ack(peerId: string): Promise<void> {
  if (acking.value) return
  acking.value = peerId
  ackError.value = null
  try {
    await warnings.acknowledge(peerId)
  } catch {
    ackError.value = peerId
  } finally {
    acking.value = null
  }
}
</script>

<template>
  <div v-if="changedPeers.length > 0" class="flex flex-col">
    <div
      v-for="entry in changedPeers"
      :key="entry.peer.userId"
      class="flex items-start gap-2 px-4 py-3 text-xs text-red-200 bg-red-500/10 border-b border-red-500/20"
    >
      <ShieldAlert :size="14" class="mt-0.5 flex-shrink-0 text-red-400" />
      <div class="flex-1 min-w-0">
        <p class="font-semibold">
          A identidade de {{ entry.peer.displayName }} mudou
        </p>
        <p class="text-red-300/80 mt-0.5">
          Pode ser uma reinstalação do app — ou uma tentativa de interceptação. Verifique o número
          de segurança antes de continuar a conversa.
        </p>
        <div class="flex items-center gap-2 mt-2">
          <button
            type="button"
            @click="emit('verify', entry.peer.userId)"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 transition-colors"
          >
            Verificar número
          </button>
          <button
            type="button"
            :disabled="acking === entry.peer.userId"
            @click="ack(entry.peer.userId)"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-red-200 hover:text-red-100 disabled:opacity-50 transition-colors"
          >
            <Check :size="12" />
            <span>{{ acking === entry.peer.userId ? 'Aceitando…' : 'Aceitar nova identidade' }}</span>
          </button>
        </div>
        <p v-if="ackError === entry.peer.userId" class="mt-1 text-red-400">
          Não foi possível aceitar. Tente novamente.
        </p>
      </div>
    </div>
  </div>
</template>
