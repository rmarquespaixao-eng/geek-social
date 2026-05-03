<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Trash2, Reply, MoreHorizontal, Download, SmilePlus, Check, CheckCheck, Play, Forward, Hourglass, Flag, Lock } from 'lucide-vue-next'
import ReportDialog from '@/modules/reports/components/ReportDialog.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { timeAgo } from '@/shared/utils/timeAgo'
import { downloadFile } from '@/shared/utils/mediaUtils'
import { useChat } from '../composables/useChat'
import * as chatService from '../services/chatService'
import AudioPlayer from './AudioPlayer.vue'
import CallSystemMessage from './CallSystemMessage.vue'
import TemporarySystemMessage from './TemporarySystemMessage.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import AppImageLightbox from '@/shared/ui/AppImageLightbox.vue'
import ShareTargetModal from './ShareTargetModal.vue'
import type { Message, MessageAttachment } from '../types'

const props = defineProps<{
  message: Message
}>()

const auth = useAuthStore()
const chat = useChat()

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const reactionPickerOpen = ref(false)
const reactionPickerRef = ref<HTMLElement | null>(null)
const lightboxUrl = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const deleting = ref(false)
const showForwardModal = ref(false)
const forwarding = ref(false)
const forwardError = ref<string | null>(null)
const forwardSuccess = ref<string | null>(null)

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

const isOwn = computed(() => props.message.senderId === auth.user?.id)
const isDeleted = computed(() => props.message.deletedAt !== null)
const conversation = computed(() => chat.conversations.find(c => c.id === props.message.conversationId))
const hidePeerPhoto = computed(() => conversation.value?.isBlockedByOther === true)
const isBlocked = computed(() =>
  conversation.value?.isBlockedByMe === true || conversation.value?.isBlockedByOther === true
)

const canModerate = computed(() => {
  const conv = conversation.value
  if (!conv || conv.type !== 'group') return false
  const myId = auth.user?.id
  if (!myId) return false
  const myMember = conv.participants.find(p => p.userId === myId)
  return myMember?.role === 'owner' || myMember?.role === 'admin'
})

const canDelete = computed(() => isOwn.value || canModerate.value)
const canReport = computed(() => !isOwn.value && !isDeleted.value)
const showMenuButton = computed(() => canDelete.value || canReport.value)
const showReportDialog = ref(false)
const retryingDecrypt = ref(false)

async function onRetryDecrypt(): Promise<void> {
  if (retryingDecrypt.value) return
  retryingDecrypt.value = true
  try {
    await chat.retryDecryptMessage(props.message.conversationId, props.message.id)
  } finally {
    retryingDecrypt.value = false
  }
}

function openReport() {
  menuOpen.value = false
  showReportDialog.value = true
}

const seenTitle = computed(() => {
  const s = props.message.seen
  if (!s) return ''
  if (s.type === 'dm') return s.seen ? 'Visto' : 'Enviado'
  return s.count === s.total ? 'Visto por todos' : `Visto por ${s.count} de ${s.total}`
})

function askDelete() {
  menuOpen.value = false
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (deleting.value) return
  deleting.value = true
  try {
    await chat.deleteMessage(props.message.id)
    showDeleteConfirm.value = false
  } finally {
    deleting.value = false
  }
}

function startReply() {
  chat.setReplyingTo(props.message)
}

async function pickReaction(emoji: string) {
  reactionPickerOpen.value = false
  const myId = auth.user?.id
  if (!myId) return
  const existing = props.message.reactions.find(r => r.emoji === emoji)
  const currentlyReacted = existing?.userIds.includes(myId) ?? false
  await chat.toggleReaction(props.message.id, emoji, currentlyReacted)
}

function isMyReaction(emoji: string): boolean {
  const myId = auth.user?.id
  if (!myId) return false
  return props.message.reactions.find(r => r.emoji === emoji)?.userIds.includes(myId) ?? false
}

function handleOutsideClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) menuOpen.value = false
  if (reactionPickerRef.value && !reactionPickerRef.value.contains(e.target as Node)) reactionPickerOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})
onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function openForward() {
  menuOpen.value = false
  forwardError.value = null
  forwardSuccess.value = null
  showForwardModal.value = true
}

async function confirmForward(conversationIds: string[]) {
  if (forwarding.value) return
  forwarding.value = true
  forwardError.value = null
  try {
    await chat.forwardMessage(props.message.id, conversationIds)
    showForwardModal.value = false
    forwardSuccess.value = `Encaminhada para ${conversationIds.length} conversa${conversationIds.length === 1 ? '' : 's'}.`
    setTimeout(() => { forwardSuccess.value = null }, 2500)
  } catch (err: any) {
    forwardError.value = err?.response?.data?.error ?? 'Erro ao encaminhar mensagem.'
  } finally {
    forwarding.value = false
  }
}

async function downloadAttachment(attachment: MessageAttachment) {
  await downloadFile(attachment.url, attachment.name)
}
</script>

<template>
  <CallSystemMessage
    v-if="message.type === 'call' && message.callMetadata"
    :metadata="message.callMetadata"
    :is-own="isOwn"
  />
  <TemporarySystemMessage
    v-else-if="message.type === 'temporary_toggle' && message.temporaryEvent"
    :event="message.temporaryEvent"
    :conversation-id="message.conversationId"
  />
  <div
    v-else
    :class="[
      'flex items-start gap-2 group',
      isOwn ? 'flex-row-reverse' : 'flex-row',
    ]"
  >
    <!-- Espaçador equivalente ao avatar para mensagens próprias (mantém alinhamento) -->
    <div v-if="isOwn" class="w-8 flex-shrink-0" />

    <!-- Avatar (only for others), alinhado com o topo do bubble -->
    <div v-if="!isOwn" class="flex-shrink-0 pt-5">
      <div
        v-if="hidePeerPhoto"
        class="w-8 h-8 rounded-full bg-slate-700"
      />
      <img
        v-else-if="message.senderAvatarUrl"
        :src="message.senderAvatarUrl"
        :alt="message.senderName"
        class="w-8 h-8 rounded-full object-cover"
      />
      <div
        v-else
        class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-200"
      >
        {{ message.senderName.charAt(0).toUpperCase() }}
      </div>
    </div>

    <!-- Bubble -->
    <div :class="['max-w-[70%] flex flex-col gap-1 min-w-0', isOwn ? 'items-end' : 'items-start']">
      <span v-if="!isOwn" class="text-xs text-(--color-text-muted) px-2">
        {{ message.senderName }}
      </span>

      <!-- Reply preview -->
      <div
        v-if="message.replyTo"
        :class="[
          'text-xs px-3 py-1.5 rounded-lg border-l-2 border-(--color-accent-amber) bg-(--color-bg-elevated) text-(--color-text-muted) max-w-full',
        ]"
      >
        <p class="font-semibold text-(--color-accent-amber)">{{ message.replyTo.senderName }}</p>
        <p class="truncate">
          <span v-if="message.replyTo.type === 'audio'">🎤 Mensagem de voz</span>
          <span v-else-if="message.replyTo.type === 'image'">📷 Imagem</span>
          <span v-else-if="message.replyTo.type === 'video'">🎬 Vídeo</span>
          <span v-else>{{ message.replyTo.content }}</span>
        </p>
      </div>

      <!-- Deleted message -->
      <div
        v-if="isDeleted"
        class="px-4 py-2 rounded-2xl bg-(--color-bg-elevated) text-(--color-text-muted) italic text-sm"
      >
        Mensagem apagada
      </div>

      <!-- Normal message -->
      <template v-else>
        <div
          :class="[
            'px-4 py-2 rounded-2xl text-sm',
            isOwn
              ? 'bg-(--color-accent-amber) text-[#0f0f1a] rounded-br-sm'
              : 'bg-(--color-bg-elevated) text-(--color-text-primary) rounded-bl-sm',
          ]"
        >
          <p
            v-if="message.content"
            :class="[
              'whitespace-pre-wrap break-words',
              message.decryptError && 'italic text-(--color-text-muted)',
            ]"
          >{{ message.decryptError ? '[Mensagem criptografada]' : message.content }}</p>

          <button
            v-if="message.decryptError"
            type="button"
            :disabled="retryingDecrypt"
            class="mt-1 text-xs underline text-(--color-text-muted) hover:text-(--color-text-primary) disabled:opacity-50"
            @click="onRetryDecrypt"
          >{{ retryingDecrypt ? 'Tentando…' : 'Tentar novamente' }}</button>

          <div v-if="message.attachments.length > 0" class="mt-2 space-y-2">
            <div v-for="attachment in message.attachments" :key="attachment.id">
              <AudioPlayer
                v-if="attachment.type === 'audio'"
                :attachment="attachment"
              />
              <div
                v-else-if="attachment.type === 'image'"
                class="relative group/media block w-full"
              >
                <button
                  type="button"
                  @click="lightboxUrl = attachment.url"
                  class="block w-full"
                >
                  <img
                    :src="attachment.url"
                    :alt="attachment.name"
                    class="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </button>
                <button
                  type="button"
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover/media:opacity-100 transition-opacity hover:bg-black/80"
                  title="Baixar imagem"
                  @click.stop="downloadAttachment(attachment)"
                >
                  <Download :size="14" />
                </button>
              </div>
              <div
                v-else-if="attachment.type === 'video'"
                class="relative w-full max-w-[280px] group/media"
              >
              <button
                type="button"
                class="relative block w-full rounded-lg overflow-hidden bg-black group"
                :title="attachment.name || 'Tocar vídeo'"
                @click="lightboxUrl = attachment.url"
              >
                <img
                  v-if="attachment.thumbnailUrl"
                  :src="attachment.thumbnailUrl"
                  :alt="attachment.name"
                  class="w-full max-h-[300px] object-contain bg-black"
                />
                <video
                  v-else
                  :src="attachment.url"
                  preload="metadata"
                  muted
                  playsinline
                  class="w-full max-h-[300px] object-contain bg-black pointer-events-none"
                />
                <!-- Duração no canto -->
                <div
                  v-if="attachment.durationMs"
                  class="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded"
                >
                  {{ formatDuration(attachment.durationMs) }}
                </div>
                <!-- Overlay play -->
                <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/45 transition-colors">
                  <div class="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                    <Play :size="24" class="text-white ml-1" fill="white" />
                  </div>
                </div>
              </button>
              <button
                type="button"
                class="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover/media:opacity-100 transition-opacity hover:bg-black/80"
                title="Baixar vídeo"
                @click.stop="downloadAttachment(attachment)"
              >
                <Download :size="14" />
              </button>
              </div>
              <button
                v-else
                type="button"
                class="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/10 hover:bg-black/20 transition-colors text-xs w-full text-left"
                @click="downloadAttachment(attachment)"
                title="Baixar arquivo"
              >
                <Download :size="14" />
                <span class="truncate">{{ attachment.name }}</span>
                <span class="ml-auto flex-shrink-0 opacity-70">
                  {{ (attachment.size / 1024).toFixed(0) }}KB
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Reactions -->
        <div v-if="message.reactions.length > 0" class="flex flex-wrap gap-1 px-1">
          <button
            v-for="reaction in message.reactions"
            :key="reaction.emoji"
            :disabled="isBlocked"
            @click="pickReaction(reaction.emoji)"
            :class="[
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors',
              isBlocked ? 'cursor-not-allowed opacity-70' : '',
              isMyReaction(reaction.emoji)
                ? 'bg-(--color-accent-amber)/20 border-(--color-accent-amber)/50 text-(--color-text-primary)'
                : 'bg-(--color-bg-elevated) border-(--color-bg-elevated) text-(--color-text-secondary) hover:border-(--color-accent-amber)/30',
            ]"
          >
            <span>{{ reaction.emoji }}</span>
            <span class="text-[11px] font-medium">{{ reaction.count }}</span>
          </button>
        </div>

        <span class="text-[10px] text-(--color-text-muted) px-2 inline-flex items-center gap-0.5">
          <Hourglass
            v-if="message.isTemporary"
            :size="10"
            class="mr-1 text-(--color-accent-amber)"
            :title="'Mensagem temporária'"
          />
          <Lock
            v-if="message.isEncrypted"
            :size="10"
            :class="['mr-1', message.decryptError ? 'text-(--color-danger)' : 'text-(--color-text-muted)']"
            :title="message.decryptError ? 'Não foi possível descriptografar' : 'Mensagem criptografada'"
          />
          {{ timeAgo(message.createdAt) }}
          <span v-if="message.editedAt"> · editado</span>
          <span v-if="isOwn && message.seen" class="ml-1 inline-flex items-center" :title="seenTitle">
            <Check
              v-if="(message.seen.type === 'dm' && !message.seen.seen) || (message.seen.type === 'group' && message.seen.count === 0)"
              :size="14"
              class="text-(--color-text-muted)"
            />
            <CheckCheck
              v-else-if="(message.seen.type === 'dm' && message.seen.seen) || (message.seen.type === 'group' && message.seen.count === message.seen.total)"
              :size="14"
              class="text-(--color-accent-amber)"
            />
            <CheckCheck
              v-else
              :size="14"
              class="text-(--color-text-muted)"
            />
          </span>
        </span>
      </template>
    </div>

    <!-- Action buttons -->
    <div
      v-if="!isDeleted"
      class="flex items-center self-center opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <!-- Reaction picker (oculto se bloqueado em qualquer direção) -->
      <div v-if="!isBlocked" ref="reactionPickerRef" class="relative">
        <button
          @click.stop="reactionPickerOpen = !reactionPickerOpen"
          class="p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
          title="Reagir"
        >
          <SmilePlus :size="14" />
        </button>
        <div
          v-if="reactionPickerOpen"
          :class="[
            'absolute z-20 flex gap-1 px-2 py-1.5 bg-(--color-bg-elevated) border border-(--color-bg-surface) rounded-xl shadow-xl',
            isOwn ? 'right-0 bottom-8' : 'left-0 bottom-8',
          ]"
        >
          <button
            v-for="emoji in REACTIONS"
            :key="emoji"
            @click="pickReaction(emoji)"
            class="text-lg hover:scale-125 transition-transform"
          >
            {{ emoji }}
          </button>
        </div>
      </div>

      <!-- Reply (others' messages, oculto se bloqueado) -->
      <button
        v-if="!isOwn && !isBlocked"
        @click="startReply"
        class="p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
        title="Responder"
      >
        <Reply :size="14" />
      </button>

      <!-- Forward (oculto em mensagens temporárias) -->
      <button
        v-if="!message.isTemporary"
        @click="openForward"
        class="p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
        title="Encaminhar"
      >
        <Forward :size="14" />
      </button>

      <!-- Menu ⋯ (apagar para autor/moderador; denunciar para mensagens alheias) -->
      <div v-if="showMenuButton" ref="menuRef" class="relative">
        <button
          @click.stop="menuOpen = !menuOpen"
          class="p-1 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
        >
          <MoreHorizontal :size="14" />
        </button>
        <div
          v-if="menuOpen"
          :class="[
            'absolute bottom-8 z-20 bg-(--color-bg-elevated) border border-(--color-bg-surface) rounded-xl py-1 shadow-xl min-w-[160px] whitespace-nowrap',
            isOwn ? 'right-0' : 'left-0',
          ]"
        >
          <button
            v-if="canReport"
            @click="openReport"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-card) transition-colors"
          >
            <Flag :size="14" />
            Denunciar mensagem
          </button>
          <button
            v-if="canDelete"
            @click="askDelete"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 :size="14" />
            {{ isOwn ? 'Apagar' : 'Apagar (moderar)' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <AppImageLightbox
    :open="!!lightboxUrl"
    :src="lightboxUrl"
    @close="lightboxUrl = null"
  />

  <AppConfirmDialog
    :open="showDeleteConfirm"
    title="Excluir mensagem"
    :description="isOwn
      ? 'Esta mensagem será apagada para você e para o destinatário. Essa ação não pode ser desfeita.'
      : 'A mensagem deste membro será apagada para todos. Essa ação não pode ser desfeita.'"
    confirm-label="Excluir"
    :loading="deleting"
    @cancel="showDeleteConfirm = false"
    @confirm="confirmDelete"
  />

  <ShareTargetModal
    v-if="showForwardModal"
    title="Encaminhar mensagem"
    confirm-label="Encaminhar"
    :loading="forwarding"
    @close="showForwardModal = false"
    @confirm="confirmForward"
  />

  <ReportDialog
    :open="showReportDialog"
    target-type="message"
    :target-id="message.id"
    :blockable-user-id="message.senderId"
    :blockable-user-name="message.senderName"
    :deletable-conversation-id="conversation?.type === 'dm' ? message.conversationId : null"
    @close="showReportDialog = false"
    @reported="showReportDialog = false"
  />

  <Teleport to="body">
    <div
      v-if="forwardSuccess || forwardError"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm shadow-lg"
      :class="forwardSuccess
        ? 'bg-(--color-status-online)/15 text-(--color-status-online) border border-(--color-status-online)/30'
        : 'bg-(--color-danger)/15 text-(--color-danger) border border-(--color-danger)/30'"
    >
      {{ forwardSuccess ?? forwardError }}
    </div>
  </Teleport>
</template>
