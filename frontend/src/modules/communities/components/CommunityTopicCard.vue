<script setup lang="ts">
// TODO(US2): The feed module's PostCard is tightly coupled to the feed Post type and
// feedService. When post/reaction/comment APIs are extended to support communityId,
// consider accepting a PostCard-compatible prop shape here and delegating media/reaction
// rendering to feed components to avoid duplication. For US1 a minimal own body is used.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { timeAgo } from '@/shared/utils/timeAgo'
import type { TopicSummary } from '../types'

const props = defineProps<{
  topic: TopicSummary
  communitySlug: string
  canDelete?: boolean
}>()

const emit = defineEmits<{ (e: 'delete', topicId: string): void }>()

const router = useRouter()

function onDeleteClick(e: MouseEvent) {
  e.stopPropagation()
  emit('delete', props.topic.postId)
}

const authorInitial = computed(() =>
  props.topic.authorName ? props.topic.authorName[0].toUpperCase() : '?',
)

const excerpt = computed(() => {
  const text = props.topic.content ?? ''
  return text.length > 200 ? text.slice(0, 200) + '…' : text
})

function goTopic() {
  router.push(`/comunidades/${props.communitySlug}/topicos/${props.topic.postId}`)
}
</script>

<template>
  <article
    class="bg-[#1e2038] rounded-2xl border border-[#252640] p-4 hover:border-amber-500/30 transition-colors cursor-pointer space-y-2"
    data-testid="community-topic-card"
    :data-topic-id="topic.postId"
    @click="goTopic"
  >
    <!-- Author + timestamp row -->
    <div class="flex items-center gap-2">
      <div class="w-7 h-7 rounded-full bg-slate-600 overflow-hidden flex-shrink-0 flex items-center justify-center">
        <img
          v-if="topic.authorAvatarUrl"
          :src="topic.authorAvatarUrl"
          :alt="topic.authorName"
          class="w-full h-full object-cover"
        />
        <span v-else class="text-xs font-bold text-slate-300">{{ authorInitial }}</span>
      </div>
      <span class="text-xs font-semibold text-slate-300">{{ topic.authorName }}</span>
      <span class="text-[10px] text-slate-600 ml-auto">{{ timeAgo(topic.createdAt) }}</span>

      <!-- State badges -->
      <span
        v-if="topic.pinned"
        class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"
      >
        Fixado
      </span>
      <span
        v-if="topic.locked"
        class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-600/30 text-slate-400 border border-slate-500/30"
      >
        Fechado
      </span>

      <button
        v-if="canDelete"
        type="button"
        @click="onDeleteClick"
        class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
        data-testid="topic-delete-btn"
      >
        Excluir
      </button>
    </div>

    <!-- Content excerpt -->
    <p class="text-sm text-slate-300 leading-relaxed">{{ excerpt }}</p>

    <!-- Media thumbnails (first image only for US1) -->
    <div v-if="topic.media && topic.media.length > 0" class="flex gap-1.5">
      <img
        v-for="(m, i) in topic.media.slice(0, 3)"
        :key="i"
        :src="m.url"
        alt=""
        class="w-16 h-16 rounded-lg object-cover"
      />
      <div
        v-if="topic.media.length > 3"
        class="w-16 h-16 rounded-lg bg-slate-700/40 flex items-center justify-center text-xs text-slate-400"
      >
        +{{ topic.media.length - 3 }}
      </div>
    </div>

    <!-- Footer: reactions + comments -->
    <div class="flex items-center gap-4 pt-1 border-t border-[#252640]">
      <span class="text-[11px] text-slate-500">
        {{ topic.reactionCount }} {{ topic.reactionCount === 1 ? 'reação' : 'reações' }}
      </span>
      <span class="text-[11px] text-slate-500">
        {{ topic.commentCount }} {{ topic.commentCount === 1 ? 'comentário' : 'comentários' }}
      </span>
    </div>
  </article>
</template>
