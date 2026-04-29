<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, Check, Search, Users } from 'lucide-vue-next'
import { useChat } from '../composables/useChat'
import { useAuthStore } from '@/shared/auth/authStore'
import AppButton from '@/shared/ui/AppButton.vue'

const props = defineProps<{
  title?: string
  confirmLabel?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', conversationIds: string[]): void
}>()

const chat = useChat()
const auth = useAuthStore()
const search = ref('')
const selected = ref<Set<string>>(new Set())

onMounted(async () => {
  if (chat.conversations.length === 0) {
    await chat.fetchConversations()
  }
})

const eligibleConversations = computed(() =>
  chat.conversations.filter(c => !c.isBlockedByMe && !c.isBlockedByOther)
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = eligibleConversations.value
  if (!q) return list
  return list.filter(c => {
    const title = c.type === 'group'
      ? (c.name ?? '')
      : (c.participants.find(p => p.userId !== auth.user?.id)?.displayName ?? '')
    return title.toLowerCase().includes(q)
  })
})

function toggle(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
  selected.value = new Set(selected.value)
}

function titleFor(conv: typeof chat.conversations[number]): string {
  if (conv.type === 'group') return conv.name ?? 'Grupo'
  return conv.participants.find(p => p.userId !== auth.user?.id)?.displayName ?? 'Usuário'
}

function avatarFor(conv: typeof chat.conversations[number]): string | null {
  if (conv.type === 'group') return conv.avatarUrl
  return conv.participants.find(p => p.userId !== auth.user?.id)?.avatarUrl ?? null
}

function confirm() {
  if (selected.value.size === 0 || props.loading) return
  emit('confirm', Array.from(selected.value))
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md bg-(--color-bg-surface) rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div class="flex items-center justify-between px-5 py-4 border-b border-(--color-bg-elevated)">
          <h2 class="text-base font-bold text-(--color-text-primary)">{{ title ?? 'Compartilhar' }}</h2>
          <button
            @click="emit('close')"
            class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="px-4 pt-3">
          <div class="relative">
            <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-muted)" />
            <input
              v-model="search"
              type="text"
              placeholder="Buscar conversa..."
              class="w-full pl-9 pr-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) text-sm placeholder-(--color-text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/20"
            />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-3 py-3">
          <div v-if="chat.loading" class="flex items-center justify-center py-8">
            <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
          </div>

          <div v-else-if="filtered.length === 0" class="text-sm text-(--color-text-muted) text-center py-8">
            Nenhuma conversa encontrada.
          </div>

          <div v-else class="space-y-1">
            <button
              v-for="conv in filtered"
              :key="conv.id"
              type="button"
              @click="toggle(conv.id)"
              :class="[
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left',
                selected.has(conv.id)
                  ? 'bg-(--color-accent-amber)/10 hover:bg-(--color-accent-amber)/15'
                  : 'hover:bg-(--color-bg-elevated)',
              ]"
            >
              <img
                v-if="avatarFor(conv)"
                :src="avatarFor(conv)!"
                :alt="titleFor(conv)"
                class="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
              <div
                v-else-if="conv.type === 'group'"
                class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0"
              >
                <Users :size="14" class="text-slate-300" />
              </div>
              <div
                v-else
                class="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-200 flex-shrink-0"
              >
                {{ titleFor(conv).charAt(0).toUpperCase() }}
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-sm text-(--color-text-primary) truncate">{{ titleFor(conv) }}</p>
                <p v-if="conv.type === 'group'" class="text-xs text-(--color-text-muted)">
                  Grupo · {{ conv.participants.length }} participantes
                </p>
              </div>

              <div
                :class="[
                  'flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center',
                  selected.has(conv.id)
                    ? 'bg-(--color-accent-amber) border-(--color-accent-amber)'
                    : 'border-(--color-text-muted)',
                ]"
              >
                <Check v-if="selected.has(conv.id)" :size="14" class="text-[#0f0f1a]" />
              </div>
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 px-5 py-4 border-t border-(--color-bg-elevated)">
          <p class="text-xs text-(--color-text-muted)">
            {{ selected.size }} selecionada{{ selected.size === 1 ? '' : 's' }}
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
              @click="emit('close')"
            >
              Cancelar
            </button>
            <AppButton
              variant="primary"
              :loading="loading"
              :disabled="selected.size === 0"
              @click="confirm"
            >
              {{ confirmLabel ?? 'Enviar' }}
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
