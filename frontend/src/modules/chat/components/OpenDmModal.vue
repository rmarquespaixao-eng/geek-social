<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { X, MessageCircle } from 'lucide-vue-next'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { useChat } from '../composables/useChat'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'opened', conversationId: string): void
}>()

const friendsStore = useFriends()
const chat = useChat()

const opening = ref<string | null>(null)
const error = ref<string | null>(null)

async function openWith(friendId: string) {
  if (opening.value) return
  opening.value = friendId
  error.value = null
  try {
    const convId = await chat.openDm(friendId)
    emit('opened', convId)
  } catch (e: any) {
    error.value = e?.response?.data?.error === 'NOT_FRIENDS'
      ? 'Esta pessoa não é mais sua amiga.'
      : 'Não foi possível abrir a conversa.'
  } finally {
    opening.value = null
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
        <div class="flex items-center justify-between px-5 py-4 border-b border-(--color-bg-elevated)">
          <h2 class="text-base font-bold text-(--color-text-primary)">Nova mensagem</h2>
          <button
            @click="emit('close')"
            class="p-1.5 rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
          >
            <X :size="18" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-3 py-3">
          <p class="px-2 mb-2 text-xs font-medium text-(--color-text-secondary)">
            Escolha um amigo para conversar
          </p>

          <div v-if="friendsStore.loading" class="flex items-center justify-center py-8">
            <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
          </div>

          <div
            v-else-if="friendsStore.friends.length === 0"
            class="text-sm text-(--color-text-muted) text-center py-8"
          >
            Você ainda não tem amigos para conversar.
          </div>

          <div v-else class="space-y-1">
            <button
              v-for="friend in friendsStore.friends"
              :key="friend.id"
              :disabled="opening !== null"
              @click="openWith(friend.id)"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-(--color-bg-elevated) transition-colors text-left disabled:opacity-50"
            >
              <img
                v-if="friend.avatarUrl"
                :src="friend.avatarUrl"
                :alt="friend.displayName"
                class="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
              <div
                v-else
                class="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-200 flex-shrink-0"
              >
                {{ friend.displayName.charAt(0).toUpperCase() }}
              </div>

              <span class="flex-1 text-sm text-(--color-text-primary) truncate">
                {{ friend.displayName }}
              </span>

              <MessageCircle
                v-if="opening !== friend.id"
                :size="16"
                class="text-(--color-text-muted)"
              />
              <div
                v-else
                class="w-4 h-4 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin"
              />
            </button>
          </div>

          <p v-if="error" class="mt-3 px-2 text-sm text-red-400">{{ error }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
