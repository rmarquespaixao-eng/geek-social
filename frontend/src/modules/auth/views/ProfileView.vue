<template>
  <div class="min-h-screen bg-(--color-bg-base) relative isolate">
    <!-- Loading skeleton -->
    <div v-if="loading" class="animate-pulse">
      <div class="h-[150px] sm:h-[200px] bg-(--color-bg-elevated)" />
      <div class="max-w-4xl mx-auto px-4 pt-4">
        <div class="h-6 bg-(--color-bg-elevated) rounded w-40 mt-16 mb-2" />
        <div class="h-4 bg-(--color-bg-elevated) rounded w-64" />
      </div>
    </div>

    <!-- Erro -->
    <div v-else-if="error" class="max-w-4xl mx-auto px-4 py-20 text-center">
      <p class="text-(--color-danger)">{{ error }}</p>
    </div>

    <!-- 404 — usuário não encontrado ou bloqueou o visitante -->
    <div
      v-else-if="notFound"
      class="flex min-h-[60vh] flex-col items-center justify-center text-center px-4"
    >
      <UserX class="mb-4 h-16 w-16 text-[#475569]" />
      <h2 class="text-xl font-bold text-[#e2e8f0]">Usuário não encontrado</h2>
      <p class="mt-2 text-sm text-[#94a3b8]">
        Este perfil não existe ou não está disponível para você.
      </p>
      <router-link
        to="/"
        class="mt-6 rounded-xl bg-[#f59e0b] px-5 py-2 text-sm font-semibold text-[#0f0f1a] hover:bg-[#d97706] transition-colors"
      >
        Voltar para o início
      </router-link>
    </div>

    <!-- Perfil -->
    <template v-else-if="profile">
      <!-- Background customizado (atrás de tudo, com overlay para legibilidade) -->
      <template v-if="profile.profileBackgroundUrl">
        <div
          class="absolute inset-0 -z-10 bg-cover bg-center pointer-events-none"
          :style="{ backgroundImage: `url(${profile.profileBackgroundUrl})` }"
        />
        <div class="absolute inset-0 -z-10 bg-gradient-to-b from-black/40 via-(--color-bg-base)/85 to-(--color-bg-base) pointer-events-none" />
      </template>
      <template v-else-if="profile.profileBackgroundColor">
        <div
          class="absolute inset-0 -z-10 pointer-events-none"
          :style="{ backgroundColor: profile.profileBackgroundColor }"
        />
        <div class="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-(--color-bg-base)/80 to-(--color-bg-base) pointer-events-none" />
      </template>

      <!-- Banner de capa -->
      <div
        class="relative h-[150px] sm:h-[200px] overflow-hidden"
        :class="(!profile.coverUrl && !profile.coverColor) ? 'bg-gradient-to-br from-(--color-accent-purple)/40 to-(--color-accent-blue)/30' : ''"
        :style="!profile.coverUrl && profile.coverColor ? { backgroundColor: profile.coverColor } : undefined"
      >
        <img
          v-if="profile.coverUrl"
          :src="profile.coverUrl"
          alt="Capa do perfil"
          class="w-full h-full object-cover"
        />
        <!-- Botões de capa (só perfil próprio) -->
        <div v-if="isOwnProfile" class="absolute top-3 right-3 flex items-center gap-2">
          <button
            v-if="profile.coverUrl"
            class="flex items-center gap-1.5 bg-black/50 hover:bg-red-600/80 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
            @click="handleCoverRemove"
          >
            <Trash2 :size="14" />
            Remover capa
          </button>
          <label
            class="flex items-center gap-1.5 bg-black/50 hover:bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            <Camera :size="14" />
            Alterar capa
            <input type="file" accept="image/*" class="hidden" @change="onCoverChange" />
          </label>
        </div>
      </div>

      <!-- Seção avatar + info -->
      <div class="max-w-4xl mx-auto px-4">
        <div class="flex items-end justify-between -mt-12 mb-6 pt-3">
          <!-- Avatar com botão de upload -->
          <div class="relative">
            <AppAvatar
              :src="profile.avatarUrl"
              :name="profile.displayName"
              :size="88"
              class="ring-4 ring-(--color-bg-base)"
              :class="{ 'cursor-pointer': profile.avatarUrl }"
              @click="profile.avatarUrl && (avatarZoom = true)"
            />
            <template v-if="isOwnProfile">
              <label
                class="absolute bottom-0 right-0 w-7 h-7 bg-(--color-accent-amber) rounded-full flex items-center justify-center cursor-pointer hover:brightness-110 transition-all"
                title="Alterar foto"
              >
                <Camera :size="13" class="text-[#0f0f1a]" />
                <input type="file" accept="image/*" class="hidden" @change="onAvatarChange" />
              </label>
              <button
                v-if="profile.avatarUrl"
                class="absolute -top-1 -right-1 w-5 h-5 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
                title="Remover foto"
                @click="handleAvatarRemove"
              >
                <X :size="10" class="text-white" />
              </button>
            </template>
          </div>

          <!-- Ações -->
          <div class="mb-3 flex items-center gap-2">
            <AppButton v-if="isOwnProfile" variant="ghost" class="gap-2" @click="showEditModal = true">
              <Settings :size="15" />
              Editar perfil
            </AppButton>
            <template v-if="!isOwnProfile && profile">
              <SendRequestButton :user-id="profile.id" />
              <!-- Menu ⋯ ações do perfil -->
              <div class="relative">
                <button
                  class="flex h-9 w-9 items-center justify-center rounded-xl border border-[#252640] text-[#94a3b8] hover:bg-[#252640] hover:text-[#e2e8f0] transition-colors"
                  @click.stop="blockMenuOpen = !blockMenuOpen"
                >
                  <span class="text-lg leading-none">⋯</span>
                </button>
                <div
                  v-if="blockMenuOpen"
                  class="absolute right-0 top-10 z-20 min-w-[180px] rounded-xl border border-[#252640] bg-[#1a1b2e] py-1 shadow-xl"
                  @click.stop
                  @mouseleave="blockMenuOpen = false"
                >
                  <button
                    class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#94a3b8] hover:bg-[#252640] transition-colors"
                    @click="handleOpenDm"
                  >
                    <MessageSquare :size="15" />
                    Enviar mensagem
                  </button>
                  <button
                    class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#94a3b8] hover:bg-[#252640] transition-colors"
                    @click="openReportDialog"
                  >
                    <Flag :size="15" />
                    Denunciar usuário
                  </button>
                  <button
                    class="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#ef4444] hover:bg-[#252640] transition-colors"
                    @click="handleBlockFromProfile"
                  >
                    <UserX :size="15" />
                    Bloquear usuário
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Nome + username + bio -->
        <div class="mb-6">
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-xl font-bold text-(--color-text-primary)">{{ profile.displayName }}</h1>
            <ReputationBadge :reputation="reputation" size="md" />
          </div>
          <p v-if="profile.displayName" class="text-(--color-text-muted) text-sm">@{{ profile.displayName.toLowerCase().replace(/\s+/g, '') }}</p>

          <!-- Bio -->
          <div v-if="profile.bio" class="mt-3 group relative">
            <p class="text-(--color-text-secondary) text-sm max-w-2xl whitespace-pre-wrap">{{ profile.bio }}</p>
            <button
              v-if="isOwnProfile"
              class="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 p-1 rounded-md text-(--color-text-muted) hover:text-(--color-accent-amber) transition-all"
              title="Editar"
              @click="showEditModal = true"
            >
              <Pencil :size="13" />
            </button>
          </div>
          <button
            v-else-if="isOwnProfile"
            class="mt-3 inline-flex items-center gap-1.5 text-xs text-(--color-text-muted) hover:text-(--color-accent-amber) transition-colors"
            @click="showEditModal = true"
          >
            <Pencil :size="12" />
            Adicionar uma bio
          </button>

          <!-- Sobre (campos extras) — metadata row inline -->
          <div v-if="hasAboutInfo" class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 max-w-2xl text-sm text-(--color-text-secondary)">
            <span v-if="profile.location" class="inline-flex items-center gap-1.5">
              <MapPin :size="14" class="text-(--color-text-muted)" />
              {{ profile.location }}
            </span>
            <span v-if="profile.pronouns" class="inline-flex items-center gap-1.5">
              <UserCircle :size="14" class="text-(--color-text-muted)" />
              {{ profile.pronouns }}
            </span>
            <span v-if="profile.birthday" class="inline-flex items-center gap-1.5">
              <Cake :size="14" class="text-(--color-text-muted)" />
              {{ formatBirthday(profile.birthday) }}
            </span>
            <a
              v-if="profile.website"
              :href="profile.website"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-(--color-accent-amber) hover:underline max-w-[260px] truncate"
            >
              <LinkIcon :size="14" />
              <span class="truncate">{{ profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '') }}</span>
            </a>
          </div>

          <!-- Interesses -->
          <div v-if="profile.interests && profile.interests.length > 0" class="mt-3 flex flex-wrap gap-1.5 max-w-2xl">
            <span
              v-for="tag in profile.interests"
              :key="tag"
              class="inline-flex items-center px-2.5 py-1 rounded-full bg-(--color-bg-elevated) text-(--color-text-secondary) text-xs"
            >
              {{ tag }}
            </span>
          </div>

          <div v-if="profile.privacy === 'private'" class="mt-3 inline-flex items-center gap-1.5 text-xs text-(--color-text-muted)">
            <Lock :size="12" />
            Perfil privado
          </div>
        </div>

        <!-- Stats -->
        <div v-if="!isProfileRestricted" class="flex gap-6 mb-6 border-b border-(--color-bg-elevated) pb-6">
          <div class="text-center">
            <p class="text-lg font-bold text-(--color-text-primary)">{{ profile.collectionsCount ?? '—' }}</p>
            <p class="text-xs text-(--color-text-muted)">Coleções</p>
          </div>
          <div class="text-center">
            <p class="text-lg font-bold text-(--color-text-primary)">{{ profile.itemsCount ?? '—' }}</p>
            <p class="text-xs text-(--color-text-muted)">Itens</p>
          </div>
          <div class="text-center">
            <p class="text-lg font-bold text-(--color-text-primary)">{{ profile.friendsCount ?? '—' }}</p>
            <p class="text-xs text-(--color-text-muted)">Amigos</p>
          </div>
          <div class="text-center">
            <p class="text-lg font-bold text-(--color-text-primary)">{{ profile.postsCount ?? '—' }}</p>
            <p class="text-xs text-(--color-text-muted)">Posts</p>
          </div>
        </div>

        <!-- Abas -->
        <div v-if="!isProfileRestricted" class="flex gap-1 mb-6 border-b border-(--color-bg-elevated)">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="switchTab(tab.id)"
            :class="[
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px rounded-t-lg',
              activeTab === tab.id
                ? 'border-(--color-accent-amber) text-(--color-accent-amber) bg-(--color-accent-amber)/5'
                : 'border-transparent text-(--color-text-muted) hover:text-(--color-text-secondary) hover:bg-(--color-bg-elevated)/50',
            ]"
          >
            <component :is="tab.icon" :size="15" />
            {{ tab.label }}
          </button>
        </div>

        <!-- Conteúdo das abas -->
        <div class="pb-12">
          <!-- Mensagem unificada de perfil restrito -->
          <div
            v-if="isProfileRestricted"
            class="mt-8 rounded-2xl bg-(--color-bg-elevated) px-6 py-14 text-center"
          >
            <Lock class="mx-auto mb-3 h-10 w-10 text-[#475569]" />
            <p class="font-semibold text-(--color-text-primary)">
              {{ profile?.privacy === 'private' ? 'Este perfil é privado' : 'Conteúdo apenas para amigos' }}
            </p>
            <p class="mt-1 text-sm text-(--color-text-muted)">
              {{ profile?.privacy === 'private'
                ? 'O conteúdo deste perfil não está visível.'
                : 'Adicione como amigo para ver posts, coleções e amigos.' }}
            </p>
          </div>

          <!-- Aba Feed -->
          <div v-else-if="activeTab === 'feed'" class="space-y-4">
            <PostComposer v-if="isOwnProfile" @posted="onPostCreated" />

            <div v-if="feedStore.profileLoading && feedStore.profilePosts.length === 0" class="text-center py-8 text-(--color-text-muted)">
              Carregando posts...
            </div>

            <div v-else-if="feedStore.profilePosts.length === 0" class="text-center py-8 text-(--color-text-muted)">
              Nenhum post ainda.
            </div>

            <template v-else>
              <PostCard
                v-for="post in feedStore.profilePosts"
                :key="post.id"
                :post="post"
                @deleted="onPostDeleted"
              />

              <button
                v-if="feedStore.profileHasMore"
                @click="feedStore.loadMoreUserPosts(profileUserId)"
                :disabled="feedStore.profileLoading"
                class="w-full py-3 text-sm text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50"
              >
                {{ feedStore.profileLoading ? 'Carregando...' : 'Carregar mais' }}
              </button>
            </template>
          </div>

          <!-- Aba Coleções -->
          <div v-else-if="activeTab === 'collections'">
            <!-- Visualizando items de uma coleção embutido -->
            <ProfileCollectionItems
              v-if="selectedCollectionId"
              :collection-id="selectedCollectionId"
              @back="closeCollectionItems"
            />

            <!-- Lista de coleções -->
            <template v-else>
              <div v-if="collectionsLoading" class="text-center py-8 text-(--color-text-muted) text-sm">
                Carregando coleções...
              </div>
              <div v-else-if="collections.length === 0" class="text-center py-8 text-(--color-text-muted) text-sm">
                Nenhuma coleção pública.
              </div>
              <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <CollectionCard
                  v-for="col in collections"
                  :key="col.id"
                  :collection="col"
                  :owned="isOwnProfile"
                  @click="goToCollection(col.id)"
                  @cover-updated="col => { const idx = collections.findIndex(c => c.id === col.id); if (idx !== -1) collections[idx] = col }"
                />
              </div>
            </template>
          </div>

          <!-- Aba Amigos -->
          <div v-else-if="activeTab === 'friends'">
            <div v-if="profileFriendsLoading" class="text-center py-8 text-(--color-text-muted) text-sm">
              Carregando amigos...
            </div>
            <div v-else-if="profileFriends.length === 0" class="text-center py-12 text-(--color-text-muted) text-sm">
              Nenhum amigo para exibir.
            </div>
            <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <RouterLink
                v-for="friend in profileFriends"
                :key="friend.id"
                :to="`/profile/${friend.id}`"
                class="flex flex-col items-center gap-2 p-4 rounded-xl bg-(--color-bg-elevated) border border-transparent hover:border-(--color-accent-amber)/30 transition-all"
              >
                <AppAvatar :src="friend.avatarUrl" :name="friend.displayName" :size="56" />
                <p class="text-xs font-medium text-(--color-text-primary) text-center truncate w-full">{{ friend.displayName }}</p>
              </RouterLink>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal de edição do perfil -->
    <ProfileEditModal
      v-if="profile && isOwnProfile"
      :open="showEditModal"
      :profile="profile"
      @close="showEditModal = false"
      @saved="onProfileSaved"
      @background-updated="onBackgroundUpdated"
      @cover-updated="onCoverUpdated"
    />

    <!-- Modal de denúncia (apenas perfis de outros) -->
    <ReportDialog
      v-if="profile && !isOwnProfile"
      :open="showReportDialog"
      target-type="user"
      :target-id="profile.id"
      :blockable-user-id="profile.id"
      :blockable-user-name="profile.displayName"
      @close="showReportDialog = false"
      @reported="showReportDialog = false"
    />
  </div>

  <AppImageLightbox
    :open="avatarZoom && !!profile?.avatarUrl"
    :src="profile?.avatarUrl"
    :alt="profile?.displayName ?? ''"
    variant="circular"
    @close="avatarZoom = false"
  />

  <!-- Aviso de DM -->
  <AppModal v-if="dmWarning" @close="dmWarning = null">
    <div class="p-6">
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#f59e0b]/10">
          <AlertTriangle class="h-5 w-5 text-[#f59e0b]" />
        </div>
        <div class="flex-1">
          <h3 class="text-base font-semibold text-[#e2e8f0]">Não é possível enviar mensagem</h3>
          <p class="mt-1 text-sm text-[#94a3b8]">{{ dmWarning }}</p>
        </div>
      </div>
      <div class="mt-5 flex justify-end">
        <button
          class="rounded-xl bg-[#252640] px-4 py-2 text-sm font-medium text-[#e2e8f0] hover:bg-[#2f3050] transition-colors"
          @click="dmWarning = null"
        >
          Entendi
        </button>
      </div>
    </div>
  </AppModal>

  <!-- Solicitação de conversa (não-amigo) -->
  <AppModal v-if="showDmRequestPrompt" @close="showDmRequestPrompt = false; dmRequestStatus = 'idle'">
    <div class="p-6 space-y-4">
      <div class="flex items-start gap-3">
        <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-(--color-accent-amber)/10">
          <MessageSquare class="h-5 w-5 text-(--color-accent-amber)" />
        </div>
        <div class="flex-1">
          <h3 class="text-base font-semibold text-(--color-text-primary)">Solicitar conversa</h3>
          <p v-if="dmRequestStatus === 'idle'" class="mt-1 text-sm text-(--color-text-muted)">
            Você não é amigo de <strong class="text-(--color-text-primary)">{{ profile?.displayName }}</strong>. Quer mandar uma solicitação de conversa? Útil para combinar uma compra ou troca antes de virar amigo.
          </p>
          <p v-else-if="dmRequestStatus === 'sent'" class="mt-1 text-sm text-(--color-status-online)">
            ✓ Solicitação enviada. Aguarde a resposta.
          </p>
          <p v-else-if="dmRequestStatus === 'already'" class="mt-1 text-sm text-(--color-text-muted)">
            Você já enviou uma solicitação para esta pessoa.
          </p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button
          v-if="dmRequestStatus === 'idle'"
          class="rounded-xl bg-[#252640] px-4 py-2 text-sm font-medium text-[#e2e8f0] hover:bg-[#2f3050] transition-colors"
          :disabled="sendingDmRequest"
          @click="showDmRequestPrompt = false"
        >
          Cancelar
        </button>
        <button
          v-if="dmRequestStatus === 'idle'"
          class="rounded-xl bg-(--color-accent-amber) px-4 py-2 text-sm font-semibold text-black hover:brightness-110 transition-all disabled:opacity-50"
          :disabled="sendingDmRequest"
          @click="confirmSendDmRequest"
        >
          {{ sendingDmRequest ? 'Enviando…' : 'Enviar solicitação' }}
        </button>
        <button
          v-else
          class="rounded-xl bg-[#252640] px-4 py-2 text-sm font-medium text-[#e2e8f0] hover:bg-[#2f3050] transition-colors"
          @click="showDmRequestPrompt = false; dmRequestStatus = 'idle'"
        >
          Fechar
        </button>
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Camera, Settings, Lock, UserX, Trash2, X, LayoutList, Library, Users, MessageSquare, AlertTriangle, Pencil, MapPin, Cake, Link as LinkIcon, UserCircle, Flag } from 'lucide-vue-next'
import ReportDialog from '@/modules/reports/components/ReportDialog.vue'
import ProfileEditModal from '../components/ProfileEditModal.vue'
import AppAvatar from '@/shared/ui/AppAvatar.vue'
import AppImageLightbox from '@/shared/ui/AppImageLightbox.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import AppModal from '@/shared/ui/AppModal.vue'
import { useProfile } from '../composables/useProfile'
import SendRequestButton from '@/modules/friends/components/SendRequestButton.vue'
import { useFriends } from '@/modules/friends/composables/useFriends'
import { useFeed } from '@/modules/feed/composables/useFeed'
import { useChat } from '@/modules/chat/composables/useChat'
import { useFloatingChats } from '@/modules/chat/composables/useFloatingChats'
import { getPublicFriends } from '../services/usersService'
import PostComposer from '@/modules/feed/components/PostComposer.vue'
import PostCard from '@/modules/feed/components/PostCard.vue'
import CollectionCard from '@/modules/collections/components/CollectionCard.vue'
import ProfileCollectionItems from '@/modules/collections/components/ProfileCollectionItems.vue'
import { listPublicCollections } from '@/modules/collections/services/collectionsService'
import type { Collection } from '@/modules/collections/types'
import ReputationBadge from '@/modules/offers/components/ReputationBadge.vue'
import { getReputation, type UserReputation } from '@/modules/offers/services/ratingsService'

const route = useRoute()
const router = useRouter()

const profileUserId = computed(() => route.params.userId as string)
const { profile, loading, error, notFound, isOwnProfile, fetchProfile, handleAvatarUpload, handleAvatarRemove, handleCoverUpload, handleCoverRemove } = useProfile(profileUserId)

const friendsStore = useFriends()
const chatStore = useChat()
const floatingChats = useFloatingChats()

const isProfileRestricted = computed(() => {
  if (!profile.value || isOwnProfile.value) return false
  return (profile.value as any).restricted === true
})

/** Coleção em foco — quando setado, ProfileView renderiza os items dela embutido na aba "Coleções". */
const selectedCollectionId = computed(() => {
  const c = route.query.collection
  return typeof c === 'string' && c.length > 0 ? c : null
})

// Modal de edição do perfil
const showEditModal = ref(false)

const hasAboutInfo = computed(() => {
  if (!profile.value) return false
  return Boolean(profile.value.pronouns || profile.value.location || profile.value.birthday || profile.value.website)
})

const reputation = ref<UserReputation | null>(null)
async function loadReputation() {
  if (!profile.value) return
  try { reputation.value = await getReputation(profile.value.id) }
  catch { reputation.value = null }
}
watch(() => profile.value?.id, (id) => { if (id) loadReputation() })

function formatBirthday(iso: string): string {
  // YYYY-MM-DD → "DD de mês"
  const [, m, d] = iso.split('-')
  if (!m || !d) return iso
  const month = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1] ?? ''
  return `${Number(d)} de ${month}`
}

function onProfileSaved(updated: any) {
  if (profile.value) {
    Object.assign(profile.value, updated)
  }
}

function onBackgroundUpdated(payload: { url: string | null; color: string | null }) {
  if (profile.value) {
    profile.value.profileBackgroundUrl = payload.url
    profile.value.profileBackgroundColor = payload.color
  }
}

function onCoverUpdated(payload: { url: string | null; color: string | null }) {
  if (profile.value) {
    profile.value.coverUrl = payload.url
    profile.value.coverColor = payload.color
  }
}

function goToCollection(collectionId: string) {
  // Dono visualizando o próprio perfil → vai pra área de gerenciamento /collections/:id
  if (isOwnProfile.value) {
    router.push(`/collections/${collectionId}`)
    return
  }
  // Outras pessoas → carrega items embutido no perfil via query param
  router.replace({
    query: { ...route.query, tab: 'collections', collection: collectionId },
  })
}

function closeCollectionItems() {
  const next = { ...route.query }
  delete next.collection
  router.replace({ query: next })
}

function switchTab(tabId: string) {
  activeTab.value = tabId
  // Sair da visualização de items quando troca de aba
  if (selectedCollectionId.value) {
    closeCollectionItems()
  }
}

const VALID_TABS = ['feed', 'collections', 'friends']
const initialTab = (() => {
  const t = route.query.tab
  return typeof t === 'string' && VALID_TABS.includes(t) ? t : 'feed'
})()
const activeTab = ref(initialTab)
const tabs = [
  { id: 'feed', label: 'Posts', icon: LayoutList },
  { id: 'collections', label: 'Coleções', icon: Library },
  { id: 'friends', label: 'Amigos', icon: Users },
]

const feedStore = useFeed()

const collections = ref<Collection[]>([])
const collectionsLoading = ref(false)

const profileFriends = ref<{ id: string; displayName: string; avatarUrl: string | null }[]>([])
const profileFriendsLoading = ref(false)

async function fetchProfileFriends(userId: string) {
  profileFriendsLoading.value = true
  try {
    profileFriends.value = await getPublicFriends(userId)
  } finally {
    profileFriendsLoading.value = false
  }
}

async function fetchCollections(userId: string) {
  collectionsLoading.value = true
  try {
    collections.value = await listPublicCollections(userId)
  } finally {
    collectionsLoading.value = false
  }
}

const avatarZoom = ref(false)
const blockMenuOpen = ref(false)
const dmWarning = ref<string | null>(null)
const showReportDialog = ref(false)
const showDmRequestPrompt = ref(false)
const sendingDmRequest = ref(false)
const dmRequestStatus = ref<'idle' | 'sent' | 'already'>('idle')

function openReportDialog() {
  blockMenuOpen.value = false
  showReportDialog.value = true
}

function onDocumentClick() {
  if (blockMenuOpen.value) blockMenuOpen.value = false
}

watch(profileUserId, async (newId) => {
  if (!newId) return
  activeTab.value = 'feed'
  feedStore.profilePosts.length = 0
  collections.value = []
  profileFriends.value = []
  await fetchProfile()
  await Promise.all([
    feedStore.fetchUserPosts(newId),
    fetchCollections(newId),
    fetchProfileFriends(newId),
  ])
}, { immediate: true })

onMounted(() => {
  if (friendsStore.friends.length === 0) friendsStore.fetchAll()
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})

function onPostCreated() {
  if (profile.value) profile.value.postsCount = (profile.value.postsCount ?? 0) + 1
}

function onPostDeleted() {
  if (profile.value) profile.value.postsCount = Math.max(0, (profile.value.postsCount ?? 1) - 1)
}

async function handleBlockFromProfile() {
  if (!profile.value) return
  blockMenuOpen.value = false
  await friendsStore.blockUser(profile.value.id)
  router.push({ path: '/friends', query: { tab: 'blocked' } })
}

async function handleOpenDm() {
  if (!profile.value) return
  blockMenuOpen.value = false
  try {
    const convId = await chatStore.openDm(profile.value.id)
    await floatingChats.openOrRoute(convId, router)
  } catch (e: any) {
    const code = e?.response?.data?.error ?? e?.message ?? ''
    if (code === 'NOT_FRIENDS') {
      // Não somos amigos — oferece mandar uma solicitação de conversa
      dmRequestStatus.value = 'idle'
      showDmRequestPrompt.value = true
      return
    }
    dmWarning.value = 'Não foi possível abrir a conversa. Tente novamente.'
  }
}

async function confirmSendDmRequest() {
  if (!profile.value || sendingDmRequest.value) return
  sendingDmRequest.value = true
  try {
    const { sendDmRequest } = await import('@/modules/chat/services/chatService')
    await sendDmRequest(profile.value.id)
    dmRequestStatus.value = 'sent'
  } catch (e: any) {
    const code = e?.response?.data?.error ?? ''
    if (code === 'ALREADY_EXISTS') {
      dmRequestStatus.value = 'already'
    } else {
      dmWarning.value = 'Não foi possível enviar a solicitação.'
      showDmRequestPrompt.value = false
    }
  } finally {
    sendingDmRequest.value = false
  }
}

async function onAvatarChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) return
  await handleAvatarUpload(file)
}

async function onCoverChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) return
  await handleCoverUpload(file)
}
</script>
