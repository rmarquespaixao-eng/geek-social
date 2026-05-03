<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  BarChart2, Library, Package, ArrowLeft,
  List, Star, Search, ChevronDown,
} from 'lucide-vue-next'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import { getCollectionStats } from '../services/collectionsService'
import { useAllItemsStore } from '../composables/useAllItems'
import { useSteam } from '@/modules/integrations/steam/composables/useSteam'
import type { CollectionStats, ItemSort } from '../types'

const router = useRouter()
const stats = ref<CollectionStats | null>(null)
const loadingStats = ref(false)
const errorStats = ref<string | null>(null)

const activeTab = ref<'stats' | 'list'>('stats')

const allItems = useAllItemsStore()
const steam = useSteam()

const STATUS_ORDER = ['Na fila', 'Em andamento', 'Zerado', 'Platinado']
const STATUS_COLORS: Record<string, string> = {
  'Na fila': '#60a5fa',
  'Em andamento': '#fbbf24',
  'Zerado': '#4ade80',
  'Platinado': '#c084fc',
}

const SORT_OPTIONS: { value: ItemSort; label: string }[] = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'name', label: 'Nome A→Z' },
  { value: 'name_desc', label: 'Nome Z→A' },
  { value: 'rating', label: 'Melhor avaliados' },
]

const listSort = ref<ItemSort>('recent')
const listSearch = ref('')
let searchDebounce: ReturnType<typeof setTimeout> | null = null

const totalItems = computed(() =>
  stats.value?.itemsByType.reduce((s, r) => s + r.count, 0) ?? 0,
)
const maxByType = computed(() =>
  Math.max(1, ...(stats.value?.itemsByType.map(r => r.count) ?? [0])),
)
const orderedStatuses = computed(() => {
  if (!stats.value) return []
  const map = new Map(stats.value.gamesByStatus.map(r => [r.status, r.count]))
  const result = STATUS_ORDER
    .filter(s => map.has(s))
    .map(s => ({ status: s, count: map.get(s)! }))
  if (map.has(null) && (map.get(null) ?? 0) > 0)
    result.push({ status: null, count: map.get(null)! })
  return result
})
const maxByStatus = computed(() =>
  Math.max(1, ...orderedStatuses.value.map(r => r.count)),
)
const orderedRatings = computed(() => {
  if (!stats.value) return []
  const map = new Map(stats.value.itemsByRating.map(r => [r.rating, r.count]))
  return [5, 4, 3, 2, 1, null].map(r => ({ rating: r, count: map.get(r) ?? 0 }))
})
const maxByRating = computed(() =>
  Math.max(1, ...orderedRatings.value.map(r => r.count)),
)

async function loadStats() {
  loadingStats.value = true
  try {
    stats.value = await getCollectionStats()
  } catch {
    errorStats.value = 'Não foi possível carregar as estatísticas.'
  } finally {
    loadingStats.value = false
  }
}

async function switchToList() {
  activeTab.value = 'list'
  if (!allItems.initialized) {
    await allItems.fetchPage({ sort: listSort.value })
  }
}

watch(listSort, async (sort) => {
  if (activeTab.value === 'list') {
    await allItems.fetchPage({ q: listSearch.value || undefined, sort })
  }
})

function onSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(async () => {
    if (activeTab.value === 'list') {
      await allItems.fetchPage({ q: listSearch.value || undefined, sort: listSort.value })
    }
  }, 350)
}

// Refresh ao progresso do import Steam (qualquer coleção)
let lastSteamCompleted = 0
let steamRefreshScheduled = false
watch(() => steam.currentImport, (curr) => {
  if (!curr) return
  if (curr.completed === lastSteamCompleted && curr.stage !== 'done') return
  if (steamRefreshScheduled) return
  steamRefreshScheduled = true
  lastSteamCompleted = curr.completed
  setTimeout(async () => {
    steamRefreshScheduled = false
    await Promise.all([
      loadStats(),
      allItems.refresh(),
    ])
  }, 600)
}, { deep: true })

onMounted(loadStats)
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <AppPageHeader :icon="BarChart2" title="Dashboard">
      <template #subtitle>
        visão geral das suas coleções
      </template>
      <template #action>
        <button
          class="flex items-center gap-1.5 bg-[#1e2038] hover:bg-[#252640] border border-[#2e3050] text-[#94a3b8] hover:text-[#e2e8f0] text-[13px] font-semibold px-3.5 py-2 rounded-lg transition-all"
          @click="router.push('/collections')"
        >
          <ArrowLeft :size="15" />
          <span class="hidden sm:inline">Minhas Coleções</span>
        </button>
      </template>
    </AppPageHeader>

    <!-- Tab toggle -->
    <div class="px-4 md:px-6 pt-4">
      <div class="flex gap-1 bg-[#1a1b2e] border border-[#252640] rounded-xl p-1 w-fit">
        <button
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
          :class="activeTab === 'stats'
            ? 'bg-[#f59e0b] text-[#0f0f1a]'
            : 'text-[#94a3b8] hover:text-[#e2e8f0]'"
          @click="activeTab = 'stats'"
        >
          <BarChart2 :size="14" />
          Estatísticas
        </button>
        <button
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
          :class="activeTab === 'list'
            ? 'bg-[#f59e0b] text-[#0f0f1a]'
            : 'text-[#94a3b8] hover:text-[#e2e8f0]'"
          @click="switchToList"
        >
          <List :size="14" />
          Todos os Itens
        </button>
      </div>
    </div>

    <!-- ── STATS TAB ── -->
    <template v-if="activeTab === 'stats'">
      <!-- Loading -->
      <div v-if="loadingStats" class="px-4 md:px-6 py-6 space-y-6">
        <div class="grid grid-cols-2 gap-4">
          <div v-for="n in 2" :key="n" class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 h-24 animate-pulse" />
        </div>
        <div v-for="n in 3" :key="n" class="bg-[#1e2038] rounded-xl border border-[#252640] p-5 h-36 animate-pulse" />
      </div>

      <!-- Error -->
      <div v-else-if="errorStats" class="px-4 md:px-6 py-12 text-center text-[#94a3b8]">
        {{ errorStats }}
      </div>

      <!-- Conteúdo -->
      <div v-else-if="stats" class="px-4 md:px-6 py-6 space-y-6">
        <!-- Stat cards -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 flex flex-col gap-2">
            <Library :size="18" class="text-[#f59e0b]" />
            <p class="text-3xl font-bold text-[#e2e8f0]">{{ stats.totalCollections }}</p>
            <p class="text-[#94a3b8] text-[13px]">{{ stats.totalCollections === 1 ? 'coleção' : 'coleções' }}</p>
          </div>
          <div class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 flex flex-col gap-2">
            <Package :size="18" class="text-[#f59e0b]" />
            <p class="text-3xl font-bold text-[#e2e8f0]">{{ totalItems }}</p>
            <p class="text-[#94a3b8] text-[13px]">{{ totalItems === 1 ? 'item' : 'itens' }}</p>
          </div>
        </div>

        <!-- Itens por categoria -->
        <div class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
          <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Itens por categoria</h2>
          <div v-if="stats.itemsByType.length === 0" class="text-[#94a3b8] text-[13px]">
            Nenhum item ainda.
          </div>
          <div v-else class="space-y-3">
            <div v-for="row in stats.itemsByType" :key="row.typeKey">
              <div class="flex items-center justify-between text-[13px] mb-1.5">
                <span class="text-[#cbd5e1]">{{ row.typeIcon }} {{ row.typeName }}</span>
                <span class="font-bold text-[#e2e8f0]">{{ row.count }}</span>
              </div>
              <div class="h-2 rounded-full bg-[#252640]">
                <div
                  class="h-2 rounded-full bg-[#f59e0b] transition-all duration-500"
                  :style="{ width: `${(row.count / maxByType) * 100}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Jogos por status -->
        <div v-if="orderedStatuses.length > 0" class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
          <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Jogos por status</h2>
          <div class="space-y-3">
            <div v-for="row in orderedStatuses" :key="row.status ?? 'sem-status'">
              <div class="flex items-center justify-between text-[13px] mb-1.5">
                <span
                  class="font-medium"
                  :style="{ color: row.status ? STATUS_COLORS[row.status] ?? '#94a3b8' : '#94a3b8' }"
                >{{ row.status ?? 'Sem status' }}</span>
                <span class="font-bold text-[#e2e8f0]">{{ row.count }}</span>
              </div>
              <div class="h-2 rounded-full bg-[#252640]">
                <div
                  class="h-2 rounded-full transition-all duration-500"
                  :style="{
                    width: `${(row.count / maxByStatus) * 100}%`,
                    backgroundColor: row.status ? STATUS_COLORS[row.status] ?? '#94a3b8' : '#94a3b8',
                  }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Classificações por estrelas -->
        <div class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
          <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Classificações</h2>
          <div class="space-y-3">
            <div v-for="row in orderedRatings" :key="row.rating ?? 0" class="flex items-center gap-3">
              <div class="w-24 flex gap-0.5 shrink-0">
                <template v-if="row.rating !== null">
                  <span
                    v-for="s in 5"
                    :key="s"
                    class="text-[15px] leading-none"
                    :class="s <= row.rating! ? 'text-[#f59e0b]' : 'text-[#2e3050]'"
                  >★</span>
                </template>
                <span v-else class="text-[#475569] text-[12px] leading-none">sem nota</span>
              </div>
              <div class="flex-1 h-2 rounded-full bg-[#252640]">
                <div
                  class="h-2 rounded-full bg-[#f59e0b] transition-all duration-500"
                  :style="{ width: `${(row.count / maxByRating) * 100}%` }"
                />
              </div>
              <span class="w-8 text-right text-[13px] font-bold text-[#e2e8f0] shrink-0">{{ row.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── LIST TAB ── -->
    <template v-else>
      <div class="px-4 md:px-6 py-4 space-y-4">
        <!-- Controles: busca + ordenação -->
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
            <input
              v-model="listSearch"
              type="text"
              placeholder="Buscar itens..."
              class="w-full bg-[#1e2038] border border-[#252640] rounded-lg pl-8 pr-3 py-2 text-[13px] text-[#e2e8f0] placeholder-[#475569] focus:outline-none focus:border-[#f59e0b] transition-colors"
              @input="onSearchInput"
            />
          </div>
          <div class="relative">
            <select
              v-model="listSort"
              class="appearance-none bg-[#1e2038] border border-[#252640] rounded-lg pl-3 pr-8 py-2 text-[13px] text-[#e2e8f0] focus:outline-none focus:border-[#f59e0b] transition-colors cursor-pointer"
            >
              <option v-for="opt in SORT_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <ChevronDown :size="13" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
          </div>
        </div>

        <!-- Loading inicial -->
        <div v-if="allItems.loading" class="space-y-2">
          <div
            v-for="n in 8"
            :key="n"
            class="bg-[#1e2038] rounded-xl border border-[#252640] h-16 animate-pulse"
          />
        </div>

        <!-- Erro -->
        <div v-else-if="allItems.error" class="py-8 text-center text-[#94a3b8] text-[13px]">
          {{ allItems.error }}
        </div>

        <!-- Lista vazia -->
        <div v-else-if="allItems.items.length === 0" class="py-12 text-center text-[#94a3b8] text-[13px]">
          Nenhum item encontrado.
        </div>

        <!-- Itens -->
        <div v-else class="space-y-2">
          <div
            v-for="item in allItems.items"
            :key="item.id"
            class="flex items-center gap-3 bg-[#1e2038] border border-[#252640] rounded-xl px-3 py-2.5 hover:border-[#f59e0b]/40 transition-colors cursor-pointer"
            @click="router.push(`/collections/${item.collectionId}/items/${item.id}`)"
          >
            <!-- Capa -->
            <div class="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[#252640] flex items-center justify-center">
              <img
                v-if="item.coverUrl"
                :src="item.coverUrl"
                :alt="item.name"
                class="w-full h-full object-cover"
              />
              <span v-else class="text-lg leading-none">{{ item.collectionTypeIcon ?? '📦' }}</span>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="text-[#e2e8f0] text-[13px] font-semibold truncate">{{ item.name }}</p>
              <p class="text-[#475569] text-[11px] truncate">
                {{ item.collectionTypeIcon }} {{ item.collectionName }}
              </p>
            </div>

            <!-- Rating -->
            <div v-if="item.rating" class="flex items-center gap-0.5 shrink-0">
              <Star :size="11" class="text-[#f59e0b] fill-[#f59e0b]" />
              <span class="text-[#f59e0b] text-[12px] font-bold">{{ item.rating }}</span>
            </div>
          </div>
        </div>

        <!-- Carregar mais -->
        <div v-if="allItems.hasMore" class="pt-2 pb-4 flex justify-center">
          <button
            class="flex items-center gap-2 bg-[#1e2038] hover:bg-[#252640] border border-[#252640] text-[#94a3b8] hover:text-[#e2e8f0] text-[13px] font-semibold px-5 py-2 rounded-lg transition-all disabled:opacity-50"
            :disabled="allItems.loadingMore"
            @click="allItems.loadMore()"
          >
            <span v-if="allItems.loadingMore">Carregando...</span>
            <span v-else>Carregar mais</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
