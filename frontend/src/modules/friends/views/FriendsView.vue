<!-- src/modules/friends/views/FriendsView.vue -->
<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  Users, UserCheck, Shield, Search, X, UserX, UserPlus, Inbox, Send, Sparkles,
} from 'lucide-vue-next'
import { useFriends } from '../composables/useFriends'
import { searchUsers } from '@/modules/auth/services/usersService'
import FriendItem from '../components/FriendItem.vue'
import FriendRequestItem from '../components/FriendRequestItem.vue'
import BlockedUserItem from '../components/BlockedUserItem.vue'
import OnlineFriendTile from '../components/OnlineFriendTile.vue'
import AppAvatar from '@/shared/ui/AppAvatar.vue'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'

type Tab = 'friends' | 'requests' | 'search' | 'blocked'

const store = useFriends()
const route = useRoute()
const activeTab = ref<Tab>('friends')

const searchQuery = ref('')
const searchResults = ref<{ id: string; displayName: string; avatarUrl: string | null }[]>([])
const searchLoading = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Filtro local da aba "Amigos"
type FriendsFilter = 'all' | 'online' | 'offline'
const friendsLocalQuery = ref('')
const friendsFilter = ref<FriendsFilter>('all')

function matchesLocalQuery(name: string): boolean {
  const q = friendsLocalQuery.value.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().includes(q)
}

const filteredOnlineFriends = computed(() =>
  store.onlineFriends.filter((f) => matchesLocalQuery(f.displayName))
)
const filteredOfflineFriends = computed(() =>
  store.offlineFriends.filter((f) => matchesLocalQuery(f.displayName))
)
const showOnlineSection = computed(
  () => friendsFilter.value !== 'offline' && filteredOnlineFriends.value.length > 0
)
const showOfflineSection = computed(
  () => friendsFilter.value !== 'online' && filteredOfflineFriends.value.length > 0
)
const noResultsAfterFilter = computed(() =>
  store.friends.length > 0 && !showOnlineSection.value && !showOfflineSection.value
)

watch(searchQuery, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  searchResults.value = []
  if (val.trim().length < 2) return
  searchLoading.value = true
  debounceTimer = setTimeout(async () => {
    try {
      searchResults.value = await searchUsers(val.trim())
    } finally {
      searchLoading.value = false
    }
  }, 350)
})

onMounted(() => {
  store.fetchAll()
  const tabParam = route.query.tab
  if (tabParam === 'blocked') activeTab.value = 'blocked'
  else if (tabParam === 'requests') activeTab.value = 'requests'
  else if (tabParam === 'search') activeTab.value = 'search'
})

import { formatShortDateWithYear } from '@/shared/utils/timeAgo'

const tabs = computed<{ key: Tab; label: string; icon: typeof Search; badge?: number }[]>(() => [
  { key: 'search',   label: 'Buscar',     icon: Search },
  { key: 'friends',  label: 'Amigos',     icon: Users,      badge: store.friends.length },
  { key: 'requests', label: 'Pedidos',    icon: UserCheck,  badge: store.pendingCount },
  { key: 'blocked',  label: 'Bloqueados', icon: Shield,     badge: store.blockedUsers.length },
])
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <AppPageHeader :icon="Users" title="Amigos">
      <template #subtitle>
        <span class="font-semibold text-[#cbd5e1]">{{ store.friends.length }}</span>
        <span>{{ store.friends.length === 1 ? 'amigo' : 'amigos' }}</span>
        <template v-if="store.onlineFriends.length > 0">
          <span class="text-[#475569]">·</span>
          <span class="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          <span class="font-semibold text-[#22c55e]">{{ store.onlineFriends.length }}</span>
          <span>online</span>
        </template>
      </template>
    </AppPageHeader>

    <div class="px-4 py-6 md:px-8">
      <div class="mx-auto max-w-4xl">

        <!-- Tab bar — segmentada com indicador âmbar sutil -->
        <div class="mb-6 flex gap-1 rounded-xl bg-[#1a1b2e] p-1 border border-[#252640]/50">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-semibold transition-all"
            :class="activeTab === tab.key
              ? 'bg-[#252640] text-[#f59e0b] shadow-sm shadow-black/20'
              : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#1e2038]/50'"
            @click="activeTab = tab.key"
          >
            <component :is="tab.icon" :size="15" />
            <span class="hidden sm:inline">{{ tab.label }}</span>
            <span
              v-if="tab.badge && tab.badge > 0"
              class="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
              :class="tab.key === 'requests'
                ? 'bg-[#ef4444] text-white'
                : 'bg-[#252640] text-[#94a3b8]'"
            >
              {{ tab.badge }}
            </span>
          </button>
        </div>

        <!-- Loading state -->
        <div v-if="store.loading" class="space-y-2">
          <div
            v-for="i in 4"
            :key="i"
            class="h-[68px] animate-pulse rounded-xl bg-[#1e2038]"
          />
        </div>

        <!-- Error state -->
        <div
          v-else-if="store.error"
          class="rounded-xl bg-[#1e2038] border border-[#ef4444]/30 px-4 py-6 text-center text-[#ef4444]"
        >
          {{ store.error }}
          <button class="ml-2 underline" @click="store.fetchAll()">Tentar novamente</button>
        </div>

        <template v-else>
          <!-- ── Aba Amigos ──────────────────────────────────────────────── -->
          <div v-if="activeTab === 'friends'">
            <!-- Toolbar: busca local + filtro segmentado (só aparece se houver amigos) -->
            <div v-if="store.friends.length > 0" class="mb-5 flex flex-col sm:flex-row gap-2">
              <div class="relative flex-1">
                <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#475569]" :size="16" />
                <input
                  v-model="friendsLocalQuery"
                  type="text"
                  placeholder="Filtrar amigos..."
                  class="w-full rounded-xl bg-[#1e2038] border border-[#252640] focus:border-[#f59e0b]/50 text-[#e2e8f0] placeholder-[#475569] text-[13px] pl-10 pr-9 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#f59e0b]/30 transition-colors"
                />
                <button
                  v-if="friendsLocalQuery"
                  @click="friendsLocalQuery = ''"
                  class="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-[#252640] text-[#94a3b8] hover:bg-[#2e3050] hover:text-[#e2e8f0] transition-colors"
                >
                  <X :size="11" />
                </button>
              </div>
              <div class="flex gap-1 rounded-xl bg-[#1a1b2e] p-1 border border-[#252640]/50">
                <button
                  v-for="opt in [
                    { key: 'all', label: 'Todos', count: store.friends.length },
                    { key: 'online', label: 'Online', count: store.onlineFriends.length },
                    { key: 'offline', label: 'Offline', count: store.offlineFriends.length },
                  ]"
                  :key="opt.key"
                  class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all"
                  :class="friendsFilter === opt.key
                    ? 'bg-[#252640] text-[#f59e0b]'
                    : 'text-[#94a3b8] hover:text-[#e2e8f0]'"
                  @click="friendsFilter = opt.key as FriendsFilter"
                >
                  <span v-if="opt.key === 'online'" class="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                  {{ opt.label }}
                  <span class="text-[10px] text-[#64748b]">{{ opt.count }}</span>
                </button>
              </div>
            </div>

            <!-- Online — grid de tiles -->
            <section v-if="showOnlineSection" class="mb-6">
              <div class="mb-3 flex items-center justify-between">
                <h2 class="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[#22c55e]">
                  <Sparkles :size="14" class="text-[#22c55e]" />
                  Online agora
                  <span class="text-[#94a3b8] font-medium normal-case tracking-normal">
                    — {{ filteredOnlineFriends.length }}
                  </span>
                </h2>
              </div>
              <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                <OnlineFriendTile
                  v-for="friend in filteredOnlineFriends"
                  :key="friend.id"
                  :friend="friend"
                />
              </div>
            </section>

            <!-- Offline — lista -->
            <section v-if="showOfflineSection">
              <h2 class="mb-3 text-[12px] font-bold uppercase tracking-wider text-[#94a3b8]">
                Offline
                <span class="font-medium normal-case tracking-normal">— {{ filteredOfflineFriends.length }}</span>
              </h2>
              <div class="space-y-2">
                <FriendItem
                  v-for="friend in filteredOfflineFriends"
                  :key="friend.id"
                  :friend="friend"
                />
              </div>
            </section>

            <!-- Sem resultado após filtro/busca -->
            <div
              v-if="noResultsAfterFilter"
              class="flex flex-col items-center justify-center py-12 text-center"
            >
              <UserX class="mb-3 h-10 w-10 text-[#475569]" />
              <p class="text-[14px] text-[#cbd5e1]">
                Nenhum amigo corresponde ao filtro
              </p>
              <button
                class="mt-3 text-[12px] text-[#f59e0b] hover:underline"
                @click="friendsLocalQuery = ''; friendsFilter = 'all'"
              >
                Limpar filtros
              </button>
            </div>

            <!-- Empty state — sem amigos -->
            <div
              v-if="store.friends.length === 0"
              class="flex flex-col items-center justify-center py-16 text-center"
            >
              <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1e2038] to-[#252640] border border-[#2e3050] flex items-center justify-center mb-5">
                <Users :size="36" class="text-[#f59e0b]" />
              </div>
              <h2 class="text-[16px] font-bold text-[#e2e8f0] mb-1.5">Nenhum amigo ainda</h2>
              <p class="text-[13px] text-[#94a3b8] mb-6 max-w-xs">
                Encontre pessoas e envie pedidos pra construir sua rede.
              </p>
              <button
                class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 text-black text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-all shadow-md shadow-[#f59e0b]/20"
                @click="activeTab = 'search'"
              >
                <Search :size="15" :stroke-width="2.5" />
                Buscar pessoas
              </button>
            </div>
          </div>

          <!-- ── Aba Pedidos ──────────────────────────────────────────────── -->
          <div v-else-if="activeTab === 'requests'">
            <!-- Recebidos -->
            <section class="mb-8">
              <h2 class="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[#f59e0b]">
                <Inbox :size="14" />
                Recebidos
                <span class="text-[#94a3b8] font-medium normal-case tracking-normal">
                  — {{ store.receivedRequests.length }}
                </span>
              </h2>
              <div v-if="store.receivedRequests.length > 0" class="space-y-2">
                <FriendRequestItem
                  v-for="req in store.receivedRequests"
                  :key="req.id"
                  :request="req"
                />
              </div>
              <div
                v-else
                class="rounded-xl bg-[#1e2038] border border-[#252640] px-4 py-8 text-center"
              >
                <Inbox class="mx-auto mb-2 h-8 w-8 text-[#475569]" />
                <p class="text-sm text-[#94a3b8]">Nenhum pedido recebido</p>
              </div>
            </section>

            <!-- Enviados -->
            <section>
              <h2 class="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[#94a3b8]">
                <Send :size="14" />
                Enviados
                <span class="font-medium normal-case tracking-normal">
                  — {{ store.sentRequests.length }}
                </span>
              </h2>
              <div v-if="store.sentRequests.length > 0" class="space-y-2">
                <RouterLink
                  v-for="req in store.sentRequests"
                  :key="req.id"
                  :to="`/profile/${req.receiverId}`"
                  class="flex items-center gap-3.5 rounded-xl bg-[#1e2038] border border-[#252640] px-4 py-3 hover:border-[#f59e0b]/30 transition-colors"
                >
                  <AppAvatar
                    :src="req.receiverAvatarUrl ?? null"
                    :name="req.receiverName ?? 'Usuário'"
                    :size="48"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[14px] font-semibold text-[#e2e8f0] leading-tight">
                      {{ req.receiverName ?? 'Usuário' }}
                    </p>
                    <p class="mt-0.5 text-[11px] text-[#94a3b8]">
                      Enviado em {{ formatShortDateWithYear(req.createdAt) }}
                    </p>
                  </div>
                  <span class="rounded-full bg-[#252640] border border-[#f59e0b]/20 px-2.5 py-0.5 text-[11px] font-medium text-[#f59e0b]">
                    Pendente
                  </span>
                </RouterLink>
              </div>
              <div
                v-else
                class="rounded-xl bg-[#1e2038] border border-[#252640] px-4 py-8 text-center"
              >
                <Send class="mx-auto mb-2 h-8 w-8 text-[#475569]" />
                <p class="text-sm text-[#94a3b8]">Nenhum pedido enviado</p>
              </div>
            </section>
          </div>

          <!-- ── Aba Buscar ─────────────────────────────────────────────── -->
          <div v-else-if="activeTab === 'search'">
            <div class="relative mb-4">
              <Search class="absolute left-4 top-1/2 -translate-y-1/2 text-[#475569]" :size="18" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Buscar por nome..."
                autofocus
                class="w-full rounded-xl bg-[#1e2038] border border-[#252640] focus:border-[#f59e0b]/50 text-[#e2e8f0] placeholder-[#475569] text-[14px] pl-11 pr-11 py-3.5 focus:outline-none focus:ring-1 focus:ring-[#f59e0b]/30 transition-colors"
              />
              <button
                v-if="searchQuery"
                @click="searchQuery = ''"
                class="absolute right-4 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-[#252640] text-[#94a3b8] hover:bg-[#2e3050] hover:text-[#e2e8f0] transition-colors"
              >
                <X :size="13" />
              </button>
            </div>

            <div v-if="searchLoading" class="flex justify-center py-12">
              <div class="w-6 h-6 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" />
            </div>

            <div
              v-else-if="searchQuery.length >= 2 && searchResults.length === 0"
              class="flex flex-col items-center justify-center py-12 text-center"
            >
              <UserX class="mb-3 h-10 w-10 text-[#475569]" />
              <p class="text-[14px] text-[#cbd5e1]">
                Nenhum usuário encontrado
              </p>
              <p class="mt-1 text-[12px] text-[#94a3b8]">
                para "<strong class="text-[#e2e8f0]">{{ searchQuery }}</strong>"
              </p>
            </div>

            <div v-else-if="searchResults.length > 0" class="space-y-2">
              <RouterLink
                v-for="user in searchResults"
                :key="user.id"
                :to="`/profile/${user.id}`"
                class="flex items-center gap-3.5 rounded-xl bg-[#1e2038] border border-[#252640] hover:border-[#f59e0b]/40 px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#f59e0b]/10 group"
              >
                <AppAvatar :src="user.avatarUrl" :name="user.displayName" :size="48" />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[14px] font-semibold text-[#e2e8f0] leading-tight">
                    {{ user.displayName }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-[#94a3b8]">
                    @{{ user.displayName.toLowerCase().replace(/\s+/g, '') }}
                  </p>
                </div>
                <span class="hidden sm:flex items-center gap-1 text-[11px] font-medium text-[#94a3b8] group-hover:text-[#f59e0b] transition-colors">
                  Ver perfil →
                </span>
              </RouterLink>
            </div>

            <div
              v-else-if="searchQuery.length === 0"
              class="flex flex-col items-center justify-center py-12 text-center"
            >
              <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1e2038] to-[#252640] border border-[#2e3050] flex items-center justify-center mb-4">
                <UserPlus :size="28" class="text-[#f59e0b]" />
              </div>
              <p class="text-[14px] font-semibold text-[#e2e8f0] mb-1">Encontre pessoas</p>
              <p class="text-[12px] text-[#94a3b8] max-w-xs">
                Digite ao menos 2 caracteres pra buscar usuários por nome.
              </p>
            </div>
          </div>

          <!-- ── Aba Bloqueados ──────────────────────────────────────────── -->
          <div v-else-if="activeTab === 'blocked'">
            <div v-if="store.blockedUsers.length > 0" class="space-y-2">
              <BlockedUserItem
                v-for="user in store.blockedUsers"
                :key="user.id"
                :user="user"
              />
            </div>
            <div
              v-else
              class="flex flex-col items-center justify-center py-16 text-center"
            >
              <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1e2038] to-[#252640] border border-[#2e3050] flex items-center justify-center mb-5">
                <Shield :size="36" class="text-[#f59e0b]" />
              </div>
              <h2 class="text-[16px] font-bold text-[#e2e8f0] mb-1.5">Nenhum usuário bloqueado</h2>
              <p class="text-[13px] text-[#94a3b8] max-w-xs">
                Você pode bloquear alguém a partir do perfil ou da lista de amigos.
              </p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
