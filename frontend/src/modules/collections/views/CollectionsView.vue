<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Library, Plus, Package, BarChart2,
  LayoutGrid, List, Search, ChevronDown,
} from 'lucide-vue-next'
import { useCollectionsStore } from '../composables/useCollections'
import { useAllItemsStore } from '../composables/useAllItems'
import { useSteam } from '@/modules/integrations/steam/composables/useSteam'
import CollectionCard from '../components/CollectionCard.vue'
import CollectionForm from '../components/CollectionForm.vue'
import ItemCard from '../components/ItemCard.vue'
import ItemCreateModal from '../components/ItemCreateModal.vue'
import AppModal from '@/shared/ui/AppModal.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import type { ItemSort } from '../types'

const router = useRouter()
const route = useRoute()
const store = useCollectionsStore()
const allItems = useAllItemsStore()
const steam = useSteam()

const activeView = ref<'collections' | 'items'>(
  route.query.tab === 'items' ? 'items' : 'collections',
)

const showCreateCollectionModal = ref(false)
const showItemCreateModal = ref(false)
const showDeleteModal = ref(false)
const deletingId = ref<string | null>(null)
const deleting = ref(false)

const listSort = ref<ItemSort>('recent')
const listSearch = ref('')
let searchDebounce: ReturnType<typeof setTimeout> | null = null

const SORT_OPTIONS: { value: ItemSort; label: string }[] = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'name', label: 'Nome A→Z' },
  { value: 'name_desc', label: 'Nome Z→A' },
  { value: 'rating', label: 'Melhor avaliados' },
]

onMounted(() => {
  store.fetchCollections()
  if (activeView.value === 'items' && !allItems.initialized) {
    void allItems.fetchPage({ sort: listSort.value })
  }
})

async function switchToItems() {
  activeView.value = 'items'
  router.replace({ query: { tab: 'items' } })
  if (!allItems.initialized) {
    await allItems.fetchPage({ sort: listSort.value })
  }
}

function switchToCollections() {
  activeView.value = 'collections'
  router.replace({ query: {} })
}

function goToItem(collectionId: string, itemId: string) {
  router.push(`/collections/${collectionId}/items/${itemId}?from=items`)
}

watch(listSort, async (sort) => {
  if (activeView.value === 'items') {
    await allItems.fetchPage({ q: listSearch.value || undefined, sort })
  }
})

function onSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(async () => {
    if (activeView.value === 'items') {
      await allItems.fetchPage({ q: listSearch.value || undefined, sort: listSort.value })
    }
  }, 350)
}

async function onItemCreated() {
  showItemCreateModal.value = false
  await allItems.fetchPage({ q: listSearch.value || undefined, sort: listSort.value })
}

// Refresh ao import Steam — atualiza a lista de itens se estiver ativa
let lastSteamCompleted = 0
let steamRefreshScheduled = false
watch(() => steam.currentImport, (curr) => {
  if (!curr) return
  if (curr.completed === lastSteamCompleted && curr.stage !== 'done') return
  if (steamRefreshScheduled) return
  steamRefreshScheduled = true
  lastSteamCompleted = curr.completed
  setTimeout(() => {
    steamRefreshScheduled = false
    void allItems.refresh()
  }, 600)
}, { deep: true })

function goToCollection(id: string) {
  router.push(`/collections/${id}`)
}

function confirmDelete(id: string) {
  deletingId.value = id
  showDeleteModal.value = true
}

async function handleDelete() {
  if (!deletingId.value) return
  deleting.value = true
  try {
    await store.deleteCollection(deletingId.value)
  } finally {
    deleting.value = false
    showDeleteModal.value = false
    deletingId.value = null
  }
}

const deletingCollection = computed(() =>
  store.collections.find(c => c.id === deletingId.value),
)

const totalItems = computed(() =>
  store.collections.reduce((sum, c) => sum + (c.itemCount ?? 0), 0),
)

const isInitialLoading = computed(() => store.loading && store.collections.length === 0)
const isEmpty = computed(() => !store.loading && store.collections.length === 0)
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <AppPageHeader :icon="Library" title="Minhas Coleções">
      <template #subtitle>
        <span class="font-semibold text-[#cbd5e1]">{{ store.collections.length }}</span>
        <span>{{ store.collections.length === 1 ? 'coleção' : 'coleções' }}</span>
        <span class="text-[#475569]">·</span>
        <Package :size="11" class="text-[#f59e0b]" />
        <span class="font-semibold text-[#cbd5e1]">{{ totalItems }}</span>
        <span>{{ totalItems === 1 ? 'item' : 'itens' }}</span>
      </template>
      <template #action>
        <div class="flex items-center gap-2">
          <!-- Dashboard -->
          <button
            class="flex items-center gap-1.5 bg-[#1e2038] hover:bg-[#252640] border border-[#2e3050] text-[#94a3b8] hover:text-[#e2e8f0] text-[13px] font-semibold px-3.5 py-2 rounded-lg transition-all"
            @click="router.push('/collections/dashboard')"
          >
            <BarChart2 :size="15" />
            <span class="hidden sm:inline">Dashboard</span>
          </button>

          <!-- Nova coleção (sempre visível no header) -->
          <button
            class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 text-black text-[13px] font-semibold px-3.5 md:px-4 py-2 rounded-lg transition-all shadow-md shadow-[#f59e0b]/20"
            @click="showCreateCollectionModal = true"
          >
            <Plus :size="16" :stroke-width="2.5" />
            <span class="hidden sm:inline">Nova coleção</span>
            <span class="sm:hidden">Nova</span>
          </button>
        </div>
      </template>
    </AppPageHeader>

    <!-- Toggle de visão -->
    <div class="px-4 md:px-6 pt-4">
      <div class="flex gap-1 bg-[#1a1b2e] border border-[#252640] rounded-xl p-1 w-fit">
        <button
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
          :class="activeView === 'collections'
            ? 'bg-[#f59e0b] text-[#0f0f1a]'
            : 'text-[#94a3b8] hover:text-[#e2e8f0]'"
          @click="switchToCollections"
        >
          <LayoutGrid :size="14" />
          Coleções
        </button>
        <button
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all"
          :class="activeView === 'items'
            ? 'bg-[#f59e0b] text-[#0f0f1a]'
            : 'text-[#94a3b8] hover:text-[#e2e8f0]'"
          @click="switchToItems"
        >
          <List :size="14" />
          Itens
        </button>
      </div>
    </div>

    <!-- ── HEADER DA ABA ITENS (só aparece nessa aba) ── -->
    <div v-if="activeView === 'items'" class="px-4 md:px-6 pt-4 flex gap-2 items-center">
      <div class="relative flex-1 max-w-sm">
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
      <button
        class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 text-black text-[13px] font-semibold px-3.5 py-2 rounded-lg transition-all shadow-md shadow-[#f59e0b]/20 shrink-0"
        @click="showItemCreateModal = true"
      >
        <Plus :size="15" :stroke-width="2.5" />
        <span class="hidden sm:inline">Novo item</span>
      </button>
    </div>

    <!-- ── VISÃO: COLEÇÕES ── -->
    <div v-if="activeView === 'collections'" class="px-4 md:px-6 py-6">
      <!-- Loading skeleton -->
      <div
        v-if="isInitialLoading"
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        <div
          v-for="n in 8"
          :key="n"
          class="bg-[#1e2038] rounded-xl border border-[#252640] overflow-hidden"
        >
          <div class="aspect-[5/3] bg-[#252640] animate-pulse" />
          <div class="p-3 space-y-2">
            <div class="h-3 bg-[#252640] rounded animate-pulse w-2/3" />
            <div class="h-4 bg-[#252640] rounded animate-pulse" />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="isEmpty"
        class="flex flex-col items-center justify-center py-20 text-center"
      >
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1e2038] to-[#252640] border border-[#2e3050] flex items-center justify-center mb-5">
          <Library :size="36" class="text-[#f59e0b]" />
        </div>
        <h2 class="text-[16px] font-bold text-[#e2e8f0] mb-1.5">Nenhuma coleção ainda</h2>
        <p class="text-[13px] text-[#94a3b8] mb-6 max-w-xs">
          Comece criando sua primeira coleção de jogos, livros, cartas ou o que quiser catalogar.
        </p>
        <button
          class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 text-black text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-all shadow-md shadow-[#f59e0b]/20"
          @click="showCreateCollectionModal = true"
        >
          <Plus :size="16" :stroke-width="2.5" />
          Criar primeira coleção
        </button>
      </div>

      <!-- Grid -->
      <div
        v-else
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        <CollectionCard
          v-for="collection in store.collections"
          :key="collection.id"
          :collection="collection"
          @click="goToCollection"
          @delete="confirmDelete"
        />
      </div>

      <!-- Error state -->
      <div
        v-if="store.error"
        class="mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg"
      >
        <p class="text-[13px] text-red-400">{{ store.error }}</p>
      </div>
    </div>

    <!-- ── VISÃO: ITENS ── -->
    <div v-else class="px-4 md:px-6 py-4 space-y-4">
      <!-- Loading inicial: skeletons de card -->
      <div v-if="allItems.loading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        <div
          v-for="n in 12"
          :key="n"
          class="bg-[#1e2038] rounded-xl border border-[#252640] overflow-hidden animate-pulse"
          style="aspect-ratio: 2/3"
        />
      </div>

      <!-- Erro -->
      <div v-else-if="allItems.error" class="py-8 text-center text-[#94a3b8] text-[13px]">
        {{ allItems.error }}
      </div>

      <!-- Lista vazia -->
      <div v-else-if="allItems.items.length === 0" class="py-12 text-center">
        <p class="text-[#94a3b8] text-[13px]">Nenhum item encontrado.</p>
        <button
          class="mt-4 flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] active:scale-95 text-black text-[13px] font-semibold px-4 py-2 rounded-lg transition-all mx-auto"
          @click="showItemCreateModal = true"
        >
          <Plus :size="14" :stroke-width="2.5" />
          Adicionar primeiro item
        </button>
      </div>

      <!-- Grid de cards -->
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        <ItemCard
          v-for="item in allItems.items"
          :key="item.id"
          :item="item"
          :collection-type="item.collectionTypeKey"
          @click="goToItem(item.collectionId, item.id)"
        />
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

    <!-- Modal: criar coleção -->
    <AppModal v-if="showCreateCollectionModal" @close="showCreateCollectionModal = false">
      <CollectionForm @close="showCreateCollectionModal = false" />
    </AppModal>

    <!-- Modal: criar item -->
    <AppModal v-if="showItemCreateModal" size="lg" @close="showItemCreateModal = false">
      <ItemCreateModal
        :collections="store.collections"
        @close="showItemCreateModal = false"
        @created="onItemCreated"
      />
    </AppModal>

    <!-- Confirmar exclusão de coleção -->
    <AppConfirmDialog
      :open="showDeleteModal"
      title="Excluir coleção"
      confirm-label="Excluir"
      :loading="deleting"
      @cancel="showDeleteModal = false"
      @confirm="handleDelete"
    >
      <p>
        Tem certeza que deseja excluir
        <span class="text-(--color-text-primary) font-semibold">{{ deletingCollection?.name }}</span>?
      </p>
      <p class="text-(--color-danger) mt-2 text-xs">
        Todos os itens desta coleção serão excluídos permanentemente.
      </p>
    </AppConfirmDialog>
  </div>
</template>
