<!-- src/modules/chat/components/CreateGroupModal.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { X, Check, Users } from 'lucide-vue-next'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { useChat } from '../composables/useChat'
import * as chatService from '../services/chatService'

const MAX_MEMBERS = 14

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', conversationId: string): void
}>()

const friendsStore = useFriends()
const chat = useChat()

const groupName = ref('')
const description = ref('')
const selectedUserIds = ref<Set<string>>(new Set())
const creating = ref(false)
const error = ref<string | null>(null)

const selectedCount = computed(() => selectedUserIds.value.size)

function toggleUser(userId: string) {
  const set = new Set(selectedUserIds.value)
  if (set.has(userId)) {
    set.delete(userId)
  } else {
    if (set.size >= MAX_MEMBERS) return
    set.add(userId)
  }
  selectedUserIds.value = set
}

async function create() {
  if (!groupName.value.trim() || selectedUserIds.value.size < 1 || creating.value) return

  creating.value = true
  error.value = null

  try {
    const conversationId = await chat.createGroup({
      name: groupName.value.trim(),
      description: description.value.trim() || undefined,
    })

    // Invite each selected user
    const conversation = chat.conversations.find((c) => c.id === conversationId)
    if (conversation) {
      const invites = Array.from(selectedUserIds.value).map((uid) =>
        chatService.inviteMember(conversation.id, uid),
      )
      await Promise.all(invites)
    }

    emit('created', conversationId)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Erro ao criar grupo'
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  if (friendsStore.friends.length === 0) {
    await friendsStore.fetchAll()
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md bg-(--color-bg-surface) rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-(--color-bg-elevated)">
          <h2 class="text-base font-bold text-(--color-text-primary)">Criar grupo</h2>
          <button
            @click="emit('close')"
            class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
          >
            <X :size="18" />
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <!-- Group name -->
          <div>
            <label class="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
              Nome do grupo
            </label>
            <input
              v-model="groupName"
              type="text"
              placeholder="Ex: Jogadores de RPG"
              maxlength="50"
              class="w-full bg-(--color-bg-elevated) text-sm text-(--color-text-primary) placeholder-(--color-text-muted) rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-(--color-accent-amber)/50"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-xs text-[#94a3b8] mb-1.5">Descrição (opcional)</label>
            <textarea
              v-model="description"
              rows="2"
              maxlength="300"
              placeholder="Sobre o que é esse grupo?"
              class="w-full bg-[#0f0f1a] text-[#e2e8f0] text-sm placeholder-[#475569] rounded-lg px-3 py-2.5 resize-none outline-none focus:ring-1 focus:ring-[#f59e0b]"
            />
          </div>

          <!-- Friends list -->
          <div>
            <label class="block text-xs font-medium text-(--color-text-secondary) mb-1.5">
              Adicionar amigos
              <span class="ml-1 text-(--color-text-muted)">({{ selectedCount }}/{{ MAX_MEMBERS }} selecionados)</span>
            </label>

            <div v-if="friendsStore.loading" class="flex items-center justify-center py-6">
              <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
            </div>

            <div
              v-else-if="friendsStore.friends.length === 0"
              class="text-sm text-(--color-text-muted) text-center py-6"
            >
              Você não tem amigos para adicionar.
            </div>

            <div v-else class="space-y-1 max-h-48 overflow-y-auto">
              <button
                v-for="friend in friendsStore.friends"
                :key="friend.id"
                @click="toggleUser(friend.id)"
                :class="[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left',
                  selectedUserIds.has(friend.id)
                    ? 'bg-(--color-accent-amber)/10'
                    : 'hover:bg-(--color-bg-elevated)',
                ]"
              >
                <!-- Avatar -->
                <img
                  v-if="friend.avatarUrl"
                  :src="friend.avatarUrl"
                  :alt="friend.displayName"
                  class="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
                <div
                  v-else
                  class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-200 flex-shrink-0"
                >
                  {{ friend.displayName.charAt(0).toUpperCase() }}
                </div>

                <span
                  :class="[
                    'flex-1 text-sm truncate',
                    selectedUserIds.has(friend.id)
                      ? 'text-(--color-accent-amber) font-medium'
                      : 'text-(--color-text-primary)',
                  ]"
                >
                  {{ friend.displayName }}
                </span>

                <!-- Check -->
                <div
                  :class="[
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                    selectedUserIds.has(friend.id)
                      ? 'bg-(--color-accent-amber) border-(--color-accent-amber)'
                      : 'border-(--color-text-muted)',
                  ]"
                >
                  <Check
                    v-if="selectedUserIds.has(friend.id)"
                    :size="12"
                    class="text-[#0f0f1a]"
                  />
                </div>
              </button>
            </div>
          </div>

          <!-- Error -->
          <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-(--color-bg-elevated)">
          <button
            :disabled="!groupName.trim() || selectedCount < 1 || creating"
            @click="create"
            class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-(--color-accent-amber) text-[#0f0f1a] font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Users :size="16" />
            {{ creating ? 'Criando…' : 'Criar grupo' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
