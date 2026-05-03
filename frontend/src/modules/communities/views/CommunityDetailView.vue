<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CommunityTopicCard from '../components/CommunityTopicCard.vue'
import MemberRow from '../components/MemberRow.vue'
import { useCommunity } from '../composables/useCommunity'
import { useCommunityActions } from '../composables/useCommunityActions'
import { communitiesApi } from '../services/communitiesApi'
import type { TopicSummary, MemberWithUser, JoinRequestWithUser, CommunityCategory } from '../types'
import { useAuth } from '@/shared/auth/useAuth'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import AppPromptDialog from '@/shared/ui/AppPromptDialog.vue'

const route = useRoute()
const router = useRouter()
const { user: viewerUser } = useAuth()

const slug = computed(() => String(route.params.slug ?? ''))
const { community, viewerMembership, moderators, loading, error, reload } = useCommunity(() => slug.value)
const actions = useCommunityActions()

type Tab = 'topics' | 'members' | 'about'
const activeTab = ref<Tab>('topics')

// Topics
const topics = ref<TopicSummary[]>([])
const topicsNextCursor = ref<string | null>(null)
const topicsLoading = ref(false)

// Members
const members = ref<MemberWithUser[]>([])
const membersNextCursor = ref<string | null>(null)
const membersLoading = ref(false)
const membersLoadingMore = ref(false)
const membersStatusFilter = ref<'active' | 'pending' | 'banned'>('active')

// Join requests (visible to owner/moderator)
const joinRequests = ref<JoinRequestWithUser[]>([])
const joinRequestsLoading = ref(false)

// New topic
const showTopicComposer = ref(false)
const topicContent = ref('')
const topicSubmitting = ref(false)
const topicSubmitError = ref<string | null>(null)

const CATEGORY_LABELS: Record<CommunityCategory, string> = {
  boardgames: 'Board Games',
  tcg: 'TCG',
  'rpg-mesa': 'RPG de Mesa',
  'rpg-digital': 'RPG Digital',
  mmo: 'MMO',
  souls: 'Souls-like',
  fps: 'FPS',
  survival: 'Survival',
  indie: 'Indie',
  retro: 'Retro',
  mobile: 'Mobile',
  simulation: 'Simulação',
  strategy: 'Estratégia',
  mods: 'Mods',
  'community-events': 'Eventos de Comunidade',
}

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Pública',
  restricted: 'Restrita',
}

const categoryLabel = computed(() =>
  community.value ? (CATEGORY_LABELS[community.value.category] ?? community.value.category) : '',
)

const visibilityLabel = computed(() =>
  community.value ? (VISIBILITY_LABELS[community.value.visibility] ?? community.value.visibility) : '',
)

const isActiveMember = computed(() => viewerMembership.value?.status === 'active')
const isModerator = computed(() =>
  viewerMembership.value?.role === 'owner' || viewerMembership.value?.role === 'moderator',
)
const isOwner = computed(() => viewerMembership.value?.role === 'owner')

// CTA state
const viewerStatus = computed<'active' | 'pending' | 'banned' | 'none'>(() => {
  const vm = viewerMembership.value
  if (!vm) return 'none'
  return vm.status as 'active' | 'pending' | 'banned'
})

const canEnter = computed(() => {
  const v = community.value
  if (!v) return false
  return viewerStatus.value === 'none' && (v.visibility === 'public' || v.visibility === 'restricted')
})

const canLeave = computed(() =>
  viewerStatus.value === 'active' && !isOwner.value,
)

async function loadTopics() {
  if (!community.value) return
  topicsLoading.value = true
  try {
    const page = await communitiesApi.listTopics(community.value.id)
    topics.value = page.topics
    topicsNextCursor.value = page.nextCursor
  } finally {
    topicsLoading.value = false
  }
}

const topicsLoadingMore = ref(false)
async function loadMoreTopics() {
  if (!community.value || !topicsNextCursor.value || topicsLoadingMore.value) return
  topicsLoadingMore.value = true
  try {
    const page = await communitiesApi.listTopics(community.value.id, { cursor: topicsNextCursor.value })
    topics.value = [...topics.value, ...page.topics]
    topicsNextCursor.value = page.nextCursor
  } finally {
    topicsLoadingMore.value = false
  }
}

async function loadMembers() {
  if (!community.value) return
  membersLoading.value = true
  try {
    const page = await communitiesApi.listMembers(community.value.id, { status: membersStatusFilter.value })
    members.value = page.members
    membersNextCursor.value = page.nextCursor
  } finally {
    membersLoading.value = false
  }
}

async function loadMoreMembers() {
  if (!community.value || !membersNextCursor.value || membersLoadingMore.value) return
  membersLoadingMore.value = true
  try {
    const page = await communitiesApi.listMembers(community.value.id, { status: membersStatusFilter.value, cursor: membersNextCursor.value })
    members.value = [...members.value, ...page.members]
    membersNextCursor.value = page.nextCursor
  } finally {
    membersLoadingMore.value = false
  }
}

async function loadJoinRequests() {
  if (!community.value || !isModerator.value) return
  joinRequestsLoading.value = true
  try {
    const page = await communitiesApi.listJoinRequests(community.value.id)
    joinRequests.value = page.requests
  } finally {
    joinRequestsLoading.value = false
  }
}

async function switchTab(tab: Tab) {
  activeTab.value = tab
  if (tab === 'topics' && topics.value.length === 0 && canViewContent.value) await loadTopics()
  if (tab === 'members' && canViewContent.value) {
    await loadMembers()
    await loadJoinRequests()
  }
}

const canViewContent = computed(() => {
  const v = community.value
  if (!v) return false
  return v.visibility === 'public' || isActiveMember.value
})

watch(canViewContent, (can, prevCan) => {
  if (can && !prevCan) loadTopics()
}, { immediate: true })

async function onJoin() {
  const c = community.value
  if (!c) return
  try {
    await actions.join(c.id)
    await reload()
  } catch {
    // error surfaced via actions.error.value
  }
}

async function onLeave() {
  const c = community.value
  if (!c) return
  try {
    await actions.leave(c.id)
    await reload()
  } catch {
    // error surfaced via actions.error.value
  }
}

async function submitTopic() {
  if (!community.value || !topicContent.value.trim() || topicSubmitting.value) return
  topicSubmitting.value = true
  topicSubmitError.value = null
  try {
    await communitiesApi.createTopic(community.value.id, {
      content: topicContent.value.trim(),
    })
    topicContent.value = ''
    await loadTopics()
    showTopicComposer.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } }; message?: string }
    topicSubmitError.value = err?.response?.data?.error ?? err?.message ?? 'Falha ao publicar tópico.'
  } finally {
    topicSubmitting.value = false
  }
}

async function approveRequest(userId: string) {
  if (!community.value) return
  await communitiesApi.approveJoinRequest(community.value.id, userId)
  joinRequests.value = joinRequests.value.filter(r => r.userId !== userId)
  members.value = members.value.filter(m => m.userId !== userId)
  await reload()
}

async function rejectRequest(userId: string) {
  if (!community.value) return
  await communitiesApi.rejectJoinRequest(community.value.id, userId)
  joinRequests.value = joinRequests.value.filter(r => r.userId !== userId)
  members.value = members.value.filter(m => m.userId !== userId)
}

const moderationBusy = ref<string | null>(null)
const moderationError = ref<string | null>(null)

const kickConfirm = ref<string | null>(null)
const banConfirm = ref<string | null>(null)
const topicDeleteError = ref<string | null>(null)

function patchMember(userId: string, patch: Partial<MemberWithUser>) {
  members.value = members.value.map(m => (m.userId === userId ? { ...m, ...patch } : m))
}

function removeMember(userId: string) {
  members.value = members.value.filter(m => m.userId !== userId)
}

async function runModeration(userId: string, fn: () => Promise<void>) {
  if (!community.value) return
  moderationBusy.value = userId
  moderationError.value = null
  try {
    await fn()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string }
    moderationError.value = err?.response?.data?.message || err?.message || 'Falha na ação.'
  } finally {
    moderationBusy.value = null
  }
}

async function promoteMember(userId: string) {
  await runModeration(userId, async () => {
    const updated = await communitiesApi.promoteMember(community.value!.id, userId)
    patchMember(userId, { role: updated.role, status: updated.status })
    await reload()
  })
}

async function demoteMember(userId: string) {
  await runModeration(userId, async () => {
    const updated = await communitiesApi.demoteMember(community.value!.id, userId)
    patchMember(userId, { role: updated.role, status: updated.status })
    await reload()
  })
}

function banMember(userId: string) {
  banConfirm.value = userId
}

async function doBan(reason: string) {
  const userId = banConfirm.value!
  banConfirm.value = null
  await runModeration(userId, async () => {
    const updated = await communitiesApi.banMember(community.value!.id, userId, reason || undefined)
    patchMember(userId, { role: updated.role, status: updated.status, banReason: updated.banReason })
  })
}

async function unbanMember(userId: string) {
  await runModeration(userId, async () => {
    const updated = await communitiesApi.unbanMember(community.value!.id, userId)
    patchMember(userId, { role: updated.role, status: updated.status, banReason: null })
  })
}

function kickMember(userId: string) {
  kickConfirm.value = userId
}

async function doKick() {
  const userId = kickConfirm.value!
  kickConfirm.value = null
  await runModeration(userId, async () => {
    await communitiesApi.kickMember(community.value!.id, userId)
    removeMember(userId)
    await reload()
  })
}

function canModerateTarget(target: MemberWithUser): boolean {
  if (!viewerUser.value || target.userId === viewerUser.value.id) return false
  if (target.role === 'owner') return false
  if (isOwner.value) return true
  if (isModerator.value) return target.role === 'member'
  return false
}

function canDeleteTopic(topic: TopicSummary): boolean {
  if (!viewerUser.value) return false
  if (topic.authorId === viewerUser.value.id) return true
  return isModerator.value
}

async function deleteTopic(topicId: string) {
  if (!community.value) return
  try {
    await communitiesApi.deleteTopic(community.value.id, topicId)
    topics.value = topics.value.filter(t => t.postId !== topicId)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string }
    topicDeleteError.value = err?.response?.data?.message || err?.message || 'Falha ao excluir tópico.'
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="community-detail-view">
    <div v-if="loading && !community" class="text-slate-400 text-sm text-center py-12">
      Carregando…
    </div>
    <div v-else-if="error" class="text-center py-16 px-4">
      <template v-if="(error as any)?.response?.data?.error === 'COMMUNITY_DELETED'">
        <div class="text-4xl mb-4">🚫</div>
        <h2 class="text-lg font-semibold text-slate-300 mb-2">Comunidade suspensa</h2>
        <p class="text-sm text-slate-500">Esta comunidade foi suspensa pelos administradores da plataforma.</p>
      </template>
      <template v-else-if="(error as any)?.response?.data?.error === 'COMMUNITY_NOT_FOUND'">
        <div class="text-4xl mb-4">🔍</div>
        <h2 class="text-lg font-semibold text-slate-300 mb-2">Comunidade não encontrada</h2>
        <p class="text-sm text-slate-500">Esta comunidade não existe ou foi removida.</p>
      </template>
      <template v-else>
        <p class="text-red-400 text-sm">Erro ao carregar comunidade.</p>
      </template>
    </div>

    <template v-else-if="community">
      <!-- Cover header -->
      <header class="relative">
        <div class="h-40 bg-slate-800 overflow-hidden">
          <img
            v-if="community.coverUrl"
            :src="community.coverUrl"
            :alt="community.name"
            class="w-full h-full object-cover"
          />
        </div>

        <div class="max-w-5xl mx-auto px-4">
          <div class="flex items-end gap-4 -mt-8 mb-4">
            <!-- Icon -->
            <div class="w-16 h-16 rounded-xl bg-slate-700 border-2 border-[#0f0f1a] overflow-hidden flex-shrink-0">
              <img
                v-if="community.iconUrl"
                :src="community.iconUrl"
                :alt="`Ícone de ${community.name}`"
                class="w-full h-full object-cover"
              />
            </div>

            <div class="flex-1 pb-1 min-w-0">
              <h1 class="text-xl font-bold text-slate-100 truncate">{{ community.name }}</h1>
              <div class="flex flex-wrap items-center gap-2 mt-1">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {{ categoryLabel }}
                </span>
                <span class="text-xs text-slate-500">{{ visibilityLabel }}</span>
                <span class="text-xs text-slate-500">
                  {{ community.memberCount.toLocaleString('pt-BR') }} membros
                </span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2 flex-shrink-0 pb-1">
              <!-- Owner: edit -->
              <button
                v-if="isOwner"
                type="button"
                @click="router.push(`/comunidades/${community.slug}/editar`)"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 transition-colors"
              >
                Editar
              </button>

              <!-- Active member: leave (non-owner) -->
              <button
                v-if="canLeave"
                type="button"
                :disabled="actions.acting.value"
                @click="onLeave"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 disabled:opacity-50 transition-colors"
              >
                Sair
              </button>

              <!-- Non-member: join or request entry -->
              <button
                v-if="canEnter"
                type="button"
                :disabled="actions.acting.value"
                @click="onJoin"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] disabled:opacity-50 transition-colors"
              >
                {{ community.visibility === 'restricted' ? 'Pedir entrada' : 'Entrar' }}
              </button>

              <!-- Pending -->
              <span
                v-if="viewerStatus === 'pending'"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
              >
                Pedido pendente
              </span>

              <!-- Banned -->
              <span
                v-if="viewerStatus === 'banned'"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400"
              >
                Acesso bloqueado
              </span>
            </div>
          </div>
        </div>
      </header>

      <!-- Tabs -->
      <div class="bg-[#1e2038] border-b border-[#252640]">
        <div class="max-w-5xl mx-auto px-4">
          <nav class="flex gap-1" role="tablist">
            <button
              v-for="tab in (['topics', 'members', 'about'] as Tab[])"
              :key="tab"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab"
              @click="switchTab(tab)"
              :class="[
                'px-4 py-3 text-xs font-semibold border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200',
              ]"
            >
              {{ tab === 'topics' ? 'Tópicos' : tab === 'members' ? 'Membros' : 'Sobre' }}
            </button>
          </nav>
        </div>
      </div>

      <!-- Tab content -->
      <div class="max-w-5xl mx-auto px-4 py-6 space-y-4">

        <!-- TOPICS TAB -->
        <template v-if="activeTab === 'topics'">
          <!-- New topic CTA (active members only) -->
          <div v-if="isActiveMember" class="flex justify-end">
            <button
              v-if="!showTopicComposer"
              type="button"
              @click="showTopicComposer = true"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] transition-colors"
            >
              + Novo tópico
            </button>
          </div>

          <!-- Topic composer -->
          <div
            v-if="showTopicComposer"
            class="bg-[#1e2038] rounded-2xl p-4 border border-[#252640] space-y-3"
          >
            <textarea
              v-model="topicContent"
              rows="4"
              placeholder="Sobre o que você quer falar?"
              maxlength="5000"
              class="w-full bg-[#252640] text-slate-200 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50 placeholder:text-slate-600"
            />
            <p v-if="topicSubmitError" class="text-xs text-red-400">{{ topicSubmitError }}</p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                @click="showTopicComposer = false; topicContent = ''; topicSubmitError = null"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                :disabled="topicSubmitting || !topicContent.trim()"
                @click="submitTopic"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] disabled:opacity-50 transition-colors"
              >
                {{ topicSubmitting ? 'Publicando…' : 'Publicar tópico' }}
              </button>
            </div>
          </div>

          <p v-if="topicsLoading && topics.length === 0" class="text-slate-400 text-sm">
            Carregando tópicos…
          </p>

          <div v-else-if="!canViewContent" class="text-slate-500 text-sm text-center py-8">
            Entre na comunidade para ver os tópicos.
          </div>

          <div v-else-if="topics.length === 0" class="text-slate-500 text-sm text-center py-8">
            Nenhum tópico ainda.
            <span v-if="isActiveMember"> Seja o primeiro a postar!</span>
          </div>

          <div v-if="canViewContent" class="space-y-3">
            <CommunityTopicCard
              v-for="topic in topics"
              :key="topic.postId"
              :topic="topic"
              :community-slug="community.slug"
              :can-delete="canDeleteTopic(topic)"
              @delete="deleteTopic"
            />
          </div>

          <div v-if="topicsNextCursor && canViewContent" class="flex justify-center pt-2">
            <button
              type="button"
              :disabled="topicsLoadingMore"
              @click="loadMoreTopics"
              class="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 disabled:opacity-50 transition-colors"
            >
              {{ topicsLoadingMore ? 'Carregando…' : 'Carregar mais' }}
            </button>
          </div>
        </template>

        <!-- MEMBERS TAB -->
        <template v-else-if="activeTab === 'members'">
          <!-- Status filter tabs (owner/moderator only) -->
          <div v-if="isModerator" class="flex gap-1">
            <button
              v-for="s in (['active', 'pending', 'banned'] as const)"
              :key="s"
              type="button"
              @click="membersStatusFilter = s; loadMembers()"
              :class="[
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                membersStatusFilter === s
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-slate-700/30 text-slate-400 hover:text-slate-200 border border-transparent',
              ]"
            >
              {{ s === 'active' ? 'Ativos' : s === 'pending' ? 'Pendentes' : 'Banidos' }}
              <span
                v-if="s === 'pending' && joinRequests.length > 0"
                class="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-yellow-500/20 text-yellow-400"
              >
                {{ joinRequests.length }}
              </span>
            </button>
          </div>

          <p v-if="membersLoading && members.length === 0" class="text-slate-400 text-sm">
            Carregando membros…
          </p>

          <div v-else-if="members.length === 0" class="text-slate-500 text-sm text-center py-8">
            {{ membersStatusFilter === 'active' ? 'Nenhum membro ativo.' : membersStatusFilter === 'pending' ? 'Nenhum pedido pendente.' : 'Nenhum membro banido.' }}
          </div>

          <div
            v-if="moderationError"
            class="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2"
          >
            {{ moderationError }}
          </div>

          <div
            v-else
            class="bg-[#1e2038] rounded-2xl border border-[#252640] px-4"
            data-testid="members-list"
          >
            <MemberRow
              v-for="member in members"
              :key="member.id"
              :member="member"
            >
              <template
                v-if="isModerator && (member.status === 'pending' || canModerateTarget(member))"
                #actions
              >
                <div class="flex items-center gap-1.5">
                  <template v-if="member.status === 'pending'">
                    <button
                      type="button"
                      @click="approveRequest(member.userId)"
                      class="px-2 py-1 rounded text-[10px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      @click="rejectRequest(member.userId)"
                      class="px-2 py-1 rounded text-[10px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                    >
                      Rejeitar
                    </button>
                  </template>
                  <template v-else-if="member.status === 'active' && canModerateTarget(member)">
                    <button
                      v-if="isOwner && member.role === 'member'"
                      type="button"
                      :disabled="moderationBusy === member.userId"
                      @click="promoteMember(member.userId)"
                      class="px-2 py-1 rounded text-[10px] font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 disabled:opacity-50 transition-colors"
                    >
                      Promover
                    </button>
                    <button
                      v-if="isOwner && member.role === 'moderator'"
                      type="button"
                      :disabled="moderationBusy === member.userId"
                      @click="demoteMember(member.userId)"
                      class="px-2 py-1 rounded text-[10px] font-semibold bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 border border-slate-600/40 disabled:opacity-50 transition-colors"
                    >
                      Rebaixar
                    </button>
                    <button
                      type="button"
                      :disabled="moderationBusy === member.userId"
                      @click="banMember(member.userId)"
                      class="px-2 py-1 rounded text-[10px] font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 disabled:opacity-50 transition-colors"
                    >
                      Banir
                    </button>
                    <button
                      type="button"
                      :disabled="moderationBusy === member.userId"
                      @click="kickMember(member.userId)"
                      class="px-2 py-1 rounded text-[10px] font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 disabled:opacity-50 transition-colors"
                    >
                      Remover
                    </button>
                  </template>
                  <button
                    v-else-if="member.status === 'banned' && canModerateTarget(member)"
                    type="button"
                    :disabled="moderationBusy === member.userId"
                    @click="unbanMember(member.userId)"
                    class="px-2 py-1 rounded text-[10px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 disabled:opacity-50 transition-colors"
                  >
                    Desbanir
                  </button>
                </div>
              </template>
            </MemberRow>
          </div>

          <div v-if="membersNextCursor" class="flex justify-center pt-2">
            <button
              type="button"
              :disabled="membersLoadingMore"
              @click="loadMoreMembers"
              class="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 disabled:opacity-50 transition-colors"
            >
              {{ membersLoadingMore ? 'Carregando…' : 'Carregar mais' }}
            </button>
          </div>
        </template>

        <!-- ABOUT TAB -->
        <template v-else-if="activeTab === 'about'">
          <div class="bg-[#1e2038] rounded-2xl p-5 border border-[#252640] space-y-3">
            <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Descrição</h2>
            <p class="text-sm text-slate-300 whitespace-pre-line">{{ community.description }}</p>
          </div>

          <!-- Rules placeholder (US4) -->
          <div class="bg-[#1e2038] rounded-2xl p-5 border border-[#252640] space-y-3">
            <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Regras</h2>
            <p v-if="community.rules" class="text-sm text-slate-300 whitespace-pre-line">
              {{ community.rules }}
            </p>
            <p v-else class="text-sm text-slate-500 italic">
              Sem regras definidas. <!-- Edição de regras disponível em US4 -->
            </p>
          </div>

          <!-- Welcome message placeholder (US4) -->
          <div
            v-if="community.welcomeMessage"
            class="bg-[#1e2038] rounded-2xl p-5 border border-[#252640] space-y-2"
          >
            <h2 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Boas-vindas</h2>
            <p class="text-sm text-slate-300 whitespace-pre-line">{{ community.welcomeMessage }}</p>
          </div>

          <!-- Moderators -->
          <div
            v-if="moderators.length > 0"
            class="bg-[#1e2038] rounded-2xl p-4 border border-[#252640] space-y-3"
          >
            <h2 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Moderação</h2>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="mod in moderators"
                :key="mod.userId"
                class="flex items-center gap-2 bg-slate-700/30 rounded-lg px-2.5 py-1.5"
              >
                <div class="w-6 h-6 rounded-full bg-slate-600 overflow-hidden flex-shrink-0">
                  <img
                    v-if="mod.avatarUrl"
                    :src="mod.avatarUrl"
                    :alt="mod.displayName"
                    class="w-full h-full object-cover"
                  />
                </div>
                <span class="text-xs text-slate-300">{{ mod.displayName }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>

  <AppConfirmDialog
    :open="!!kickConfirm"
    title="Remover membro?"
    description="O membro será removido da comunidade."
    confirm-label="Remover"
    variant="danger"
    :loading="moderationBusy === kickConfirm"
    @cancel="kickConfirm = null"
    @confirm="doKick"
  />

  <AppPromptDialog
    :open="!!banConfirm"
    title="Banir membro?"
    description="Informe o motivo (opcional)."
    placeholder="Motivo do banimento..."
    confirm-label="Banir"
    :loading="moderationBusy === banConfirm"
    @cancel="banConfirm = null"
    @confirm="doBan"
  />

  <AppConfirmDialog
    :open="!!topicDeleteError"
    title="Erro"
    :description="topicDeleteError ?? ''"
    confirm-label="OK"
    variant="primary"
    :show-cancel="false"
    @confirm="topicDeleteError = null"
    @cancel="topicDeleteError = null"
  />
</template>
