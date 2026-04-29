<!-- src/modules/feed/components/PostCard.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle, Share2, MoreHorizontal, Pencil, Trash2, X, Check, Link2, Send, Flag } from 'lucide-vue-next'
import ReportDialog from '@/modules/reports/components/ReportDialog.vue'
import ReactionButton from './ReactionButton.vue'
import CommentSection from './CommentSection.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import AppImageLightbox from '@/shared/ui/AppImageLightbox.vue'
import PostMediaThumb from './PostMediaThumb.vue'
import ShareTargetModal from '@/modules/chat/components/ShareTargetModal.vue'
import * as chatService from '@/modules/chat/services/chatService'
import { postsService } from '../services/postsService'
import { useFeed } from '../composables/useFeed'
import { useAuthStore } from '@/shared/auth/authStore'
import { timeAgo } from '@/shared/utils/timeAgo'
import type { Post } from '../types'

const props = defineProps<{
  post: Post
}>()

const emit = defineEmits<{
  deleted: [id: string]
}>()

const router = useRouter()
const feed = useFeed()
const auth = useAuthStore()

const showComments = ref(false)
const showMenu = ref(false)
const editing = ref(false)
const editContent = ref(props.post.content ?? '')

function collectionEmoji(type: string | null): string {
  switch (type) {
    case 'games':      return '🎮'
    case 'books':      return '📚'
    case 'cardgames':  return '🃏'
    case 'boardgames': return '🎲'
    case 'custom':     return '⚙️'
    default:           return '🖼️'
  }
}

function collectionTypeLabel(type: string | null): string {
  switch (type) {
    case 'games':      return 'um jogo'
    case 'books':      return 'um livro'
    case 'cardgames':  return 'uma carta'
    case 'boardgames': return 'um boardgame'
    case 'custom':     return 'um item'
    default:           return 'um item'
  }
}
const saving = ref(false)
const deleting = ref(false)
const showDeleteConfirm = ref(false)
const lightboxIndex = ref<number | null>(null)
const removingMediaId = ref<string | null>(null)

const isOwn = props.post.authorId === auth.user?.id
const showReportDialog = ref(false)

function openReport() {
  showMenu.value = false
  showReportDialog.value = true
}

const menuRef = ref<HTMLElement | null>(null)

function handleOutsideClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    showMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))

async function saveEdit() {
  if (!editContent.value.trim() || saving.value) return
  saving.value = true
  try {
    const updated = await postsService.updatePost(props.post.id, { content: editContent.value.trim() })
    feed.updatePostInList(updated)
    editing.value = false
    showMenu.value = false
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (deleting.value) return
  deleting.value = true
  try {
    await postsService.deletePost(props.post.id)
    feed.removePost(props.post.id)
    emit('deleted', props.post.id)
  } catch {
    deleting.value = false
  }
  showDeleteConfirm.value = false
}

async function removeMedia(mediaId: string) {
  if (removingMediaId.value) return
  removingMediaId.value = mediaId
  try {
    await postsService.removeMedia(props.post.id, mediaId)
    const updated = { ...props.post, media: props.post.media.filter(m => m.id !== mediaId) }
    feed.updatePostInList(updated)
  } finally {
    removingMediaId.value = null
  }
}

function openLightbox(index: number) {
  lightboxIndex.value = index
}

const shareMenuOpen = ref(false)
const shareMenuRef = ref<HTMLElement | null>(null)
const showShareModal = ref(false)
const sharing = ref(false)
const shareToast = ref<{ message: string; kind: 'success' | 'error' } | null>(null)

function showToast(message: string, kind: 'success' | 'error' = 'success') {
  shareToast.value = { message, kind }
  setTimeout(() => { shareToast.value = null }, 2500)
}

function copyPostLink() {
  shareMenuOpen.value = false
  const url = `${window.location.origin}/posts/${props.post.id}`
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => showToast('Link copiado!'),
      () => showToast('Não foi possível copiar.', 'error'),
    )
  } else {
    showToast('Não foi possível copiar.', 'error')
  }
}

function openShareInChat() {
  shareMenuOpen.value = false
  showShareModal.value = true
}

function buildShareMessage(): string {
  const postUrl = `${window.location.origin}/posts/${props.post.id}`
  const lines: string[] = []
  lines.push(`📌 Post de ${props.post.authorName}`)
  if (props.post.type === 'item_share' && props.post.itemName) {
    const collection = props.post.collectionName ? ` (${props.post.collectionName})` : ''
    lines.push(`Adicionou: ${props.post.itemName}${collection}`)
  }
  if (props.post.content) {
    const trimmed = props.post.content.trim()
    const snippet = trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed
    lines.push(`"${snippet}"`)
  }
  lines.push(postUrl)
  return lines.join('\n')
}

async function confirmShareInChat(conversationIds: string[]) {
  if (sharing.value) return
  sharing.value = true
  const content = buildShareMessage()
  let successCount = 0
  try {
    await Promise.all(conversationIds.map(async (cid) => {
      try {
        await chatService.sendMessage(cid, { content })
        successCount += 1
      } catch {
        // continua tentando os demais
      }
    }))
    showShareModal.value = false
    if (successCount === 0) {
      showToast('Não foi possível enviar.', 'error')
    } else {
      showToast(`Enviado para ${successCount} conversa${successCount === 1 ? '' : 's'}.`)
    }
  } finally {
    sharing.value = false
  }
}

function handleShareOutsideClick(e: MouseEvent) {
  if (shareMenuRef.value && !shareMenuRef.value.contains(e.target as Node)) {
    shareMenuOpen.value = false
  }
}
onMounted(() => document.addEventListener('click', handleShareOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleShareOutsideClick))

function goToProfile() {
  router.push(`/profile/${props.post.authorId}`)
}
</script>

<template>
  <article class="bg-[#1e2038] rounded-2xl p-4 space-y-3">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-3 cursor-pointer" @click="goToProfile">
        <img
          v-if="post.authorAvatarUrl"
          :src="post.authorAvatarUrl"
          :alt="post.authorName"
          class="w-10 h-10 rounded-full object-cover"
        />
        <div
          v-else
          class="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-300"
        >
          {{ post.authorName.charAt(0).toUpperCase() }}
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-200 hover:text-amber-400 transition-colors">
            {{ post.authorName }}
          </p>
          <p class="text-xs text-slate-500">{{ timeAgo(post.createdAt) }}</p>
        </div>
      </div>

      <!-- Menu ⋯ (editar/excluir para autor; denunciar para posts alheios) -->
      <div ref="menuRef" class="relative">
        <button
          @click="showMenu = !showMenu"
          class="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
        >
          <MoreHorizontal :size="18" />
        </button>
        <div
          v-if="showMenu"
          class="absolute right-0 top-8 z-10 bg-[#252640] border border-slate-700/50 rounded-xl py-1 shadow-xl min-w-[140px] whitespace-nowrap"
        >
          <button
            v-if="isOwn"
            @click="editing = true; showMenu = false"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-amber-400 transition-colors"
          >
            <Pencil :size="14" /> Editar
          </button>
          <button
            v-if="isOwn"
            @click="showDeleteConfirm = true; showMenu = false"
            :disabled="deleting"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 :size="14" /> Excluir
          </button>
          <button
            v-if="!isOwn"
            @click="openReport"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-amber-400 transition-colors"
          >
            <Flag :size="14" /> Denunciar post
          </button>
        </div>
      </div>
    </div>

    <!-- Body -->
    <template v-if="editing">
      <textarea
        v-model="editContent"
        rows="3"
        class="w-full bg-[#252640] text-slate-200 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />

      <!-- Mídias atuais no modo de edição -->
      <div v-if="post.media.length > 0" class="flex gap-2 flex-wrap">
        <div
          v-for="m in post.media"
          :key="m.id"
          class="relative h-20 w-20 rounded-lg overflow-hidden"
          :class="{ 'opacity-40': removingMediaId === m.id }"
        >
          <PostMediaThumb :url="m.url" media-class="h-20 w-20 object-cover" />
          <button
            @click="removeMedia(m.id)"
            :disabled="!!removingMediaId"
            class="absolute -top-1.5 -right-1.5 bg-black/70 hover:bg-black/90 disabled:opacity-40 rounded-full p-0.5 text-white transition-colors"
          >
            <X :size="12" />
          </button>
        </div>
      </div>

      <div class="flex gap-2">
        <button
          @click="saveEdit"
          :disabled="saving || !editContent.trim()"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-[#0f0f1a] font-semibold rounded-lg transition-colors"
        >
          <Check :size="14" /> Salvar
        </button>
        <button
          @click="editing = false"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X :size="14" /> Cancelar
        </button>
      </div>
    </template>

    <template v-else>
      <!-- Conteúdo manual (texto) -->
      <p
        v-if="post.content"
        class="text-slate-300 text-sm leading-relaxed whitespace-pre-line"
      >
        {{ post.content }}
      </p>

      <!-- Item share — card clicável com cover + nome + tipo da coleção -->
      <RouterLink
        v-if="post.type === 'item_share' && post.itemId && post.collectionId"
        :to="`/collections/${post.collectionId}/items/${post.itemId}`"
        class="block rounded-xl border border-[#252640] hover:border-[#f59e0b]/40 bg-[#1a1b2e]/60 hover:bg-[#1a1b2e] overflow-hidden transition-all group"
      >
        <div class="flex gap-3 p-3">
          <!-- Cover thumbnail -->
          <div class="relative flex-shrink-0 w-[72px] h-[96px] rounded-lg overflow-hidden bg-[#252640] border border-[#2e3050]">
            <img
              v-if="post.itemCoverUrl"
              :src="post.itemCoverUrl"
              :alt="post.itemName ?? 'Item'"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-2xl">
              {{ collectionEmoji(post.collectionType) }}
            </div>
          </div>
          <div class="min-w-0 flex-1 flex flex-col justify-center">
            <p class="text-[10px] font-bold uppercase tracking-wider text-[#f59e0b] mb-1">
              Adicionou {{ collectionTypeLabel(post.collectionType) }}
            </p>
            <p class="text-[15px] font-bold text-[#e2e8f0] leading-tight truncate">
              {{ post.itemName ?? 'Item' }}
            </p>
            <p v-if="post.collectionName" class="text-[11px] text-[#94a3b8] truncate mt-1">
              em <span class="text-[#cbd5e1] font-medium">{{ post.collectionName }}</span>
            </p>
          </div>
        </div>
      </RouterLink>

      <!-- Galeria de mídia -->
      <div v-if="post.media.length > 0" class="rounded-xl overflow-hidden">
        <!-- 1 mídia -->
        <PostMediaThumb
          v-if="post.media.length === 1"
          :url="post.media[0].url"
          :thumbnail-url="post.media[0].thumbnailUrl"
          media-class="w-full max-h-80 object-cover cursor-pointer hover:opacity-95 transition-opacity"
          @click="openLightbox(0)"
        />

        <!-- 2 mídias: lado a lado -->
        <div v-else-if="post.media.length === 2" class="flex gap-0.5 h-56">
          <PostMediaThumb
            v-for="(m, i) in post.media"
            :key="m.url"
            :url="m.url"
            :thumbnail-url="m.thumbnailUrl"
            media-class="flex-1 w-0 object-cover cursor-pointer hover:opacity-95 transition-opacity h-full"
            @click="openLightbox(i)"
          />
        </div>

        <!-- 3 mídias: grande à esquerda + duas empilhadas à direita -->
        <div v-else-if="post.media.length === 3" class="flex gap-0.5 h-64">
          <PostMediaThumb
            :url="post.media[0].url"
            :thumbnail-url="post.media[0].thumbnailUrl"
            media-class="w-2/3 object-cover cursor-pointer hover:opacity-95 transition-opacity h-full"
            @click="openLightbox(0)"
          />
          <div class="flex flex-col gap-0.5 flex-1">
            <PostMediaThumb
              v-for="(m, i) in post.media.slice(1)"
              :key="m.url"
              :url="m.url"
              :thumbnail-url="m.thumbnailUrl"
              media-class="flex-1 h-0 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
              @click="openLightbox(i + 1)"
            />
          </div>
        </div>

        <!-- 4+ mídias: grid 2×2 com overlay +N -->
        <div v-else class="grid grid-cols-2 gap-0.5">
          <div
            v-for="(m, i) in post.media.slice(0, 4)"
            :key="m.url"
            class="relative aspect-square cursor-pointer"
            @click="openLightbox(i)"
          >
            <PostMediaThumb
              :url="m.url"
              :thumbnail-url="m.thumbnailUrl"
              media-class="w-full h-full object-cover hover:opacity-95 transition-opacity"
            />
            <div
              v-if="i === 3 && post.media.length > 4"
              class="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-2xl font-bold pointer-events-none"
            >
              +{{ post.media.length - 4 }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Footer actions -->
    <div class="flex items-center gap-1 pt-1 border-t border-slate-700/30">
      <ReactionButton
        :postId="post.id"
        :count="post.reactionCount"
        :userReaction="post.userReaction"
      />

      <button
        @click="showComments = !showComments"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
      >
        <MessageCircle :size="16" />
        <span>{{ post.commentCount }}</span>
      </button>

      <div ref="shareMenuRef" class="relative">
        <button
          @click="shareMenuOpen = !shareMenuOpen"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
        >
          <Share2 :size="16" />
        </button>
        <div
          v-if="shareMenuOpen"
          class="absolute bottom-full mb-2 left-0 z-10 bg-[#252640] border border-slate-700/50 rounded-xl py-1 shadow-xl min-w-[180px]"
        >
          <button
            @click="copyPostLink"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-amber-400 transition-colors"
          >
            <Link2 :size="14" /> Copiar link
          </button>
          <button
            @click="openShareInChat"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-amber-400 transition-colors"
          >
            <Send :size="14" /> Enviar no chat
          </button>
        </div>
      </div>
    </div>

    <!-- Comentários inline (lazy) -->
    <CommentSection
      v-if="showComments"
      :postId="post.id"
      :currentUserId="auth.user?.id ?? ''"
    />
  </article>

  <AppImageLightbox
    :open="lightboxIndex !== null"
    :src="post.media.map(m => m.url)"
    :initial-index="lightboxIndex ?? 0"
    @close="lightboxIndex = null"
  />

  <AppConfirmDialog
    :open="showDeleteConfirm"
    title="Excluir post"
    description="Tem certeza que deseja excluir este post? Essa ação não pode ser desfeita."
    confirm-label="Excluir"
    :loading="deleting"
    @cancel="showDeleteConfirm = false"
    @confirm="remove"
  />

  <ShareTargetModal
    v-if="showShareModal"
    title="Enviar post no chat"
    confirm-label="Enviar"
    :loading="sharing"
    @close="showShareModal = false"
    @confirm="confirmShareInChat"
  />

  <ReportDialog
    v-if="!isOwn"
    :open="showReportDialog"
    target-type="post"
    :target-id="post.id"
    :blockable-user-id="post.authorId"
    :blockable-user-name="post.authorName"
    @close="showReportDialog = false"
    @reported="showReportDialog = false"
  />

  <Teleport to="body">
    <div
      v-if="shareToast"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm shadow-lg"
      :class="shareToast.kind === 'success'
        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
        : 'bg-red-500/15 text-red-400 border border-red-500/30'"
    >
      {{ shareToast.message }}
    </div>
  </Teleport>
</template>
