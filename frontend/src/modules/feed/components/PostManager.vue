<!-- src/modules/feed/components/PostManager.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Trash2, CheckSquare, Square, Loader2 } from 'lucide-vue-next'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import PostMediaThumb from './PostMediaThumb.vue'
import { formatNumericDate } from '@/shared/utils/timeAgo'
import { postsService } from '../services/postsService'
import type { Post } from '../types'

const props = defineProps<{ userId: string }>()

const posts = ref<Post[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const deleting = ref(false)
const showConfirm = ref(false)
const selected = ref<Set<string>>(new Set())

const hasMore = computed(() => nextCursor.value !== null)
const allSelected = computed(() => posts.value.length > 0 && selected.value.size === posts.value.length)
const selectedCount = computed(() => selected.value.size)

async function load() {
  if (loading.value) return
  loading.value = true
  try {
    const page = await postsService.getUserPosts(props.userId, null)
    posts.value = page.posts
    nextCursor.value = page.nextCursor
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const page = await postsService.getUserPosts(props.userId, nextCursor.value)
    posts.value = [...posts.value, ...page.posts]
    nextCursor.value = page.nextCursor
  } finally {
    loading.value = false
  }
}

function toggle(id: string) {
  if (selected.value.has(id)) {
    selected.value.delete(id)
  } else {
    selected.value.add(id)
  }
}

function toggleAll() {
  if (allSelected.value) {
    selected.value.clear()
  } else {
    selected.value = new Set(posts.value.map(p => p.id))
  }
}

async function deleteSelected() {
  if (deleting.value || selected.value.size === 0) return
  deleting.value = true
  try {
    await Promise.all([...selected.value].map(id => postsService.deletePost(id)))
    const deleted = new Set(selected.value)
    posts.value = posts.value.filter(p => !deleted.has(p.id))
    selected.value.clear()
  } finally {
    deleting.value = false
    showConfirm.value = false
  }
}

function postPreview(post: Post): string {
  return post.content?.slice(0, 80) ?? ''
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- Barra de ações -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button
          @click="toggleAll"
          class="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <CheckSquare v-if="allSelected" :size="16" class="text-amber-400" />
          <Square v-else :size="16" />
          {{ allSelected ? 'Desmarcar todos' : 'Selecionar todos' }}
        </button>

        <span v-if="selectedCount > 0" class="text-sm text-slate-500">
          {{ selectedCount }} selecionado{{ selectedCount > 1 ? 's' : '' }}
        </span>
      </div>

      <button
        v-if="selectedCount > 0"
        @click="showConfirm = true"
        :disabled="deleting"
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors disabled:opacity-50"
      >
        <Trash2 :size="14" />
        Excluir {{ selectedCount > 1 ? selectedCount + ' posts' : 'post' }}
      </button>
    </div>

    <!-- Loading inicial -->
    <div v-if="loading && posts.length === 0" class="flex justify-center py-12">
      <Loader2 :size="24" class="animate-spin text-slate-500" />
    </div>

    <!-- Vazio -->
    <div v-else-if="!loading && posts.length === 0" class="text-center py-12 text-slate-500 text-sm">
      Nenhum post para gerenciar.
    </div>

    <!-- Grid de posts -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div
        v-for="post in posts"
        :key="post.id"
        @click="toggle(post.id)"
        :class="[
          'relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all',
          selected.has(post.id)
            ? 'border-amber-500 ring-1 ring-amber-500/50'
            : 'border-transparent hover:border-slate-600',
        ]"
      >
        <!-- Thumbnail de mídia ou preview de texto -->
        <div class="aspect-square bg-[#252640]">
          <PostMediaThumb
            v-if="post.media.length > 0"
            :url="post.media[0].url"
            media-class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center p-3"
          >
            <p class="text-xs text-slate-400 text-center line-clamp-4 leading-relaxed">
              {{ postPreview(post) }}
            </p>
          </div>
        </div>

        <!-- Overlay de múltiplas imagens -->
        <div
          v-if="post.media.length > 1"
          class="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-md"
        >
          {{ post.media.length }}
        </div>

        <!-- Checkbox -->
        <div
          :class="[
            'absolute top-2 left-2 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors',
            selected.has(post.id)
              ? 'bg-amber-500 border-amber-500'
              : 'bg-black/40 border-white/50',
          ]"
        >
          <svg v-if="selected.has(post.id)" viewBox="0 0 12 12" class="w-3 h-3 text-[#0f0f1a]" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="2,6 5,9 10,3" />
          </svg>
        </div>

        <!-- Data -->
        <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
          <p class="text-[10px] text-white/70">
            {{ formatNumericDate(post.createdAt) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Carregar mais -->
    <button
      v-if="hasMore"
      @click="loadMore"
      :disabled="loading"
      class="w-full py-3 text-sm text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
    >
      {{ loading ? 'Carregando...' : 'Carregar mais' }}
    </button>
  </div>

  <AppConfirmDialog
    :open="showConfirm"
    title="Excluir posts"
    confirm-label="Excluir"
    :loading="deleting"
    @cancel="showConfirm = false"
    @confirm="deleteSelected"
  >
    <p>
      Tem certeza que deseja excluir
      <strong class="text-(--color-text-primary)">{{ selectedCount }} {{ selectedCount > 1 ? 'posts' : 'post' }}</strong>?
      Essa ação não pode ser desfeita.
    </p>
  </AppConfirmDialog>
</template>
