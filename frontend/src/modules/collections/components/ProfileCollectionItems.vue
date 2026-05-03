<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ArrowLeft, Search, ListFilter, X, Grid3x3, List, Flag } from 'lucide-vue-next'
import ReportDialog from '@/modules/reports/components/ReportDialog.vue'
import { getCollection } from '../services/collectionsService'
import { listItemsPage } from '../services/itemsService'
import ItemCard from './ItemCard.vue'
import ItemRow from './ItemRow.vue'
import ItemFiltersPanel from './ItemFiltersPanel.vue'
import ItemDetailModal from './ItemDetailModal.vue'
import type { Collection, Item, ItemSort, FieldFilterValue } from '../types'
import { useFeatureFlagsStore } from '@/shared/featureFlags/featureFlagsStore'

const props = defineProps<{
  collectionId: string
  /** Quando o item é clicado — emit pra rota detalhe se quiser. Default: nada. */
}>()

const emit = defineEmits<{
  back: []
}>()

const collection = ref<Collection | null>(null)
const collectionLoading = ref(false)
const collectionError = ref<string | null>(null)

const items = ref<Item[]>([])
const itemsLoading = ref(false)
const loadingMore = ref(false)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)

const search = ref('')
const searchInput = ref('')
const sort = ref<ItemSort>('recent')
const ratingMin = ref<number | null>(null)
const hasCover = ref<boolean | null>(null)
const fieldFilters = ref<Record<string, FieldFilterValue>>({})
const showFiltersPanel = ref(false)

const VIEW_MODE_KEY = 'collections:viewMode'
const viewMode = ref<'grid' | 'list'>(
  (localStorage.getItem(VIEW_MODE_KEY) as 'grid' | 'list') ?? 'grid',
)
function setViewMode(mode: 'grid' | 'list') {
  viewMode.value = mode
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

const activeFiltersCount = computed(() => {
  let count = 0
  if (ratingMin.value !== null) count += 1
  if (hasCover.value !== null) count += 1
  for (const v of Object.values(fieldFilters.value)) {
    if (v.contains) count += 1
    if (v.equalsAny && v.equalsAny.length > 0) count += 1
    if (v.boolValue !== undefined) count += 1
    if (v.gte !== undefined && v.gte !== null && v.gte !== '') count += 1
    if (v.lte !== undefined && v.lte !== null && v.lte !== '') count += 1
  }
  return count
})

const visibilityLabel = computed(() => {
  switch (collection.value?.visibility) {
    case 'public': return 'Pública'
    case 'friends_only': return 'Apenas amigos'
    case 'private': return 'Privada'
    default: return ''
  }
})

const featureFlags = useFeatureFlagsStore()
const hasSocialFeatures = computed(() =>
  featureFlags.isEnabled('module_feed') ||
  featureFlags.isEnabled('module_friends') ||
  featureFlags.isEnabled('module_communities'),
)

let searchDebounce: ReturnType<typeof setTimeout> | null = null
function onSearchInput(value: string) {
  searchInput.value = value
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    search.value = value.trim()
  }, 300)
}

function clearSearch() {
  searchInput.value = ''
  search.value = ''
}

function applyFilters(payload: {
  sort: ItemSort
  ratingMin: number | null
  hasCover: boolean | null
  fieldFilters: Record<string, FieldFilterValue>
}) {
  sort.value = payload.sort
  ratingMin.value = payload.ratingMin
  hasCover.value = payload.hasCover
  fieldFilters.value = payload.fieldFilters
  showFiltersPanel.value = false
}

function clearAllFilters() {
  ratingMin.value = null
  hasCover.value = null
  fieldFilters.value = {}
  sort.value = 'recent'
  clearSearch()
}

async function fetchCollection() {
  collectionLoading.value = true
  collectionError.value = null
  try {
    collection.value = await getCollection(props.collectionId)
  } catch (e: any) {
    collectionError.value = e?.response?.status === 404
      ? 'Coleção não encontrada ou sem permissão.'
      : 'Erro ao carregar coleção.'
  } finally {
    collectionLoading.value = false
  }
}

async function loadFirstPage() {
  itemsLoading.value = true
  try {
    const page = await listItemsPage(props.collectionId, {
      q: search.value || undefined,
      sort: sort.value,
      ratingMin: ratingMin.value,
      hasCover: hasCover.value,
      fieldFilters: fieldFilters.value,
      limit: 30,
      cursor: null,
    })
    items.value = page.items
    nextCursor.value = page.nextCursor
    hasMore.value = page.nextCursor !== null
  } catch {
    items.value = []
    hasMore.value = false
    nextCursor.value = null
  } finally {
    itemsLoading.value = false
  }
}

async function onLoadMore() {
  if (loadingMore.value || !hasMore.value || !nextCursor.value) return
  loadingMore.value = true
  try {
    const page = await listItemsPage(props.collectionId, {
      q: search.value || undefined,
      sort: sort.value,
      ratingMin: ratingMin.value,
      hasCover: hasCover.value,
      fieldFilters: fieldFilters.value,
      limit: 30,
      cursor: nextCursor.value,
    })
    const seen = new Set(items.value.map(i => i.id))
    for (const it of page.items) {
      if (!seen.has(it.id)) items.value.push(it)
    }
    nextCursor.value = page.nextCursor
    hasMore.value = page.nextCursor !== null
  } finally {
    loadingMore.value = false
  }
}

watch([search, sort, ratingMin, hasCover, fieldFilters], () => { loadFirstPage() }, { deep: true })

// Item em foco para modal de detalhes
const selectedItem = ref<Item | null>(null)
function openItemDetail(itemId: string) {
  const found = items.value.find(i => i.id === itemId)
  if (found) selectedItem.value = found
}
function closeItemDetail() {
  selectedItem.value = null
}

onMounted(async () => {
  await fetchCollection()
  if (collection.value) await loadFirstPage()
})

const coverSrc = computed(() => {
  const url = collection.value?.coverUrl
  if (!url) return ''
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${collection.value?.updatedAt ?? ''}`
})

const showReportDialog = ref(false)
</script>

<template>
  <div class="space-y-3">
    <!-- Header com botão voltar -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-sm transition-colors"
        @click="emit('back')"
      >
        <ArrowLeft :size="14" />
        <span>Coleções</span>
      </button>
      <div v-if="collection" class="flex-1 min-w-0 flex items-center gap-2">
        <h2 class="text-base font-bold text-(--color-text-primary) truncate">{{ collection.name }}</h2>
        <span class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-(--color-bg-elevated) text-xs text-(--color-text-muted)">
          <span class="text-(--color-accent-amber)">●</span>
          {{ collection.itemCount ?? 0 }}
          <span>{{ collection.itemCount === 1 ? 'item' : 'itens' }}</span>
        </span>
        <span
          v-if="hasSocialFeatures"
          class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs border"
          :class="collection.visibility === 'public'
            ? 'bg-[#22c55e]/15 text-[#86efac] border-[#22c55e]/30'
            : collection.visibility === 'friends_only'
              ? 'bg-[#3b82f6]/15 text-[#93c5fd] border-[#3b82f6]/30'
              : 'bg-(--color-bg-elevated) text-(--color-text-muted) border-(--color-bg-card)'"
        >
          {{ visibilityLabel }}
        </span>
      </div>
      <div v-if="collection" class="flex items-center gap-1">
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center bg-(--color-bg-elevated) text-(--color-text-muted) hover:text-(--color-danger) transition-colors"
          title="Denunciar coleção"
          @click="showReportDialog = true"
        >
          <Flag :size="14" />
        </button>
        <button
          :class="[
            'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            viewMode === 'grid' ? 'bg-(--color-accent-amber) text-black' : 'bg-(--color-bg-elevated) text-(--color-text-muted) hover:text-(--color-text-primary)',
          ]"
          title="Grade"
          @click="setViewMode('grid')"
        >
          <Grid3x3 :size="14" />
        </button>
        <button
          :class="[
            'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            viewMode === 'list' ? 'bg-(--color-accent-amber) text-black' : 'bg-(--color-bg-elevated) text-(--color-text-muted) hover:text-(--color-text-primary)',
          ]"
          title="Lista"
          @click="setViewMode('list')"
        >
          <List :size="14" />
        </button>
      </div>
    </div>

    <!-- Capa + descrição (compacto) -->
    <div v-if="collection" class="rounded-xl overflow-hidden bg-(--color-bg-card) border border-(--color-bg-elevated)">
      <div class="relative h-24">
        <img v-if="collection.coverUrl" :src="coverSrc" :alt="collection.name" class="w-full h-full object-cover" />
        <div v-else class="w-full h-full bg-gradient-to-br from-violet-900 to-indigo-900" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      </div>
      <p v-if="collection.description" class="px-4 py-2 text-xs text-(--color-text-secondary)">
        {{ collection.description }}
      </p>
    </div>

    <!-- Loading collection -->
    <div v-if="collectionLoading" class="text-center py-8 text-(--color-text-muted) text-sm">
      Carregando coleção...
    </div>
    <div v-else-if="collectionError" class="text-center py-8 text-(--color-danger) text-sm">
      {{ collectionError }}
    </div>

    <template v-else-if="collection">
      <!-- Barra de busca + filtros -->
      <div class="flex items-center gap-2">
        <div class="flex-1 relative">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-muted)" />
          <input
            type="text"
            placeholder="Buscar itens..."
            :value="searchInput"
            @input="(e) => onSearchInput((e.target as HTMLInputElement).value)"
            class="w-full pl-9 pr-9 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/30"
          />
          <button
            v-if="searchInput"
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors"
            @click="clearSearch"
          >
            <X :size="14" />
          </button>
        </div>
        <button
          type="button"
          class="relative flex items-center gap-1.5 px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-sm transition-colors"
          @click="showFiltersPanel = true"
        >
          <ListFilter :size="14" />
          <span class="hidden sm:inline">Filtros</span>
          <span
            v-if="activeFiltersCount > 0"
            class="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-(--color-accent-amber) text-[#0f0f1a]"
          >{{ activeFiltersCount }}</span>
        </button>
        <button
          v-if="activeFiltersCount > 0 || search"
          type="button"
          class="text-xs text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors px-2"
          @click="clearAllFilters"
        >
          Limpar
        </button>
      </div>

      <!-- Items: loading skeleton -->
      <div
        v-if="itemsLoading && items.length === 0"
        :class="viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3' : 'space-y-2'"
      >
        <div
          v-for="n in 8"
          :key="n"
          :class="[
            'bg-[#1e2038] rounded-xl animate-pulse border border-[#252640]',
            viewMode === 'grid' ? 'aspect-[2/3]' : 'h-[124px]',
          ]"
        />
      </div>

      <!-- Empty -->
      <div
        v-else-if="items.length === 0 && activeFiltersCount === 0 && !search"
        class="text-center py-16 text-(--color-text-muted) text-sm"
      >
        <span class="text-5xl block mb-3 opacity-50">📦</span>
        Esta coleção ainda está vazia.
      </div>
      <div
        v-else-if="items.length === 0"
        class="text-center py-16 text-(--color-text-muted) text-sm"
      >
        <span class="text-5xl block mb-3 opacity-50">🔍</span>
        Nenhum item encontrado.
        <button class="block mx-auto mt-2 text-(--color-accent-amber) hover:underline" @click="clearAllFilters">
          Limpar filtros
        </button>
      </div>

      <!-- Grid -->
      <div
        v-else-if="viewMode === 'grid'"
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
      >
        <ItemCard
          v-for="item in items"
          :key="item.id"
          :item="item"
          :field-schema="collection.fieldSchema"
          :collection-type="collection.type"
          @click="openItemDetail"
        />
      </div>

      <!-- List -->
      <div v-else class="space-y-2">
        <ItemRow
          v-for="item in items"
          :key="item.id"
          :item="item"
          :field-schema="collection.fieldSchema"
          :collection-type="collection.type"
          @click="openItemDetail"
        />
      </div>

      <!-- Carregar mais -->
      <div v-if="items.length > 0 && hasMore" class="flex justify-center mt-4">
        <button
          type="button"
          class="px-4 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-sm transition-colors disabled:opacity-50"
          :disabled="loadingMore"
          @click="onLoadMore"
        >
          {{ loadingMore ? 'Carregando...' : 'Carregar mais' }}
        </button>
      </div>

      <!-- Painel de filtros -->
      <ItemFiltersPanel
        v-if="collection.fieldSchema"
        :open="showFiltersPanel"
        :field-schema="collection.fieldSchema"
        :initial-sort="sort"
        :initial-rating-min="ratingMin"
        :initial-has-cover="hasCover"
        :initial-field-filters="fieldFilters"
        @close="showFiltersPanel = false"
        @apply="applyFilters"
      />

      <!-- Modal de detalhes do item -->
      <ItemDetailModal
        v-if="selectedItem"
        :item="selectedItem"
        :field-schema="collection.fieldSchema"
        @close="closeItemDetail"
      />
    </template>

    <ReportDialog
      :open="showReportDialog"
      target-type="collection"
      :target-id="collectionId"
      @close="showReportDialog = false"
      @reported="showReportDialog = false"
    />
  </div>
</template>
