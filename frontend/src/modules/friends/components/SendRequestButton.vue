<!-- src/modules/friends/components/SendRequestButton.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { UserPlus, Check, Clock, ShieldOff, UserMinus, X } from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'

const props = defineProps<{ userId: string }>()
const emit = defineEmits<{ statusChanged: [] }>()

const store = useFriends()
const loading = ref(false)

// Derivar estado a partir do store
const isFriend = computed(() =>
  store.friends.some((f) => f.id === props.userId)
)
const requestSent = computed(() =>
  store.sentRequests.find((r) => r.receiverId === props.userId) ?? null
)
const requestReceived = computed(() =>
  store.receivedRequests.find((r) => r.senderId === props.userId)
)
const isBlocked = computed(() =>
  store.blockedUsers.some((b) => b.id === props.userId)
)

async function handleAdd() {
  loading.value = true
  try {
    await store.sendRequest(props.userId)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleAccept() {
  if (!requestReceived.value) return
  loading.value = true
  try {
    await store.acceptRequest(requestReceived.value.id)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleReject() {
  if (!requestReceived.value) return
  loading.value = true
  try {
    await store.rejectRequest(requestReceived.value.id)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleRemove() {
  loading.value = true
  try {
    await store.removeFriend(props.userId)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleCancel() {
  if (!requestSent.value) return
  loading.value = true
  try {
    await store.cancelRequest(requestSent.value.id)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}

async function handleUnblock() {
  loading.value = true
  try {
    await store.unblockUser(props.userId)
    emit('statusChanged')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- Bloqueado -->
  <div v-if="isBlocked" class="flex items-center gap-2">
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl border border-[#475569]/50 px-4 py-2 text-sm font-medium text-[#94a3b8] hover:border-[#f59e0b]/50 hover:text-[#f59e0b] disabled:opacity-50 transition-colors"
      @click="handleUnblock"
    >
      <ShieldOff class="h-4 w-4" />
      Desbloquear
    </button>
  </div>

  <!-- Pedido recebido desse usuário -->
  <div v-else-if="requestReceived" class="flex items-center gap-2">
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl bg-[#22c55e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16a34a] disabled:opacity-50 transition-colors"
      @click="handleAccept"
    >
      <Check class="h-4 w-4" />
      Aceitar
    </button>
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl border border-[#ef4444]/40 px-4 py-2 text-sm font-medium text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-50 transition-colors"
      @click="handleReject"
    >
      Rejeitar
    </button>
  </div>

  <!-- Já é amigo -->
  <div v-else-if="isFriend" class="flex items-center gap-2">
    <button
      class="flex cursor-default items-center gap-1.5 rounded-xl bg-[#252640] px-4 py-2 text-sm font-medium text-[#22c55e]"
    >
      <Check class="h-4 w-4" />
      Amigo
    </button>
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl border border-[#ef4444]/40 px-3 py-2 text-sm text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-50 transition-colors"
      title="Remover amigo"
      @click="handleRemove"
    >
      <UserMinus class="h-4 w-4" />
    </button>
  </div>

  <!-- Pedido enviado (aguardando) -->
  <div v-else-if="requestSent" class="flex items-center gap-2">
    <button
      class="flex cursor-default items-center gap-1.5 rounded-xl bg-[#252640] px-4 py-2 text-sm font-medium text-[#94a3b8]"
    >
      <Clock class="h-4 w-4" />
      Pedido enviado
    </button>
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl border border-[#ef4444]/40 px-3 py-2 text-sm text-[#ef4444] hover:bg-[#ef4444]/10 disabled:opacity-50 transition-colors"
      title="Cancelar pedido"
      @click="handleCancel"
    >
      <X class="h-4 w-4" />
    </button>
  </div>

  <!-- Sem relacionamento -->
  <div v-else>
    <button
      :disabled="loading"
      class="flex items-center gap-1.5 rounded-xl bg-[#f59e0b] px-4 py-2 text-sm font-semibold text-[#0f0f1a] hover:bg-[#d97706] disabled:opacity-50 transition-colors"
      @click="handleAdd"
    >
      <UserPlus class="h-4 w-4" />
      Adicionar amigo
    </button>
  </div>
</template>
