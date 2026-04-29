<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import CommunityCard from '../components/CommunityCard.vue'
import { useCommunitiesStore } from '../stores/communitiesStore'
import type { CommunityCategory } from '../types'

const router = useRouter()
const store = useCommunitiesStore()

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

async function load(reset = false) {
  if (reset) {
    store.discoverCommunities = []
    store.discoverNextCursor = null
  }
  await store.fetchList('discover', {
    category: selectedCategory.value,
    cursor: reset ? null : store.discoverNextCursor,
  }, !reset)
}

async function selectCategory(cat: CommunityCategory | null) {
  selectedCategory.value = cat
  await load(true)
}

onMounted(() => {
  void load(true)
})
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]" data-testid="community-discover-view">
    <header class="bg-[#1e2038] border-b border-[#252640] py-4">
      <div class="max-w-5xl mx-auto px-4 flex items-center justify-between">
        <h1 class="text-xl font-bold text-slate-100">Explorar Comunidades</h1>
        <button
          type="button"
          @click="router.push('/comunidades/nova')"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#0f0f1a] transition-colors"
        >
          + Nova comunidade
        </button>
      </div>
    </header>

    <div class="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <!-- Category chips -->
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

      <!-- List -->
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

      <!-- Load more -->
      <div v-if="store.discoverNextCursor" class="flex justify-center pt-2">
        <button
          type="button"
          :disabled="store.discoverLoading"
          @click="load(false)"
          class="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 disabled:opacity-50 transition-colors"
        >
          {{ store.discoverLoading ? 'Carregando…' : 'Carregar mais' }}
        </button>
      </div>
    </div>
  </div>
</template>
