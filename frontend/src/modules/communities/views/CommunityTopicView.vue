<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { timeAgo } from '@/shared/utils/timeAgo'
import { useAuth } from '@/shared/auth/useAuth'
import { useCommunity } from '../composables/useCommunity'
import { communitiesApi } from '../services/communitiesApi'
import { reactionsService } from '@/modules/feed/services/reactionsService'
import ReactionButton from '@/modules/feed/components/ReactionButton.vue'
import CommentSection from '@/modules/feed/components/CommentSection.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import type { TopicDetail } from '../types'

const route = useRoute()
const router = useRouter()
const { user: viewerUser } = useAuth()

const slug = computed(() => String(route.params.slug ?? ''))
const topicId = computed(() => String(route.params.topicId ?? ''))

const { community, viewerMembership } = useCommunity(() => slug.value)

const topic = ref<TopicDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const userReaction = ref<string | null>(null)
const liveReactionCount = ref(0)

const isModerator = computed(() =>
  viewerMembership.value?.role === 'owner' || viewerMembership.value?.role === 'moderator',
)

const canDelete = computed(() => {
  if (!topic.value || !viewerUser.value) return false
  if (topic.value.authorId === viewerUser.value.id) return true
  return isModerator.value
})

async function loadTopic() {
  if (!community.value) return
  loading.value = true
  error.value = null
  try {
    const data = await communitiesApi.getTopic(community.value.id, topicId.value)
    topic.value = { ...data.topic, meta: data.meta }
    liveReactionCount.value = topic.value.reactionCount
    await loadUserReaction()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string }
    error.value = err?.response?.data?.message || err?.message || 'Erro ao carregar tópico.'
  } finally {
    loading.value = false
  }
}

async function loadUserReaction() {
  if (!topic.value) return
  try {
    const { counts, myReaction } = await reactionsService.getReactions(topic.value.postId)
    userReaction.value = myReaction
    liveReactionCount.value = Object.values(counts).reduce((acc, c) => acc + c, 0)
  } catch {
    userReaction.value = null
  }
}

function onReactionChanged(newType: string | null) {
  const prev = userReaction.value
  if (prev === null && newType !== null) liveReactionCount.value += 1
  else if (prev !== null && newType === null) liveReactionCount.value = Math.max(0, liveReactionCount.value - 1)
  userReaction.value = newType
}

watch(community, c => { if (c) loadTopic() }, { immediate: true })

const deleteConfirm = ref(false)
const deleteError = ref<string | null>(null)
const deleteLoading = ref(false)

function onDelete() {
  if (!community.value || !topic.value) return
  deleteConfirm.value = true
}

async function doDelete() {
  if (!community.value || !topic.value) return
  deleteConfirm.value = false
  deleteLoading.value = true
  try {
    await communitiesApi.deleteTopic(community.value.id, topic.value.postId)
    router.push(`/comunidades/${community.value.slug}`)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string }
    deleteError.value = err?.response?.data?.message || err?.message || 'Falha ao excluir tópico.'
  } finally {
    deleteLoading.value = false
  }
}

const authorInitial = computed(() =>
  topic.value?.authorName ? topic.value.authorName[0].toUpperCase() : '?',
)
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="community-topic-view">
    <div class="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <button
        type="button"
        @click="router.push(`/comunidades/${slug}`)"
        class="text-xs text-slate-400 hover:text-amber-400 transition-colors"
      >
        ← Voltar para a comunidade
      </button>

      <div v-if="loading && !topic" class="text-slate-400 text-sm text-center py-12">
        Carregando…
      </div>
      <div v-else-if="error" class="text-red-400 text-sm text-center py-12">{{ error }}</div>

      <article
        v-else-if="topic"
        class="bg-[#1e2038] rounded-2xl border border-[#252640] p-5 space-y-4"
      >
        <header class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-slate-600 overflow-hidden flex-shrink-0 flex items-center justify-center">
            <img
              v-if="topic.authorAvatarUrl"
              :src="topic.authorAvatarUrl"
              :alt="topic.authorName"
              class="w-full h-full object-cover"
            />
            <span v-else class="text-sm font-bold text-slate-300">{{ authorInitial }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-slate-200">{{ topic.authorName }}</div>
            <div class="text-[11px] text-slate-500">{{ timeAgo(topic.createdAt) }}</div>
          </div>

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
            @click="onDelete"
            class="px-2 py-1 rounded text-[10px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
          >
            Excluir
          </button>
        </header>

        <p v-if="topic.content" class="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
          {{ topic.content }}
        </p>

        <div v-if="topic.media && topic.media.length > 0" class="grid grid-cols-2 gap-2">
          <img
            v-for="(m, i) in topic.media"
            :key="i"
            :src="m.url"
            alt=""
            class="w-full rounded-lg object-cover max-h-72"
          />
        </div>

        <div class="flex items-center gap-3 pt-2 border-t border-[#252640]">
          <ReactionButton
            :post-id="topic.postId"
            :count="liveReactionCount"
            :user-reaction="userReaction"
            @reaction-changed="onReactionChanged"
          />
          <span class="text-[11px] text-slate-500">
            {{ topic.commentCount }} {{ topic.commentCount === 1 ? 'comentário' : 'comentários' }}
          </span>
        </div>

        <CommentSection
          v-if="viewerUser"
          :post-id="topic.postId"
          :current-user-id="viewerUser.id"
        />
      </article>

      <AppConfirmDialog
        :open="deleteConfirm"
        title="Excluir tópico?"
        description="O tópico será removido permanentemente."
        confirm-label="Excluir"
        variant="danger"
        :loading="deleteLoading"
        @cancel="deleteConfirm = false"
        @confirm="doDelete"
      />

      <AppConfirmDialog
        :open="deleteError !== null"
        title="Erro"
        :description="deleteError ?? ''"
        confirm-label="OK"
        :show-cancel="false"
        @confirm="deleteError = null"
      />
    </div>
  </div>
</template>
