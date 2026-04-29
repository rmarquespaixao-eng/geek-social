<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCollectionsStore } from '../composables/useCollections'
import { useItemsStore } from '../composables/useItems'
import { useSteam } from '@/modules/integrations/steam/composables/useSteam'
import ItemCard from '../components/ItemCard.vue'
import ItemRow from '../components/ItemRow.vue'
import CollectionForm from '../components/CollectionForm.vue'
import CollectionCoverUpload from '../components/CollectionCoverUpload.vue'
import CollectionSchemaEditor from '../components/CollectionSchemaEditor.vue'
import ItemFiltersPanel from '../components/ItemFiltersPanel.vue'
import ListingFormModal from '@/modules/offers/components/ListingFormModal.vue'
import { listMyListings, type ListingWithItem } from '@/modules/offers/services/listingsService'
import AppModal from '@/shared/ui/AppModal.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import { Camera, Edit3, MoreHorizontal, Settings2, Trash2, Grid3x3, List, Plus, Gamepad2, Search, ListFilter, X } from 'lucide-vue-next'
import type { ItemSort, FieldFilterValue } from '../types'
import { useAuthStore } from '@/shared/auth/authStore'

const route = useRoute()
const router = useRouter()
const collectionsStore = useCollectionsStore()
const itemsStore = useItemsStore()
const auth = useAuthStore()

const collectionId = computed(() => route.params.id as string)

// View mode: grid | list — persisted in localStorage
const VIEW_MODE_KEY = 'collections:viewMode'
const viewMode = ref<'grid' | 'list'>(
  (localStorage.getItem(VIEW_MODE_KEY) as 'grid' | 'list') ?? 'grid',
)

function setViewMode(mode: 'grid' | 'list') {
  viewMode.value = mode
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

const showEditCollectionModal = ref(false)
const showSchemaEditor = ref(false)
const showDeleteModal = ref(false)
const deletingCollection = ref(false)
const showActionsMenu = ref(false)
const actionsMenuRef = ref<HTMLElement | null>(null)

function closeActionsMenuOnOutside(e: MouseEvent) {
  if (!showActionsMenu.value) return
  if (actionsMenuRef.value && !actionsMenuRef.value.contains(e.target as Node)) {
    showActionsMenu.value = false
  }
}

onMounted(() => document.addEventListener('click', closeActionsMenuOnOutside))
onUnmounted(() => document.removeEventListener('click', closeActionsMenuOnOutside))

function goToSteamImport() {
  showActionsMenu.value = false
  router.push({
    path: '/integrations/steam/import',
    query: { collectionId: collectionId.value },
  })
}

const showSteamImport = computed(() =>
  collection.value?.type === 'games' && steam.isLinked && steam.hasApiKey,
)

async function handleDeleteCollection() {
  deletingCollection.value = true
  try {
    await collectionsStore.deleteCollection(collectionId.value)
    router.push('/collections')
  } finally {
    deletingCollection.value = false
    showDeleteModal.value = false
  }
}

// ── Busca + filtros + sort ─────────────────────────────────────────────────
const searchInput = ref('')
const search = ref('')
const sort = ref<ItemSort>('recent')
const ratingMin = ref<number | null>(null)
const hasCover = ref<boolean | null>(null)
const fieldFilters = ref<Record<string, FieldFilterValue>>({})
const showFiltersPanel = ref(false)

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

async function reloadItems() {
  if (!collectionId.value) return
  await itemsStore.fetchPage(collectionId.value, {
    q: search.value || undefined,
    sort: sort.value,
    ratingMin: ratingMin.value,
    hasCover: hasCover.value,
    fieldFilters: fieldFilters.value,
  })
}

watch([search, sort, ratingMin, hasCover, fieldFilters], () => { reloadItems() }, { deep: true })

async function onLoadMore() {
  await itemsStore.loadMore()
}

onMounted(async () => {
  await collectionsStore.fetchCollection(collectionId.value)
  await reloadItems()
  await refreshListings()
})

// Refresh silencioso (merge por id, sem loading/flicker) quando há import Steam ativo nesta coleção
const steam = useSteam()
let lastRefetchedCompleted = 0
let refreshScheduled = false
watch(() => steam.currentImport, (curr) => {
  if (!curr || curr.collectionId !== collectionId.value) return
  const isDone = curr.stage === 'done'
  const enoughDelta = curr.completed - lastRefetchedCompleted >= 10
  if (!isDone && !enoughDelta) return
  if (refreshScheduled) return
  refreshScheduled = true
  lastRefetchedCompleted = curr.completed
  // debounce simples: agrupa rajadas de eventos socket em 1 refresh por janela
  setTimeout(() => {
    refreshScheduled = false
    void itemsStore.refreshItems(collectionId.value)
  }, 300)
}, { deep: true })

const collection = computed(() => collectionsStore.current)
const isOwner = computed(() => Boolean(collection.value && auth.user && collection.value.userId === auth.user.id))

const coverSrc = computed(() => {
  const url = collection.value?.coverUrl
  if (!url) return ''
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${collection.value?.updatedAt ?? ''}`
})

const visibilityLabel = computed(() => {
  switch (collection.value?.visibility) {
    case 'public': return 'Pública'
    case 'friends_only': return 'Apenas amigos'
    case 'private': return 'Privada'
    default: return ''
  }
})

function openCreateItem() {
  router.push(`/collections/${collectionId.value}/items/new`)
}

function goToItem(itemId: string) {
  router.push(`/collections/${collectionId.value}/items/${itemId}`)
}

// ── Listings (vitrine) ─────────────────────────────────────────────────────
const myListings = ref<ListingWithItem[]>([])
const listingByItemId = computed(() => {
  const map: Record<string, ListingWithItem> = {}
  for (const l of myListings.value) map[l.itemId] = l
  return map
})

async function refreshListings() {
  if (!isOwner.value) return
  try {
    myListings.value = await listMyListings('active')
  } catch {
    myListings.value = []
  }
}

watch(isOwner, (v) => { if (v) refreshListings() })

const listingFormOpen = ref(false)
const listingFormItemId = ref<string | null>(null)
const listingFormItemName = ref<string>('')
const listingFormExisting = ref<ListingWithItem | null>(null)

function onListAction(itemId: string) {
  const item = itemsStore.items.find(i => i.id === itemId)
  if (!item) return
  listingFormItemId.value = itemId
  listingFormItemName.value = item.name
  listingFormExisting.value = listingByItemId.value[itemId] ?? null
  listingFormOpen.value = true
}

function onListingSaved() {
  listingFormOpen.value = false
  listingFormItemId.value = null
  listingFormExisting.value = null
  refreshListings()
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f1a]">
    <!-- Loading -->
    <div v-if="collectionsStore.loading && !collection" class="p-4">
      <div class="h-[120px] bg-[#1e2038] rounded-[10px] animate-pulse mb-4" />
    </div>

    <template v-else-if="collection">
      <!-- Banner / cover area -->
      <div class="relative h-[180px]">
        <!-- Wrapper interno que clipa a imagem (sem clipar o dropdown que sai pra fora) -->
        <div class="absolute inset-0 overflow-hidden">
          <img
            v-if="collection.coverUrl"
            :src="coverSrc"
            :alt="collection.name"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-violet-900 to-indigo-900"
          />

          <!-- Gradient overlay for text legibility (mais forte na base) -->
          <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/10" />
        </div>

        <!-- Content over banner -->
        <div class="absolute inset-x-0 bottom-0 px-4 md:px-6 pb-4 flex items-end justify-between gap-3 z-10">
          <div class="min-w-0">
            <h1 class="text-[22px] md:text-[26px] font-bold text-white leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] truncate">
              {{ collection.name }}
            </h1>
            <div class="mt-1.5 flex items-center gap-2 text-[12px] text-white/85">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm font-semibold">
                <span class="text-[#fbbf24]">●</span>
                <span>{{ collection.itemCount ?? 0 }}</span>
                <span class="text-white/75">{{ collection.itemCount === 1 ? 'item' : 'itens' }}</span>
              </span>
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full backdrop-blur-sm font-semibold border"
                :class="collection.visibility === 'public'
                  ? 'bg-[#22c55e]/25 text-[#86efac] border-[#22c55e]/40'
                  : collection.visibility === 'friends_only'
                    ? 'bg-[#3b82f6]/25 text-[#93c5fd] border-[#3b82f6]/40'
                    : 'bg-black/40 text-white/85 border-white/20'"
              >
                {{ visibilityLabel }}
              </span>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex items-center gap-1.5">
            <!-- Grid toggle -->
            <button
              :class="[
                'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                viewMode === 'grid' ? 'bg-[#f59e0b] text-black' : 'bg-black/50 hover:bg-black/70 text-white/80',
              ]"
              title="Grade"
              @click="setViewMode('grid')"
            >
              <Grid3x3 :size="14" />
            </button>
            <!-- List toggle -->
            <button
              :class="[
                'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                viewMode === 'list' ? 'bg-[#f59e0b] text-black' : 'bg-black/50 hover:bg-black/70 text-white/80',
              ]"
              title="Lista"
              @click="setViewMode('list')"
            >
              <List :size="14" />
            </button>

            <!-- Add item (primary) -->
            <button
              v-if="isOwner"
              class="flex items-center gap-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-black text-[12px] font-semibold px-3 py-1.5 rounded-[6px] transition-colors"
              @click="openCreateItem"
            >
              <Plus :size="14" />
              <span class="hidden sm:inline">Item</span>
            </button>

            <!-- Actions dropdown (apenas owner) -->
            <div v-if="isOwner" ref="actionsMenuRef" class="relative">
              <button
                class="w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                title="Mais opções"
                @click.stop="showActionsMenu = !showActionsMenu"
              >
                <MoreHorizontal :size="16" />
              </button>

              <Transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
              >
                <div
                  v-if="showActionsMenu"
                  class="absolute right-0 mt-1 w-56 bg-(--color-bg-card) border border-(--color-bg-elevated) rounded-lg shadow-2xl z-30 py-1 origin-top-right"
                >
                  <CollectionCoverUpload :collection-id="collectionId">
                    <template #default="{ open, uploading }">
                      <button
                        class="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors disabled:opacity-60"
                        :disabled="uploading"
                        @click="open(); showActionsMenu = false"
                      >
                        <Camera :size="14" class="text-(--color-text-muted)" />
                        <span>{{ uploading ? 'Enviando capa...' : 'Trocar capa' }}</span>
                      </button>
                    </template>
                  </CollectionCoverUpload>

                  <button
                    class="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
                    @click="showEditCollectionModal = true; showActionsMenu = false"
                  >
                    <Edit3 :size="14" class="text-(--color-text-muted)" />
                    <span>Editar coleção</span>
                  </button>

                  <button
                    class="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
                    @click="showSchemaEditor = true; showActionsMenu = false"
                  >
                    <Settings2 :size="14" class="text-(--color-text-muted)" />
                    <span>Gerenciar campos</span>
                  </button>

                  <template v-if="showSteamImport">
                    <div class="border-t border-(--color-bg-elevated) my-1"></div>
                    <button
                      class="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--color-text-primary) hover:bg-(--color-bg-elevated) transition-colors"
                      @click="goToSteamImport"
                    >
                      <Gamepad2 :size="14" class="text-(--color-accent-amber)" />
                      <span>Importar da Steam</span>
                    </button>
                  </template>

                  <div class="border-t border-(--color-bg-elevated) my-1"></div>
                  <button
                    class="w-full flex items-center gap-3 px-3 py-2 text-sm text-(--color-danger) hover:bg-(--color-danger)/10 transition-colors"
                    @click="showDeleteModal = true; showActionsMenu = false"
                  >
                    <Trash2 :size="14" />
                    <span>Excluir coleção</span>
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </div>

      <!-- Search + filters bar -->
      <div class="px-4 pt-3 flex items-center gap-2">
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
            title="Limpar busca"
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

      <!-- Items content -->
      <div class="p-4">
        <!-- Loading items -->
        <div
          v-if="itemsStore.loading && itemsStore.items.length === 0"
          :class="viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3' : 'space-y-2'"
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

        <!-- Empty state — sem itens na coleção -->
        <div
          v-else-if="itemsStore.items.length === 0 && activeFiltersCount === 0 && !search"
          class="flex flex-col items-center justify-center py-16 text-center"
        >
          <span class="text-5xl mb-4 opacity-50">📦</span>
          <p class="text-[14px] font-medium text-[#94a3b8]">
            {{ isOwner ? 'Nenhum item ainda' : 'Esta coleção ainda está vazia' }}
          </p>
          <p v-if="isOwner" class="text-[12px] text-[#475569] mt-1 mb-4">Adicione o primeiro item a esta coleção</p>
          <button
            v-if="isOwner"
            class="bg-[#f59e0b] hover:bg-[#d97706] text-black text-[13px] font-semibold px-4 py-2 rounded-[6px] transition-colors"
            @click="openCreateItem"
          >
            + Adicionar item
          </button>
        </div>

        <!-- Empty state — filtros sem resultado -->
        <div
          v-else-if="itemsStore.items.length === 0"
          class="flex flex-col items-center justify-center py-16 text-center"
        >
          <span class="text-5xl mb-4 opacity-50">🔍</span>
          <p class="text-[14px] font-medium text-[#94a3b8]">Nenhum item encontrado</p>
          <p class="text-[12px] text-[#475569] mt-1 mb-4">Tente ajustar a busca ou os filtros</p>
          <button
            class="text-[13px] text-(--color-accent-amber) hover:underline"
            @click="clearAllFilters"
          >
            Limpar filtros
          </button>
        </div>

        <!-- Grid view -->
        <div
          v-else-if="viewMode === 'grid'"
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          <ItemCard
            v-for="item in itemsStore.items"
            :key="item.id"
            :item="item"
            :field-schema="collection.fieldSchema"
            :collection-type="collection.type"
            :listing="listingByItemId[item.id] ?? null"
            :can-list="isOwner"
            @click="goToItem"
            @list-action="onListAction"
          />
        </div>

        <!-- List view -->
        <div v-else class="space-y-2">
          <ItemRow
            v-for="item in itemsStore.items"
            :key="item.id"
            :item="item"
            :field-schema="collection.fieldSchema"
            :collection-type="collection.type"
            :listing="listingByItemId[item.id] ?? null"
            :can-list="isOwner"
            @click="goToItem"
            @list-action="onListAction"
          />
        </div>

        <!-- Carregar mais -->
        <div
          v-if="itemsStore.items.length > 0 && itemsStore.hasMore"
          class="flex justify-center mt-6"
        >
          <button
            type="button"
            class="px-4 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-secondary) hover:text-(--color-text-primary) text-sm transition-colors disabled:opacity-50"
            :disabled="itemsStore.loadingMore"
            @click="onLoadMore"
          >
            {{ itemsStore.loadingMore ? 'Carregando...' : 'Carregar mais' }}
          </button>
        </div>
      </div>
    </template>

    <!-- Painel de filtros -->
    <ItemFiltersPanel
      v-if="collection?.fieldSchema"
      :open="showFiltersPanel"
      :field-schema="collection.fieldSchema"
      :initial-sort="sort"
      :initial-rating-min="ratingMin"
      :initial-has-cover="hasCover"
      :initial-field-filters="fieldFilters"
      @close="showFiltersPanel = false"
      @apply="applyFilters"
    />

    <!-- Floating add button (mobile, apenas owner) -->
    <button
      v-if="isOwner"
      class="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#f59e0b] hover:bg-[#d97706] text-black text-2xl rounded-full shadow-lg flex items-center justify-center transition-colors"
      @click="openCreateItem"
    >
      +
    </button>

    <!-- Edit collection modal -->
    <AppModal v-if="showEditCollectionModal" @close="showEditCollectionModal = false">
      <CollectionForm
        :collection="collection ?? undefined"
        @close="showEditCollectionModal = false"
      />
    </AppModal>

    <!-- Schema editor modal -->
    <AppModal v-if="showSchemaEditor && collection" size="xl" @close="showSchemaEditor = false">
      <CollectionSchemaEditor
        :collection="collection"
        @close="showSchemaEditor = false"
      />
    </AppModal>

    <!-- Delete collection confirmation -->
    <AppConfirmDialog
      :open="showDeleteModal"
      title="Excluir coleção"
      confirm-label="Excluir"
      :loading="deletingCollection"
      @cancel="showDeleteModal = false"
      @confirm="handleDeleteCollection"
    >
      <p>
        Tem certeza que deseja excluir
        <span class="text-(--color-text-primary) font-semibold">{{ collection?.name }}</span>?
      </p>
      <p class="text-(--color-danger) mt-2">
        Todos os itens desta coleção serão excluídos permanentemente.
      </p>
    </AppConfirmDialog>

    <ListingFormModal
      v-if="listingFormOpen && listingFormItemId"
      :open="listingFormOpen"
      :item-id="listingFormItemId"
      :item-name="listingFormItemName"
      :existing-listing="listingFormExisting"
      @close="listingFormOpen = false; listingFormItemId = null; listingFormExisting = null"
      @created="onListingSaved"
      @updated="onListingSaved"
    />
  </div>
</template>
