<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle } from 'lucide-vue-next'
import { useChat } from '@/modules/chat/composables/useChat'
import { useFloatingChats } from '@/modules/chat/composables/useFloatingChats'
import AppAvatar from '@/shared/ui/AppAvatar.vue'

const props = defineProps<{
  friend: { id: string; displayName: string; avatarUrl: string | null }
}>()

const router = useRouter()
const chat = useChat()
const floating = useFloatingChats()
const opening = ref(false)

async function openDm(e: MouseEvent) {
  e.preventDefault()
  if (opening.value) return
  opening.value = true
  try {
    const convId = await chat.openDm(props.friend.id)
    await floating.openOrRoute(convId, router)
  } finally {
    opening.value = false
  }
}

function viewProfile() {
  router.push(`/profile/${props.friend.id}`)
}
</script>

<template>
  <div
    class="group relative flex flex-col items-center gap-2 p-3 rounded-xl bg-[#1e2038] border border-[#252640] hover:border-[#f59e0b]/40 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#f59e0b]/10"
    @click="viewProfile"
  >
    <AppAvatar :src="friend.avatarUrl" :name="friend.displayName" :size="56" />
    <p class="w-full text-center text-[12px] font-semibold text-[#e2e8f0] truncate leading-tight">
      {{ friend.displayName }}
    </p>
    <button
      :disabled="opening"
      class="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-[#252640] text-[#94a3b8] hover:bg-[#f59e0b] hover:text-black transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
      title="Enviar mensagem"
      @click.stop="openDm"
    >
      <MessageCircle :size="14" />
    </button>
  </div>
</template>
