<!-- src/modules/chat/components/DmRequestBanner.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { acceptDmRequest, rejectDmRequest } from '../services/chatService'
import type { DmRequest } from '../types'

const props = defineProps<{
  dmRequest: DmRequest
  senderName: string
}>()

const emit = defineEmits<{
  (e: 'accepted', conversationId: string): void
  (e: 'rejected'): void
}>()

const loading = ref(false)
const error = ref('')

async function accept() {
  loading.value = true
  error.value = ''
  try {
    const conv = await acceptDmRequest(props.dmRequest.id)
    emit('accepted', conv.conversationId)
  } catch {
    error.value = 'Erro ao aceitar pedido. Tente novamente.'
  } finally {
    loading.value = false
  }
}

async function reject() {
  loading.value = true
  error.value = ''
  try {
    await rejectDmRequest(props.dmRequest.id)
    emit('rejected')
  } catch {
    error.value = 'Erro ao rejeitar pedido. Tente novamente.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-4 my-2 px-4 py-3 rounded-xl bg-(--color-bg-elevated) border border-(--color-bg-surface)">
    <p class="text-sm text-(--color-text-secondary) mb-3">
      <span class="font-semibold text-(--color-text-primary)">{{ senderName }}</span>
      quer iniciar uma conversa com você.
    </p>
    <div class="flex items-center gap-2">
      <button
        :disabled="loading"
        @click="accept"
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-(--color-accent-amber) text-[#0f0f1a] rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <Check :size="14" /> Aceitar
      </button>
      <button
        :disabled="loading"
        @click="reject"
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors disabled:opacity-50"
      >
        <X :size="14" /> Recusar
      </button>
    </div>
    <p v-if="error" class="text-xs text-[#ef4444] mt-1">{{ error }}</p>
  </div>
</template>
