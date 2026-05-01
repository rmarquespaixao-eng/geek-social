<!-- src/modules/chat/components/MessageArea.vue -->
<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Paperclip, Send, X, Ban, Unlock, Mic } from 'lucide-vue-next'
import { useAuthStore } from '@/shared/auth/authStore'
import { useChat } from '../composables/useChat'
import { CryptoNotReadyError, PeerHasNoKeysError } from '../services/chatCrypto'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { uploadAttachment } from '../services/chatService'
import { useAudioRecorder, isRecorderSupported } from '../composables/useAudioRecorder'
import MessageBubble from './MessageBubble.vue'
import TypingIndicator from './TypingIndicator.vue'
import AttachmentPreview from './AttachmentPreview.vue'
import AudioRecorderBar from './AudioRecorderBar.vue'
import DmRequestBanner from './DmRequestBanner.vue'
import type { Conversation } from '../types'

const props = defineProps<{
  conversation: Conversation
}>()

const auth = useAuthStore()
const chat = useChat()
const friends = useFriends()

const otherParticipant = computed(() => {
  if (props.conversation.type !== 'dm') return null
  return props.conversation.participants.find(p => p.userId !== auth.user?.id) ?? null
})

const isBlockedByMe = computed(() => props.conversation.isBlockedByMe === true)
const isBlockedByOther = computed(() => props.conversation.isBlockedByOther === true)
const unblocking = ref(false)

async function handleUnblock() {
  if (!otherParticipant.value || unblocking.value) return
  unblocking.value = true
  try {
    await friends.unblockUser(otherParticipant.value.userId)
    // Atualiza a conversa local — recarrega para atualizar isBlockedByMe
    await chat.fetchConversations()
  } finally {
    unblocking.value = false
  }
}

const scrollContainer = ref<HTMLElement | null>(null)
const topSentinel = ref<HTMLDivElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const content = ref('')
const pendingFiles = ref<File[]>([])
const uploading = ref(false)
const sending = ref(false)
const sendError = ref<string | null>(null)

const recorder = useAudioRecorder({ maxMs: 180_000, peakBuckets: 64 })
const recorderSupported = isRecorderSupported()

let observer: IntersectionObserver | null = null

// Typing debounce
let typingTimer: ReturnType<typeof setTimeout> | null = null
let isTyping = false

const messages = computed(() => chat.activeMessages)
const typingUsers = computed(() => chat.activeTypingUsers)

const convId = computed(() => props.conversation.id)

// Show DM request banner if pending
const dmRequest = computed(() => {
  const req = props.conversation.dmRequest
  if (!req || req.status !== 'pending') return null
  // Only show to receiver
  if (req.receiverId !== auth.user?.id) return null
  return req
})

const dmSenderName = computed(() => {
  if (!dmRequest.value) return ''
  const participant = props.conversation.participants.find(
    (p) => p.userId === dmRequest.value?.senderId,
  )
  return participant?.displayName ?? 'Usuário'
})

const isInputBlocked = computed(() => dmRequest.value !== null)

function scrollToBottom(smooth = false) {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTo({
        top: scrollContainer.value.scrollHeight,
        behavior: smooth ? 'smooth' : 'instant',
      })
    }
  })
}

// Scroll to bottom on new messages
watch(messages, (newVal, oldVal) => {
  if (newVal.length > oldVal.length) {
    scrollToBottom(true)
  }
})

onMounted(() => {
  scrollToBottom()
})

// ── IntersectionObserver for pagination ───────────────────────────────────

function setupIntersectionObserver() {
  if (observer) observer.disconnect()
  const sentinel = topSentinel.value
  if (!sentinel) return

  observer = new IntersectionObserver(
    async (entries) => {
      const entry = entries[0]
      if (!entry.isIntersecting || !convId.value) return
      const cursor = chat.cursors.get(convId.value)
      if (!cursor) return
      const el = scrollContainer.value
      const prevScrollHeight = el?.scrollHeight ?? 0
      const prevScrollTop = el?.scrollTop ?? 0
      await chat.fetchMessages(convId.value, cursor)
      await nextTick()
      if (el) {
        el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight)
      }
    },
    { root: scrollContainer.value, threshold: 0.1 },
  )
  observer.observe(sentinel)
}

watch(topSentinel, (el) => {
  if (el) setupIntersectionObserver()
})

onUnmounted(() => {
  observer?.disconnect()
})

function onInput() {
  if (!isTyping) {
    isTyping = true
    chat.emitTyping(props.conversation.id)
  }
  if (typingTimer) clearTimeout(typingTimer)
  typingTimer = setTimeout(() => {
    isTyping = false
    chat.emitStopTyping(props.conversation.id)
  }, 2000)
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    pendingFiles.value.push(file)
  }
  input.value = ''
}

function removeFile(index: number) {
  pendingFiles.value.splice(index, 1)
}

async function send() {
  if (sending.value || isInputBlocked.value) return
  const text = content.value.trim()
  if (!text && pendingFiles.value.length === 0) return

  sending.value = true
  uploading.value = pendingFiles.value.length > 0
  sendError.value = null

  try {
    const attachmentIds: string[] = []
    for (const file of pendingFiles.value) {
      const result = await uploadAttachment(props.conversation.id, file)
      attachmentIds.push(result.id)
    }

    await chat.sendMessage({
      content: text,
      type: 'text',
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    })

    content.value = ''
    pendingFiles.value = []

    if (typingTimer) clearTimeout(typingTimer)
    if (isTyping) {
      isTyping = false
      chat.emitStopTyping(props.conversation.id)
    }
  } catch (e: any) {
    if (e instanceof CryptoNotReadyError) {
      sendError.value = 'Criptografia ainda iniciando. Aguarde alguns segundos e tente novamente.'
    } else if (e instanceof PeerHasNoKeysError) {
      sendError.value = 'Esse usuário ainda não está pronto para mensagens criptografadas. Peça para ele abrir o app.'
    } else {
      const code = e?.response?.data?.error
      if (code === 'BLOCKED') {
        sendError.value = 'Não é possível enviar mensagens neste chat.'
      } else if (code === 'FORBIDDEN') {
        sendError.value = 'Você não tem permissão para enviar mensagens nesta conversa.'
      } else {
        sendError.value = 'Erro ao enviar mensagem. Tente novamente.'
      }
    }
  } finally {
    sending.value = false
    uploading.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

async function startRecording() {
  if (isInputBlocked.value) return
  await recorder.start()
}

async function sendRecording() {
  if (
    !recorder.recordedBlob.value ||
    !recorder.peaks.value ||
    recorder.durationMs.value == null
  ) return
  recorder.state.value = 'uploading'
  sendError.value = null
  try {
    const blob = recorder.recordedBlob.value
    const blobMime = (blob.type || 'audio/webm').split(';')[0]
    const ext = blobMime.split('/')[1] ?? 'webm'
    const att = await uploadAttachment(
      props.conversation.id,
      blob,
      `voice.${ext}`,
      { durationMs: recorder.durationMs.value, waveformPeaks: recorder.peaks.value },
    )
    await chat.sendMessage({ attachmentIds: [att.id] })
    recorder.discard()
  } catch (e: any) {
    if (e instanceof CryptoNotReadyError) {
      sendError.value = 'Criptografia ainda iniciando. Aguarde alguns segundos e tente novamente.'
    } else if (e instanceof PeerHasNoKeysError) {
      sendError.value = 'Esse usuário ainda não está pronto para mensagens criptografadas. Peça para ele abrir o app.'
    } else {
      const code = e?.response?.data?.error
      if (code === 'BLOCKED') {
        sendError.value = 'Não é possível enviar áudios neste chat.'
      } else if (code === 'AUDIO_TOO_LONG') {
        sendError.value = 'Áudio muito longo (máximo 3 minutos).'
      } else if (code === 'ATTACHMENT_TOO_LARGE') {
        sendError.value = 'Áudio muito grande para envio.'
      } else {
        sendError.value = 'Falha ao enviar áudio. Tente de novo.'
      }
    }
    recorder.state.value = 'preview'
  }
}

function onDmAccepted(_conversationId: string) {
  // Refresh conversation to clear dmRequest
  chat.fetchConversations()
}

function onDmRejected() {
  chat.deleteConversation(props.conversation.id)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Messages list -->
    <div
      ref="scrollContainer"
      class="flex-1 overflow-y-auto px-4 py-4 space-y-2"
    >
      <!-- Top sentinel for IntersectionObserver pagination -->
      <div ref="topSentinel" class="h-1" />

      <!-- Load more spinner -->
      <div
        v-if="chat.messagesLoading"
        class="flex justify-center py-2"
      >
        <div class="w-4 h-4 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
      </div>

      <!-- Empty state -->
      <div
        v-if="messages.length === 0 && !chat.messagesLoading"
        class="flex flex-col items-center justify-center py-12 text-(--color-text-muted)"
      >
        <p class="text-sm">Nenhuma mensagem ainda. Diga olá!</p>
      </div>

      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
      />

      <!-- Typing indicator -->
      <TypingIndicator :typing-users="typingUsers" />
    </div>

    <!-- DM request banner -->
    <DmRequestBanner
      v-if="dmRequest"
      :dm-request="dmRequest"
      :sender-name="dmSenderName"
      @accepted="onDmAccepted"
      @rejected="onDmRejected"
    />

    <!-- Reply preview -->
    <div
      v-if="chat.replyingTo"
      class="flex items-center gap-3 px-4 py-2 border-t border-(--color-bg-elevated) bg-(--color-bg-elevated)/50"
    >
      <div class="w-1 self-stretch bg-(--color-accent-amber) rounded-full" />
      <div class="flex-1 min-w-0">
        <p class="text-xs font-semibold text-(--color-accent-amber)">
          Respondendo {{ chat.replyingTo.senderName }}
        </p>
        <p class="text-xs text-(--color-text-muted) truncate">{{ chat.replyingTo.content }}</p>
      </div>
      <button
        @click="chat.setReplyingTo(null)"
        class="p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-surface) transition-colors"
      >
        <X :size="14" />
      </button>
    </div>

    <!-- Attachment previews -->
    <div
      v-if="pendingFiles.length > 0"
      class="flex flex-wrap gap-2 px-4 py-2 border-t border-(--color-bg-elevated)"
    >
      <AttachmentPreview
        v-for="(file, index) in pendingFiles"
        :key="index"
        :file="file"
        @remove="removeFile(index)"
      />
    </div>

    <!-- Bloco "usuário bloqueado" no lugar do input -->
    <div
      v-if="isBlockedByMe"
      class="flex items-center justify-between gap-3 px-4 py-3 border-t border-(--color-bg-elevated) bg-(--color-bg-elevated)/40"
    >
      <div class="flex items-center gap-2 min-w-0">
        <Ban :size="16" class="text-red-400 flex-shrink-0" />
        <p class="text-sm text-(--color-text-secondary) truncate">
          Você bloqueou este usuário
        </p>
      </div>
      <button
        :disabled="unblocking"
        @click="handleUnblock"
        class="flex items-center gap-1.5 rounded-xl bg-(--color-accent-amber) px-3 py-1.5 text-xs font-semibold text-[#0f0f1a] hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <Unlock :size="13" />
        {{ unblocking ? 'Desbloqueando…' : 'Desbloquear' }}
      </button>
    </div>

    <!-- Estado: outro lado me bloqueou (mensagem genérica, sem revelar) -->
    <div
      v-else-if="isBlockedByOther"
      class="flex items-center justify-center gap-2 px-4 py-4 border-t border-(--color-bg-elevated) bg-(--color-bg-elevated)/40"
    >
      <Ban :size="16" class="text-(--color-text-muted) flex-shrink-0" />
      <p class="text-sm text-(--color-text-muted) text-center">
        Você não pode enviar mensagens nesta conversa
      </p>
    </div>

    <!-- Input area -->
    <div v-else class="px-4 py-3 border-t border-(--color-bg-elevated)">
      <AudioRecorderBar
        v-if="recorder.state.value !== 'idle'"
        :state="recorder.state.value"
        :elapsed-ms="recorder.elapsedMs.value"
        :duration-ms="recorder.durationMs.value"
        :peaks="recorder.peaks.value"
        :recorded-blob="recorder.recordedBlob.value"
        @stop="recorder.stop()"
        @discard="recorder.discard()"
        @send="sendRecording"
      />

      <div
        v-else
        :class="[
          'flex items-end gap-2 bg-(--color-bg-elevated) rounded-2xl px-3 py-2',
          isInputBlocked ? 'opacity-50 cursor-not-allowed' : '',
        ]"
      >
        <!-- Attach file -->
        <button
          :disabled="isInputBlocked"
          @click="fileInputRef?.click()"
          class="flex-shrink-0 p-1.5 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors disabled:cursor-not-allowed"
        >
          <Paperclip :size="18" />
        </button>
        <input
          ref="fileInputRef"
          type="file"
          multiple
          accept="image/*,video/mp4,video/webm,video/quicktime,.pdf,.doc,.docx,.zip"
          class="hidden"
          @change="onFileChange"
        />

        <!-- Textarea -->
        <textarea
          v-model="content"
          :disabled="isInputBlocked"
          rows="1"
          placeholder="Digite uma mensagem…"
          class="flex-1 bg-transparent text-sm text-(--color-text-primary) placeholder-(--color-text-muted) focus:outline-none resize-none max-h-32 overflow-y-auto disabled:cursor-not-allowed"
          @input="onInput"
          @keydown="onKeydown"
        />

        <!-- Mic / Send toggle (estilo WhatsApp) -->
        <div class="flex-shrink-0 relative w-8 h-8">
          <Transition name="chat-action-btn">
            <button
              v-if="recorderSupported && !content.trim() && pendingFiles.length === 0"
              key="mic"
              :disabled="isInputBlocked"
              @click="startRecording"
              title="Gravar áudio"
              class="absolute inset-0 flex items-center justify-center rounded-lg text-(--color-text-muted) hover:text-(--color-accent-amber) transition-colors disabled:cursor-not-allowed"
            >
              <Mic :size="18" />
            </button>
            <button
              v-else
              key="send"
              :disabled="isInputBlocked || sending || (!content.trim() && pendingFiles.length === 0)"
              @click="send"
              class="absolute inset-0 flex items-center justify-center rounded-lg text-(--color-accent-amber) hover:bg-(--color-accent-amber)/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send :size="18" />
            </button>
          </Transition>
        </div>
      </div>
      <p v-if="isInputBlocked" class="text-xs text-(--color-text-muted) text-center mt-1">
        Aceite ou recuse a solicitação para enviar mensagens
      </p>
      <p v-if="sendError" class="text-xs text-red-400 text-center mt-1">
        {{ sendError }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.chat-action-btn-enter-active,
.chat-action-btn-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.chat-action-btn-enter-from {
  transform: scale(0.4) rotate(25deg);
  opacity: 0;
}
.chat-action-btn-leave-to {
  transform: scale(0.4) rotate(-25deg);
  opacity: 0;
}
</style>
