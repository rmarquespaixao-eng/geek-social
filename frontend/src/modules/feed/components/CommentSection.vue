<!-- src/modules/feed/components/CommentSection.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Send } from 'lucide-vue-next'
import CommentItem from './CommentItem.vue'
import { commentsService } from '../services/commentsService'
import { useFeed } from '../composables/useFeed'
import type { Comment } from '../types'

const props = defineProps<{
  postId: string
  currentUserId: string
}>()

const feed = useFeed()
const comments = ref<Comment[]>([])
const nextCursor = ref<string | null>(null)
const loadingComments = ref(false)
const newContent = ref('')
const submitting = ref(false)

async function load(cursor?: string | null) {
  if (loadingComments.value) return
  loadingComments.value = true
  try {
    const page = await commentsService.listComments(props.postId, cursor)
    if (cursor) {
      comments.value = [...comments.value, ...page.comments]
    } else {
      comments.value = page.comments
    }
    nextCursor.value = page.nextCursor
  } finally {
    loadingComments.value = false
  }
}

async function loadMore() {
  await load(nextCursor.value)
}

async function submit() {
  if (!newContent.value.trim() || submitting.value) return
  submitting.value = true
  try {
    const comment = await commentsService.addComment(props.postId, newContent.value.trim())
    comments.value = [comment, ...comments.value]
    feed.incrementCommentCount(props.postId)
    newContent.value = ''
  } finally {
    submitting.value = false
  }
}

function onDeleted(id: string) {
  comments.value = comments.value.filter(c => c.id !== id)
  feed.decrementCommentCount(props.postId)
}

function onUpdated(updated: Comment) {
  const idx = comments.value.findIndex(c => c.id === updated.id)
  if (idx !== -1) comments.value[idx] = updated
}

onMounted(() => load())
</script>

<template>
  <div class="space-y-3 pt-2 border-t border-slate-700/50">
    <!-- Input novo comentário -->
    <div class="flex gap-2">
      <textarea
        v-model="newContent"
        placeholder="Escreva um comentário..."
        rows="1"
        @keydown.enter.exact.prevent="submit"
        class="flex-1 bg-[#252640] text-slate-200 placeholder-slate-500 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      />
      <button
        @click="submit"
        :disabled="!newContent.trim() || submitting"
        class="self-end px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-[#0f0f1a] rounded-xl transition-colors"
      >
        <Send :size="16" />
      </button>
    </div>

    <!-- Lista de comentários -->
    <div v-if="loadingComments && comments.length === 0" class="text-center text-sm text-slate-500 py-2">
      Carregando comentários...
    </div>

    <div v-else class="space-y-3">
      <CommentItem
        v-for="comment in comments"
        :key="comment.id"
        :postId="postId"
        :comment="comment"
        :currentUserId="currentUserId"
        @deleted="onDeleted"
        @updated="onUpdated"
      />
    </div>

    <button
      v-if="nextCursor"
      @click="loadMore"
      :disabled="loadingComments"
      class="text-sm text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
    >
      {{ loadingComments ? 'Carregando...' : 'Ver mais comentários' }}
    </button>
  </div>
</template>
