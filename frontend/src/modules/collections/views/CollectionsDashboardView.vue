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
} from 'chart.js'
import { Bar } from 'vue-chartjs'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import { getCollectionStats } from '../services/collectionsService'
import type { CollectionStats } from '../types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const router = useRouter()
const stats = ref<CollectionStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const selectedTypeKey = ref<string | null>(null)

// Cores semânticas por valor de status (todos os tipos de coleção)
const STATUS_COLORS: Record<string, string> = {
  'Na fila': '#60a5fa', 'Em andamento': '#fbbf24', 'Zerado': '#4ade80', 'Platinado': '#c084fc',
  'Quero ler': '#60a5fa', 'Lendo': '#fbbf24', 'Lido': '#4ade80',
  'Tenho': '#4ade80', 'Quero': '#60a5fa', 'Emprestado': '#fbbf24',
}
const PALETTE = ['#f59e0b', '#60a5fa', '#4ade80', '#f87171', '#c084fc', '#34d399', '#fb923c', '#a78bfa', '#94a3b8']

// Ordem preferida por (typeKey, fieldKey)
const FIELD_ORDER: Record<string, Record<string, string[]>> = {
  games:      { status: ['Na fila', 'Em andamento', 'Zerado', 'Platinado'] },
  books:      { status: ['Quero ler', 'Lendo', 'Lido'] },
  boardgames: { status: ['Tenho', 'Quero', 'Emprestado'] },
}

// Opções Chart.js base
const baseTooltip = {
  backgroundColor: '#1e2038', titleColor: '#e2e8f0', bodyColor: '#94a3b8',
  borderColor: '#2e3050', borderWidth: 1, padding: 10,
}
const baseScale = { grid: { color: '#252640' }, ticks: { color: '#94a3b8', font: { size: 11 } }, border: { color: '#252640' } }

function horizontalOptions() {
  return {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 500 },
    indexAxis: 'y' as const,
    plugins: { legend: { display: false }, tooltip: baseTooltip },
    scales: {
      x: { ...baseScale, ticks: { ...baseScale.ticks, precision: 0 }, beginAtZero: true },
      y: { grid: { color: 'transparent' }, ticks: { color: '#94a3b8', font: { size: 12 } }, border: { color: '#252640' } },
    },
  }
}

function verticalOptions() {
  return {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: { legend: { display: false }, tooltip: baseTooltip },
    scales: {
      x: { grid: { color: 'transparent' }, ticks: { color: '#94a3b8', font: { size: 11 } }, border: { color: '#252640' } },
      y: { ...baseScale, ticks: { ...baseScale.ticks, precision: 0 }, beginAtZero: true },
    },
  }
}

// --- Totais ---
const totalItems = computed(() =>
  stats.value?.itemsByType.reduce((s, r) => s + r.count, 0) ?? 0,
)

// --- Itens por categoria ---
const categoryChart = computed(() => {
  const rows = stats.value?.itemsByType ?? []
  return {
    data: {
      labels: rows.map(r => r.typeIcon ? `${r.typeIcon} ${r.typeName}` : r.typeName),
      datasets: [{ data: rows.map(r => r.count), backgroundColor: '#f59e0b', borderRadius: 4, barThickness: 20 }],
    },
    options: horizontalOptions(),
    height: Math.max(80, rows.length * 40),
  }
})

// --- Todos os tipos disponíveis (para tabs) ---
const allTypeSections = computed(() => {
  if (!stats.value?.fieldBreakdownByType.length) return []

  const typeMap = new Map<string, {
    typeKey: string; typeName: string; typeIcon: string
    fields: Map<string, { fieldName: string; values: { label: string; count: number }[] }>
  }>()

  for (const row of stats.value.fieldBreakdownByType) {
    if (!typeMap.has(row.typeKey)) {
      typeMap.set(row.typeKey, { typeKey: row.typeKey, typeName: row.typeName, typeIcon: row.typeIcon, fields: new Map() })
    }
    const type = typeMap.get(row.typeKey)!
    if (!type.fields.has(row.fieldKey)) {
      type.fields.set(row.fieldKey, { fieldName: row.fieldName, values: [] })
    }
    type.fields.get(row.fieldKey)!.values.push({ label: row.fieldValue, count: row.count })
  }

  return [...typeMap.values()].map(({ typeKey, typeName, typeIcon, fields }) => {
    const fieldCharts = [...fields.entries()].map(([fieldKey, { fieldName, values }]) => {
      const order = FIELD_ORDER[typeKey]?.[fieldKey]
      let ordered = values
      if (order) {
        const map = new Map(values.map(v => [v.label, v.count]))
        ordered = order.filter(s => map.has(s)).map(s => ({ label: s, count: map.get(s)! }))
        values.filter(v => !order.includes(v.label)).forEach(v => ordered.push(v))
      }
      const isStatus = fieldKey === 'status'
      const colors = ordered.map((v, i) =>
        isStatus ? (STATUS_COLORS[v.label] ?? PALETTE[i % PALETTE.length]) : PALETTE[i % PALETTE.length],
      )
      return {
        fieldKey,
        title: fieldName,
        data: {
          labels: ordered.map(v => v.label),
          datasets: [{ data: ordered.map(v => v.count), backgroundColor: colors, borderRadius: 4, barThickness: 20 }],
        },
        options: horizontalOptions(),
        height: Math.max(80, ordered.length * 40),
      }
    })
    return { typeKey, typeName, typeIcon, fieldCharts }
  })
})

// Tipo atualmente selecionado (padrão: primeiro tipo disponível)
const activeSection = computed(() => {
  const sections = allTypeSections.value
  if (!sections.length) return null
  const key = selectedTypeKey.value ?? sections[0].typeKey
  return sections.find(s => s.typeKey === key) ?? sections[0]
})

// --- Zerados por ano (games) ---
const yearChart = computed(() => {
  const rows = stats.value?.gamesByCompletionYear ?? []
  if (!rows.length) return null
  return {
    data: {
      labels: rows.map(r => String(r.year)),
      datasets: [{ data: rows.map(r => r.count), backgroundColor: '#f59e0b', borderRadius: 4, barThickness: 32 }],
    },
    options: verticalOptions(),
    height: 180,
  }
})

// --- Classificações ---
const ratingsChart = computed(() => {
  const rows = [5, 4, 3, 2, 1, null].map(r => ({
    rating: r,
    count: stats.value?.itemsByRating.find(x => x.rating === r)?.count ?? 0,
  }))
  return {
    data: {
      labels: rows.map(r => r.rating !== null ? '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) : 'sem nota'),
      datasets: [{ data: rows.map(r => r.count), backgroundColor: rows.map(r => r.rating ? '#f59e0b' : '#475569'), borderRadius: 4, barThickness: 20 }],
    },
    options: horizontalOptions(),
    height: Math.max(80, rows.length * 40),
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
      <div v-for="n in 5" :key="n" class="bg-[#1e2038] rounded-xl border border-[#252640] p-5 h-48 animate-pulse" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-4 md:px-6 py-12 text-center text-[#94a3b8]">{{ error }}</div>

    <!-- Conteúdo -->
    <div v-else-if="stats" class="px-4 md:px-6 py-6 space-y-6">

      <!-- Totais -->
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

      <!-- Itens por categoria (visão geral) -->
      <div class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
        <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Itens por categoria</h2>
        <div v-if="stats.itemsByType.length === 0" class="text-[#94a3b8] text-sm">Nenhum item ainda.</div>
        <div v-else :style="{ height: categoryChart.height + 'px' }">
          <Bar :data="categoryChart.data" :options="categoryChart.options" />
        </div>
      </div>

      <!-- Tabs de tipos de coleção -->
      <div v-if="allTypeSections.length > 0">

        <!-- Seletor de tipo -->
        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="section in allTypeSections"
            :key="section.typeKey"
            class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all"
            :class="activeSection?.typeKey === section.typeKey
              ? 'bg-[#f59e0b] text-[#0f0f1a]'
              : 'bg-[#1e2038] border border-[#2e3050] text-[#94a3b8] hover:text-[#e2e8f0]'"
            @click="selectedTypeKey = section.typeKey"
          >
            <span v-if="section.typeIcon">{{ section.typeIcon }}</span>
            {{ section.typeName }}
          </button>
        </div>

        <!-- Gráficos do tipo selecionado -->
        <template v-if="activeSection">
          <div
            v-for="chart in activeSection.fieldCharts"
            :key="activeSection.typeKey + chart.fieldKey"
            class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5"
          >
            <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">{{ chart.title }}</h2>
            <div :style="{ height: chart.height + 'px' }">
              <Bar :data="chart.data" :options="chart.options" />
            </div>
          </div>

          <!-- Zerados por ano (exclusivo games) -->
          <div
            v-if="activeSection.typeKey === 'games' && yearChart"
            class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5"
          >
            <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Jogos zerados por ano</h2>
            <div :style="{ height: yearChart.height + 'px' }">
              <Bar :data="yearChart.data" :options="yearChart.options" />
            </div>
          </div>

          <!-- Classificações do tipo selecionado -->
          <div class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
            <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Classificações por estrelas</h2>
            <div :style="{ height: ratingsChart.height + 'px' }">
              <Bar :data="ratingsChart.data" :options="ratingsChart.options" />
            </div>
          </div>
        </template>

      </div>
      <div v-else class="bg-[#1e2038] rounded-xl border border-[#252640] p-4 md:p-5">
        <h2 class="text-[#e2e8f0] font-semibold text-[14px] mb-4">Classificações por estrelas</h2>
        <div :style="{ height: ratingsChart.height + 'px' }">
          <Bar :data="ratingsChart.data" :options="ratingsChart.options" />
        </div>
      </div>

    </div>
  </div>
</template>
