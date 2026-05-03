<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { BarChart2, Library, Package, ArrowLeft } from 'lucide-vue-next'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'vue-chartjs'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import { getCollectionStats } from '../services/collectionsService'
import type { CollectionStats } from '../types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const router = useRouter()
const stats = ref<CollectionStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Cores por status (todos os tipos de coleção)
const STATUS_COLORS: Record<string, string> = {
  // games
  'Na fila': '#60a5fa',
  'Em andamento': '#fbbf24',
  'Zerado': '#4ade80',
  'Platinado': '#c084fc',
  // books
  'Quero ler': '#60a5fa',
  'Lendo': '#fbbf24',
  'Lido': '#4ade80',
  // boardgames
  'Tenho': '#4ade80',
  'Quero': '#60a5fa',
  'Emprestado': '#fbbf24',
}

// Ordem preferida de status por tipo
const STATUS_ORDER: Record<string, string[]> = {
  games: ['Na fila', 'Em andamento', 'Zerado', 'Platinado'],
  books: ['Quero ler', 'Lendo', 'Lido'],
  boardgames: ['Tenho', 'Quero', 'Emprestado'],
}

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 600 },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e2038',
      titleColor: '#e2e8f0',
      bodyColor: '#94a3b8',
      borderColor: '#2e3050',
      borderWidth: 1,
      padding: 10,
    },
  },
  scales: {
    x: {
      grid: { color: '#252640' },
      ticks: { color: '#94a3b8', font: { size: 11 } },
      border: { color: '#252640' },
    },
    y: {
      grid: { color: '#252640' },
      ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0 },
      border: { color: '#252640' },
      beginAtZero: true,
    },
  },
}

const HORIZONTAL_DEFAULTS = {
  ...CHART_DEFAULTS,
  indexAxis: 'y' as const,
  scales: {
    x: {
      ...CHART_DEFAULTS.scales.x,
      ticks: { ...CHART_DEFAULTS.scales.x.ticks, precision: 0 },
      beginAtZero: true,
    },
    y: {
      grid: { color: 'transparent' },
      ticks: { color: '#94a3b8', font: { size: 12 } },
      border: { color: '#252640' },
    },
  },
}

// --- Totais ---
const totalItems = computed(() =>
  stats.value?.itemsByType.reduce((s, r) => s + r.count, 0) ?? 0,
)

// --- Itens por categoria ---
const itemsByTypeChart = computed(() => {
  const rows = stats.value?.itemsByType ?? []
  return {
    data: {
      labels: rows.map(r => `${r.typeIcon} ${r.typeName}`),
      datasets: [{
        data: rows.map(r => r.count),
        backgroundColor: '#f59e0b',
        borderRadius: 4,
        barThickness: 18,
      }],
    },
    options: { ...HORIZONTAL_DEFAULTS },
    height: Math.max(80, rows.length * 36),
  }
})

// --- Status por tipo de coleção ---
const statusByTypeCharts = computed(() => {
  if (!stats.value?.statusByType.length) return []

  // Agrupa por typeKey
  const map = new Map<string, {
    typeKey: string; typeName: string; typeIcon: string
    statuses: Map<string, number>
  }>()

  for (const row of stats.value.statusByType) {
    if (!map.has(row.typeKey)) {
      map.set(row.typeKey, {
        typeKey: row.typeKey,
        typeName: row.typeName,
        typeIcon: row.typeIcon,
        statuses: new Map(),
      })
    }
    if (row.status) {
      map.get(row.typeKey)!.statuses.set(row.status, row.count)
    }
  }

  return [...map.values()].map(({ typeKey, typeName, typeIcon, statuses }) => {
    const order = STATUS_ORDER[typeKey] ?? [...statuses.keys()]
    const labels = order.filter(s => statuses.has(s))
    const data = labels.map(s => statuses.get(s)!)
    const colors = labels.map(s => STATUS_COLORS[s] ?? '#94a3b8')

    return {
      title: `${typeIcon} ${typeName} — por status`,
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderRadius: 4,
          barThickness: 18,
        }],
      },
      options: { ...HORIZONTAL_DEFAULTS },
      height: Math.max(80, labels.length * 36),
    }
  })
})

// --- Zerados por ano (games) ---
const yearChart = computed(() => {
  const rows = stats.value?.gamesByCompletionYear ?? []
  if (!rows.length) return null
  return {
    data: {
      labels: rows.map(r => String(r.year)),
      datasets: [{
        label: 'Jogos zerados',
        data: rows.map(r => r.count),
        backgroundColor: '#f59e0b',
        borderRadius: 4,
        barThickness: 28,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: false },
      },
    },
    height: 180,
  }
})

// --- Classificações ---
const ratingsChart = computed(() => {
  const rows = [5, 4, 3, 2, 1, null].map(r => ({
    rating: r,
    count: stats.value?.itemsByRating.find(x => x.rating === r)?.count ?? 0,
  }))
  const labels = rows.map(r => r.rating !== null ? '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) : 'sem nota')
  return {
    data: {
      labels,
      datasets: [{
        data: rows.map(r => r.count),
        backgroundColor: rows.map(r => r.rating !== null ? '#f59e0b' : '#475569'),
        borderRadius: 4,
        barThickness: 18,
      }],
    },
    options: { ...HORIZONTAL_DEFAULTS },
    height: Math.max(80, rows.length * 36),
  }
})

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
      <template #subtitle>visão geral das suas coleções</template>
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
      <div v-for="n in 4" :key="n" class="bg-[#1e2038] rounded-xl border border-[#252640] p-5 h-48 animate-pulse" />
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
      <div v-if="stats.itemsByType.length > 0" class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
        <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Itens por categoria</h2>
        <div :style="{ height: itemsByTypeChart.height + 'px' }">
          <Bar :data="itemsByTypeChart.data" :options="itemsByTypeChart.options" />
        </div>
      </div>
      <div v-else class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
        <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-2">Itens por categoria</h2>
        <p class="text-[#94a3b8] text-[13px]">Nenhum item ainda.</p>
      </div>

      <!-- Status por tipo de coleção -->
      <div
        v-for="chart in statusByTypeCharts"
        :key="chart.title"
        class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5"
      >
        <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">{{ chart.title }}</h2>
        <div :style="{ height: chart.height + 'px' }">
          <Bar :data="chart.data" :options="chart.options" />
        </div>
      </div>

      <!-- Jogos zerados por ano -->
      <div v-if="yearChart" class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
        <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Jogos zerados por ano</h2>
        <div :style="{ height: yearChart.height + 'px' }">
          <Bar :data="yearChart.data" :options="yearChart.options" />
        </div>
      </div>

      <!-- Classificações -->
      <div class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
        <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Classificações</h2>
        <div :style="{ height: ratingsChart.height + 'px' }">
          <Bar :data="ratingsChart.data" :options="ratingsChart.options" />
        </div>
      </div>

    </div>
  </div>
</template>
