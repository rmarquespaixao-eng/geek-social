<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { BarChart2, Library, Package, ArrowLeft } from 'lucide-vue-next'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import { getCollectionStats } from '../services/collectionsService'
import type { CollectionStats } from '../types'

const router = useRouter()
const stats = ref<CollectionStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const STATUS_ORDER = ['Na fila', 'Em andamento', 'Zerado', 'Platinado']
const STATUS_COLORS: Record<string, string> = {
  'Na fila': '#60a5fa',
  'Em andamento': '#fbbf24',
  'Zerado': '#4ade80',
  'Platinado': '#c084fc',
}

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

const completionYears = computed(() => stats.value?.gamesByCompletionYear ?? [])
const maxByYear = computed(() => Math.max(1, ...completionYears.value.map(r => r.count)))

onMounted(async () => {
  loading.value = true
  try {
    stats.value = await getCollectionStats()
  } catch {
    error.value = 'Não foi possível carregar as estatísticas.'
  } finally {
    loading.value = false
  }
})
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

    <!-- Loading -->
    <div v-if="loading" class="px-4 md:px-6 py-6 space-y-6">
      <div class="grid grid-cols-2 gap-4">
        <div v-for="n in 2" :key="n" class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 h-24 animate-pulse" />
      </div>
      <div v-for="n in 4" :key="n" class="bg-[#1e2038] rounded-xl border border-[#252640] p-5 h-36 animate-pulse" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-4 md:px-6 py-12 text-center text-[#94a3b8]">
      {{ error }}
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

      <!-- Jogos zerados por ano (barra vertical) -->
      <div v-if="completionYears.length > 0" class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
        <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-5">Jogos zerados por ano</h2>
        <div class="flex items-end gap-2 overflow-x-auto pb-2" style="min-height: 140px;">
          <div
            v-for="row in completionYears"
            :key="row.year"
            class="flex flex-col items-center gap-1.5 flex-shrink-0"
            style="min-width: 44px;"
          >
            <!-- Quantidade acima da barra -->
            <span class="text-[11px] font-bold text-[#f59e0b]">{{ row.count }}</span>
            <!-- Barra vertical -->
            <div class="w-8 rounded-t-md bg-[#f59e0b]/20 relative" style="height: 100px;">
              <div
                class="absolute bottom-0 left-0 right-0 rounded-t-md bg-[#f59e0b] transition-all duration-700"
                :style="{ height: `${Math.max(4, (row.count / maxByYear) * 100)}%` }"
              />
            </div>
            <!-- Ano -->
            <span class="text-[11px] text-[#64748b] font-medium">{{ row.year }}</span>
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
  </div>
</template>
