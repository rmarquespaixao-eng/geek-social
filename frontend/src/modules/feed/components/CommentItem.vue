<!-- src/modules/feed/components/CommentItem.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { Pencil, Trash2, Check, X } from 'lucide-vue-next'
import { commentsService } from '../services/commentsService'
import { timeAgo } from '@/shared/utils/timeAgo'
import type { Comment } from '../types'

const props = defineProps<{
  postId: string
  comment: Comment
  currentUserId: string
}>()

const emit = defineEmits<{
  deleted: [id: string]
  updated: [comment: Comment]
}>()

const editing = ref(false)
const editContent = ref(props.comment.content)
const saving = ref(false)
const deleting = ref(false)

async function saveEdit() {
  if (!editContent.value.trim() || saving.value) return
  saving.value = true
  try {
    const updated = await commentsService.updateComment(props.postId, props.comment.id, editContent.value.trim())
    emit('updated', updated)
    editing.value = false
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (deleting.value) return
  deleting.value = true
  try {
    await commentsService.deleteComment(props.postId, props.comment.id)
    emit('deleted', props.comment.id)
  } finally {
    deleting.value = false
  }
}

const isOwn = props.comment.authorId === props.currentUserId
</script>

<template>
  <div class="flex gap-2.5">
    <img
      v-if="comment.authorAvatarUrl"
      :src="comment.authorAvatarUrl"
      :alt="comment.authorName"
      class="w-8 h-8 rounded-full object-cover flex-shrink-0"
    />
    <div
      v-else
      class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-semibold text-slate-300 flex-shrink-0"
    >
      {{ comment.authorName.charAt(0).toUpperCase() }}
    </div>

    <div class="flex-1 min-w-0">
      <div class="bg-[#252640] rounded-xl px-3 py-2">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="text-sm font-semibold text-slate-200">{{ comment.authorName }}</span>
          <span class="text-xs text-slate-500">{{ timeAgo(comment.createdAt) }}</span>
        </div>

        <template v-if="editing">
          <textarea
            v-model="editContent"
            rows="2"
            class="w-full bg-transparent text-sm text-slate-300 resize-none focus:outline-none"
          />
          <div class="flex gap-2 mt-1">
            <button @click="saveEdit" :disabled="saving" class="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
              <Check :size="12" /> Salvar
            </button>
            <button @click="editing = false" class="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
              <X :size="12" /> Cancelar
            </button>
          </div>
        </template>
        <p v-else class="text-sm text-slate-300 break-words">{{ comment.content }}</p>
      </div>

      <div v-if="isOwn" class="flex gap-3 mt-1 ml-2">
        <button @click="editing = true" class="text-xs text-slate-500 hover:text-amber-400 flex items-center gap-1 transition-colors">
          <Pencil :size="11" /> Editar
        </button>
        <button @click="remove" :disabled="deleting" class="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors">
          <Trash2 :size="11" /> Excluir
        </button>
      </div>
    </div>
  </div>
</template>
