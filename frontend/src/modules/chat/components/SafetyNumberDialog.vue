<!-- src/modules/chat/components/SafetyNumberDialog.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Shield, Copy, Check, AlertCircle, X } from 'lucide-vue-next'
import AppModal from '@/shared/ui/AppModal.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { api } from '@/shared/http/api'
import { getActiveSignalSession } from '@/shared/crypto/signal/SignalClient'
import type { Conversation, ConversationMember } from '../types'

const props = defineProps<{
  conversation: Conversation
  initialPeerId?: string
}>()

const emit = defineEmits<{ close: [] }>()

const auth = useAuthStore()

const otherDmUser = computed<ConversationMember | null>(() => {
  if (props.conversation.type !== 'dm') return null
  return props.conversation.participants.find((p) => p.userId !== auth.user?.id) ?? null
})

const groupPeers = computed<ConversationMember[]>(() => {
  if (props.conversation.type !== 'group') return []
  return props.conversation.participants.filter((p) => p.userId !== auth.user?.id)
})

const selectedPeerId = ref<string | null>(null)

const selectedPeer = computed<ConversationMember | null>(() => {
  if (props.conversation.type === 'dm') return otherDmUser.value
  if (!selectedPeerId.value) return null
  return groupPeers.value.find((p) => p.userId === selectedPeerId.value) ?? null
})

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; displayable: string }

const state = ref<State>({ kind: 'idle' })
const copied = ref(false)

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function loadFor(peerId: string) {
  state.value = { kind: 'loading' }
  copied.value = false
  const session = getActiveSignalSession()
  if (!session) {
    state.value = {
      kind: 'error',
      message: 'Criptografia ainda não inicializada. Tente novamente em instantes.',
    }
    return
  }
  try {
    const { data } = await api.get<{ userId: string; identityKey: string; registrationId: number }>(
      `/crypto/identity/${peerId}`,
    )
    const identityKey = b64ToBytes(data.identityKey)
    const sn = session.generateSafetyNumber(peerId, identityKey)
    state.value = { kind: 'ready', displayable: sn.displayable }
  } catch (e: any) {
    if (e?.response?.status === 404) {
      state.value = {
        kind: 'error',
        message: 'Esse usuário ainda não publicou as chaves de criptografia.',
      }
    } else {
      state.value = {
        kind: 'error',
        message: 'Falha ao carregar o número de segurança. Tente novamente.',
      }
    }
  }
}

const formattedGroups = computed<string[]>(() => {
  if (state.value.kind !== 'ready') return []
  const digits = state.value.displayable.replace(/\s+/g, '')
  const groups: string[] = []
  for (let i = 0; i < digits.length; i += 5) {
    groups.push(digits.slice(i, i + 5))
  }
  return groups
})

function selectPeer(peerId: string) {
  selectedPeerId.value = peerId
  loadFor(peerId)
}

async function copy() {
  if (state.value.kind !== 'ready') return
  try {
    await navigator.clipboard.writeText(state.value.displayable)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    /* clipboard indisponível */
  }
}

onMounted(() => {
  if (props.conversation.type === 'dm' && otherDmUser.value) {
    selectedPeerId.value = otherDmUser.value.userId
    loadFor(otherDmUser.value.userId)
  } else if (props.conversation.type === 'group' && props.initialPeerId) {
    selectPeer(props.initialPeerId)
  }
})
</script>

<template>
  <AppModal size="md" @close="emit('close')">
    <div class="flex items-center justify-between px-5 h-14 border-b border-[#252640]">
      <div class="flex items-center gap-2">
        <Shield :size="18" class="text-(--color-accent-amber)" />
        <h3 class="text-base font-bold text-(--color-text-primary)">Verificar identidade</h3>
      </div>
      <button
        @click="emit('close')"
        class="p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary)"
        title="Fechar"
      >
        <X :size="18" />
      </button>
    </div>

    <div class="px-5 py-4 space-y-4">
      <!-- Group: peer selector -->
      <div v-if="conversation.type === 'group'">
        <label class="text-xs text-(--color-text-muted) mb-2 block">Selecione um membro:</label>
        <div class="space-y-1 max-h-48 overflow-y-auto">
          <button
            v-for="p in groupPeers"
            :key="p.userId"
            type="button"
            @click="selectPeer(p.userId)"
            :class="[
              'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors',
              selectedPeerId === p.userId
                ? 'bg-(--color-accent-amber)/10 ring-1 ring-(--color-accent-amber)'
                : 'hover:bg-(--color-bg-elevated)',
            ]"
          >
            <img
              v-if="p.avatarUrl"
              :src="p.avatarUrl"
              :alt="p.displayName"
              class="w-7 h-7 rounded-full object-cover flex-shrink-0"
            />
            <div
              v-else
              class="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-[10px] font-semibold text-slate-200 flex-shrink-0"
            >
              {{ p.displayName.charAt(0).toUpperCase() }}
            </div>
            <span class="text-sm text-(--color-text-primary) truncate">{{ p.displayName }}</span>
          </button>
        </div>
      </div>

      <!-- DM: peer header -->
      <div v-else-if="otherDmUser" class="flex items-center gap-3">
        <img
          v-if="otherDmUser.avatarUrl"
          :src="otherDmUser.avatarUrl"
          :alt="otherDmUser.displayName"
          class="w-10 h-10 rounded-full object-cover flex-shrink-0"
        />
        <div
          v-else
          class="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200 flex-shrink-0"
        >
          {{ otherDmUser.displayName.charAt(0).toUpperCase() }}
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-(--color-text-primary) truncate">
            {{ otherDmUser.displayName }}
          </p>
          <p class="text-xs text-(--color-text-muted)">Conversa direta</p>
        </div>
      </div>

      <!-- States -->
      <div v-if="state.kind === 'idle'" class="text-center py-8 text-(--color-text-muted) text-sm">
        Selecione um membro para ver o número de segurança.
      </div>

      <div v-else-if="state.kind === 'loading'" class="flex justify-center py-8">
        <div class="w-6 h-6 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
      </div>

      <div
        v-else-if="state.kind === 'error'"
        class="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 text-red-300 text-sm"
      >
        <AlertCircle :size="16" class="mt-0.5 flex-shrink-0" />
        <p>{{ state.message }}</p>
      </div>

      <template v-else-if="state.kind === 'ready'">
        <div class="bg-(--color-bg-elevated) rounded-xl p-4">
          <div
            class="grid grid-cols-4 gap-2 font-mono text-sm tracking-wider text-(--color-text-primary) text-center"
          >
            <span v-for="(group, i) in formattedGroups" :key="i">{{ group }}</span>
          </div>
        </div>

        <p class="text-xs text-(--color-text-muted) leading-relaxed">
          Compare estes números com {{ selectedPeer?.displayName ?? 'a outra pessoa' }} por um canal
          confiável (chamada, pessoalmente). Se forem iguais nos dois lados, ninguém pode ler ou
          interceptar suas mensagens.
        </p>

        <button
          type="button"
          @click="copy"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-sm text-(--color-text-primary) transition-colors"
        >
          <component :is="copied ? Check : Copy" :size="14" />
          {{ copied ? 'Copiado!' : 'Copiar número' }}
        </button>
      </template>
    </div>
  </AppModal>
</template>
