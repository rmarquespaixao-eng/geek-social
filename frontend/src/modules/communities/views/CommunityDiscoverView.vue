<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CommunityCard from '../components/CommunityCard.vue'
import { useCommunitiesStore } from '../stores/communitiesStore'
import type { CommunityCategory } from '../types'

const router = useRouter()
const store = useCommunitiesStore()

type Tab = 'explorar' | 'minhas' | 'participando'
const activeTab = ref<Tab>('explorar')

const CATEGORIES: { value: CommunityCategory; label: string }[] = [
  { value: 'boardgames', label: 'Board Games' },
  { value: 'tcg', label: 'TCG' },
  { value: 'rpg-mesa', label: 'RPG de Mesa' },
  { value: 'rpg-digital', label: 'RPG Digital' },
  { value: 'mmo', label: 'MMO' },
  { value: 'souls', label: 'Souls-like' },
  { value: 'fps', label: 'FPS' },
  { value: 'survival', label: 'Survival' },
  { value: 'indie', label: 'Indie' },
  { value: 'retro', label: 'Retro' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'simulation', label: 'Simulação' },
  { value: 'strategy', label: 'Estratégia' },
  { value: 'mods', label: 'Mods' },
  { value: 'community-events', label: 'Eventos de Comunidade' },
]

const selectedCategory = ref<CommunityCategory | null>(null)
const searchQuery = ref<string>('')

const ownedIds = computed(() => new Set(store.ownedCommunities.map(c => c.id)))
const joinedNotOwned = computed(() => store.joinedCommunities.filter(c => !ownedIds.value.has(c.id)))

async function loadDiscover(reset = false) {
  await store.fetchList('discover', {
    category: selectedCategory.value,
    cursor: reset ? null : store.discoverNextCursor,
    search: searchQuery.value.length >= 2 ? searchQuery.value : undefined,
  }, !reset)
}

async function switchTab(tab: Tab) {
  activeTab.value = tab
  if (tab === 'minhas' && store.ownedCommunities.length === 0) {
    await store.fetchList('owned', {}, false)
  }
  if (tab === 'participando' && store.joinedCommunities.length === 0) {
    await store.fetchList('joined', {}, false)
  }
}

async function selectCategory(cat: CommunityCategory | null) {
  selectedCategory.value = cat
  await loadDiscover(true)
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchDebounce !== null) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => void loadDiscover(true), 400)
}, { immediate: false })

onMounted(() => {
  void loadDiscover(true)
  void store.fetchList('owned', {}, false)
  void store.fetchList('joined', {}, false)
})
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="community-discover-view">
    <header class="bg-[#1e2038] border-b border-[#252640] py-4">
      <div class="max-w-5xl mx-auto px-4 flex items-center justify-between">
        <h1 class="text-xl font-bold text-slate-100">Comunidades</h1>
        <button
          type="button"
          @click="router.push('/comunidades/nova')"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] transition-colors"
        >
          + Nova comunidade
        </button>
      </div>

      <!-- Tabs -->
      <div class="max-w-5xl mx-auto px-4 mt-3">
        <nav class="flex gap-1" role="tablist">
          <button
            v-for="tab in ([
              { key: 'explorar', label: 'Explorar' },
              { key: 'minhas', label: 'Minhas comunidades' },
              { key: 'participando', label: 'Que participo' },
            ] as { key: Tab; label: string }[])"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="switchTab(tab.key)"
            :class="[
              'px-4 py-2 text-xs font-semibold border-b-2 transition-colors',
              activeTab === tab.key
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            ]"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>
    </header>

    <div class="max-w-5xl mx-auto px-4 py-6 space-y-5">

      <!-- ── EXPLORAR ─────────────────────────────────────────── -->
      <template v-if="activeTab === 'explorar'">
        <div class="relative">
          <span class="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar comunidades..."
            class="w-full rounded-lg bg-[#1e2038] border border-[#252640] pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
          />
        </div>

        <div class="flex flex-wrap gap-1.5" data-testid="category-chips">
          <button
            type="button"
            @click="selectCategory(null)"
            :class="[
              'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
              selectedCategory === null
                ? 'bg-amber-500 text-[#0f0f1a] border-amber-500'
                : 'bg-transparent text-slate-400 border-slate-600 hover:border-amber-500/50 hover:text-slate-200',
            ]"
          >
            Todas
          </button>
          <button
            v-for="cat in CATEGORIES"
            :key="cat.value"
            type="button"
            @click="selectCategory(cat.value)"
            :class="[
              'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
              selectedCategory === cat.value
                ? 'bg-amber-500 text-[#0f0f1a] border-amber-500'
                : 'bg-transparent text-slate-400 border-slate-600 hover:border-amber-500/50 hover:text-slate-200',
            ]"
          >
            {{ cat.label }}
          </button>
        </div>

        <p v-if="store.discoverLoading && store.discoverCommunities.length === 0" class="text-slate-400 text-sm">
          Carregando…
        </p>
        <div
          v-else-if="store.discoverCommunities.length === 0"
          class="text-slate-500 text-sm text-center py-12"
        >
          Nenhuma comunidade encontrada.
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CommunityCard
            v-for="community in store.discoverCommunities"
            :key="community.id"
            :community="community"
          />
        </div>

        <div v-if="store.discoverNextCursor" class="flex justify-center pt-2">
          <button
            type="button"
            :disabled="store.discoverLoading"
            @click="loadDiscover(false)"
            class="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 disabled:opacity-50 transition-colors"
          >
            {{ store.discoverLoading ? 'Carregando…' : 'Carregar mais' }}
          </button>
        </div>
      </template>

      <!-- ── MINHAS COMUNIDADES ───────────────────────────────── -->
      <template v-else-if="activeTab === 'minhas'">
        <p v-if="store.ownedLoading && store.ownedCommunities.length === 0" class="text-slate-400 text-sm">
          Carregando…
        </p>
        <div
          v-else-if="store.ownedCommunities.length === 0"
          class="text-slate-500 text-sm text-center py-12"
        >
          Você ainda não criou nenhuma comunidade.
          <br />
          <button
            type="button"
            @click="router.push('/comunidades/nova')"
            class="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] transition-colors"
          >
            + Criar comunidade
          </button>
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CommunityCard
            v-for="community in store.ownedCommunities"
            :key="community.id"
            :community="community"
          />
        </div>

        <div v-if="store.ownedNextCursor" class="flex justify-center pt-2">
          <button
            type="button"
            :disabled="store.ownedLoading"
            @click="store.fetchList('owned', { cursor: store.ownedNextCursor }, true)"
            class="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 disabled:opacity-50 transition-colors"
          >
            {{ store.ownedLoading ? 'Carregando…' : 'Carregar mais' }}
          </button>
        </div>
      </template>

      <!-- ── QUE PARTICIPO ───────────────────────────────────── -->
      <template v-else-if="activeTab === 'participando'">
        <p v-if="store.joinedLoading && store.joinedCommunities.length === 0" class="text-slate-400 text-sm">
          Carregando…
        </p>
        <div
          v-else-if="joinedNotOwned.length === 0"
          class="text-slate-500 text-sm text-center py-12"
        >
          Você ainda não participa de nenhuma comunidade.
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CommunityCard
            v-for="community in joinedNotOwned"
            :key="community.id"
            :community="community"
          />
        </div>

        <div v-if="store.joinedNextCursor && joinedNotOwned.length > 0" class="flex justify-center pt-2">
          <button
            type="button"
            :disabled="store.joinedLoading"
            @click="store.fetchList('joined', { cursor: store.joinedNextCursor }, true)"
            class="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 disabled:opacity-50 transition-colors"
          >
            {{ store.joinedLoading ? 'Carregando…' : 'Carregar mais' }}
          </button>
        </div>
      </template>

    </div>
  </div>
</template>
