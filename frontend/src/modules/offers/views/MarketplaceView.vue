<!-- src/modules/offers/views/MarketplaceView.vue
  Feed dedicado a itens disponíveis para venda/troca. Filtros simples por tipo,
  tipo de coleção e faixa de preço. Click no card abre OfferDialog inline.
-->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Store, Tag, ArrowLeftRight, Image as ImageIcon, HandCoins, Info } from 'lucide-vue-next'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import OfferDialog from '../components/OfferDialog.vue'
import ItemDetailModal from '@/modules/collections/components/ItemDetailModal.vue'
import type { Item } from '@/modules/collections/types'
import { listMarketplace, type MarketplaceItem, type MarketplaceQuery } from '../services/marketplaceService'

const items = ref<MarketplaceItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const typeFilter = ref<'all' | 'sale' | 'trade' | 'both'>('all')
const collectionTypeFilter = ref<string>('')
const minPrice = ref<string>('')
const maxPrice = ref<string>('')

const COLLECTION_TYPES = [
  { value: '',           label: 'Todos' },
  { value: 'games',      label: 'Jogos' },
  { value: 'books',      label: 'Livros' },
  { value: 'cardgames',  label: 'Card Games' },
  { value: 'boardgames', label: 'Boardgames' },
  { value: 'custom',     label: 'Custom' },
]

async function refresh() {
  loading.value = true
  error.value = null
  try {
    const q: MarketplaceQuery = { limit: 60 }
    if (typeFilter.value !== 'all') q.type = typeFilter.value
    if (collectionTypeFilter.value) q.collectionType = collectionTypeFilter.value
    if (minPrice.value) q.minPrice = Number(minPrice.value)
    if (maxPrice.value) q.maxPrice = Number(maxPrice.value)
    items.value = await listMarketplace(q)
  } catch {
    error.value = 'Erro ao carregar marketplace.'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

// Modal de oferta (acionado pelo atalho "Fazer oferta" do hover)
const offerOpen = ref(false)
const selected = ref<MarketplaceItem | null>(null)

function openOffer(item: MarketplaceItem) {
  selected.value = item
  offerOpen.value = true
}

// Modal de detalhes — reusa ItemDetailModal (DRY); o próprio modal já contém
// o botão "Fazer oferta" via canMakeOffer=true, então o usuário pode ofertar
// dali também sem precisar fechar e abrir outro modal.
const detailsOpen = ref(false)
const detailsItem = ref<Item | null>(null)
const detailsSchema = ref<MarketplaceItem['fieldSchema']>([])

function openDetails(item: MarketplaceItem) {
  detailsItem.value = {
    id: item.id,
    collectionId: item.collectionId,
    name: item.name,
    coverUrl: item.coverUrl ?? undefined,
    rating: item.rating ?? undefined,
    comment: item.comment ?? undefined,
    fields: item.fields,
    availability: item.availability,
    askingPrice: item.askingPrice,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
  detailsSchema.value = item.fieldSchema
  detailsOpen.value = true
}

function priceFormatted(p: string | null): string {
  if (!p) return ''
  const n = Number(p)
  if (Number.isNaN(n)) return p
  return n.toFixed(2).replace('.', ',')
}

function badgeFor(item: MarketplaceItem): { icon: any; label: string; cls: string } {
  if (item.availability === 'sale')
    return { icon: Tag, label: item.askingPrice ? `R$ ${priceFormatted(item.askingPrice)}` : 'À venda', cls: 'bg-(--color-accent-amber) text-black' }
  if (item.availability === 'trade')
    return { icon: ArrowLeftRight, label: 'Para troca', cls: 'bg-blue-500 text-white' }
  return { icon: Tag, label: item.askingPrice ? `R$ ${priceFormatted(item.askingPrice)} / troca` : 'Venda ou troca', cls: 'bg-(--color-accent-amber) text-black' }
}
</script>

<template>
  <div class="min-h-screen bg-(--color-bg-base)">
    <AppPageHeader :icon="Store" title="Marketplace">
      <template #subtitle>
        <span>Itens à venda ou para troca da comunidade</span>
      </template>
    </AppPageHeader>

    <div class="px-4 py-6 md:px-8">
      <div class="mx-auto max-w-5xl">
        <!-- Filtros -->
        <div class="mb-5 flex flex-wrap items-center gap-2">
          <div class="flex gap-1 rounded-xl bg-(--color-bg-surface) p-1 border border-(--color-bg-elevated)/50">
            <button
              v-for="t in [
                { key: 'all',   label: 'Todos' },
                { key: 'sale',  label: 'Venda' },
                { key: 'trade', label: 'Troca' },
                { key: 'both',  label: 'Venda ou troca' },
              ]"
              :key="t.key"
              class="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
              :class="typeFilter === t.key
                ? 'bg-(--color-bg-elevated) text-(--color-accent-amber)'
                : 'text-(--color-text-muted) hover:text-(--color-text-primary)'"
              @click="typeFilter = (t.key as typeof typeFilter.value); refresh()"
            >
              {{ t.label }}
            </button>
          </div>

          <select
            v-model="collectionTypeFilter"
            @change="refresh()"
            class="px-3 py-1.5 rounded-lg bg-(--color-bg-surface) border border-(--color-bg-elevated) text-(--color-text-primary) text-[12px]"
          >
            <option v-for="t in COLLECTION_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>

          <div class="flex items-center gap-1 ml-auto">
            <input
              v-model="minPrice"
              type="number"
              placeholder="Min R$"
              class="w-24 px-2 py-1.5 rounded-lg bg-(--color-bg-surface) border border-(--color-bg-elevated) text-(--color-text-primary) text-[12px] focus:outline-none focus:border-(--color-accent-amber)/40"
            />
            <span class="text-(--color-text-muted) text-[12px]">—</span>
            <input
              v-model="maxPrice"
              type="number"
              placeholder="Max R$"
              class="w-24 px-2 py-1.5 rounded-lg bg-(--color-bg-surface) border border-(--color-bg-elevated) text-(--color-text-primary) text-[12px] focus:outline-none focus:border-(--color-accent-amber)/40"
            />
            <button
              class="ml-1 px-3 py-1.5 rounded-lg bg-(--color-accent-amber) hover:brightness-110 text-black text-[12px] font-semibold transition-all"
              @click="refresh()"
            >
              Aplicar
            </button>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div v-for="i in 8" :key="i" class="aspect-[2/3] animate-pulse rounded-xl bg-(--color-bg-surface)" />
        </div>

        <!-- Erro -->
        <div v-else-if="error" class="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {{ error }}
          <button class="ml-2 underline" @click="refresh">Tentar novamente</button>
        </div>

        <!-- Empty -->
        <div v-else-if="items.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
          <Store :size="36" class="text-(--color-text-muted)/50 mb-3" />
          <p class="text-sm text-(--color-text-muted)">Nenhum item disponível com os filtros atuais.</p>
        </div>

        <!-- Grid -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div
            v-for="item in items"
            :key="item.id"
            role="button"
            tabindex="0"
            class="group relative bg-(--color-bg-surface) rounded-xl overflow-hidden border border-(--color-bg-elevated) hover:border-(--color-accent-amber)/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/40"
            style="aspect-ratio: 2/3"
            @click="openDetails(item)"
            @keydown.enter.prevent="openDetails(item)"
            @keydown.space.prevent="openDetails(item)"
          >
            <div class="relative w-full h-full bg-(--color-bg-base)">
              <img v-if="item.coverUrl" :src="item.coverUrl" :alt="item.name" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center text-(--color-text-muted)">
                <ImageIcon :size="40" />
              </div>

              <!-- Badge -->
              <div
                class="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-black/40 shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                :class="badgeFor(item).cls"
              >
                <component :is="badgeFor(item).icon" :size="10" />
                <span class="text-[9px] font-bold uppercase tracking-wider">{{ badgeFor(item).label }}</span>
              </div>

              <!-- Bottom info -->
              <div class="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black via-black/85 to-transparent">
                <p class="text-[13px] font-bold text-white truncate drop-shadow">{{ item.name }}</p>
                <RouterLink :to="`/profile/${item.ownerId}`" class="mt-1 inline-flex items-center gap-1.5 text-[10px] text-white/80 hover:text-white" @click.stop>
                  <img v-if="item.ownerAvatarUrl" :src="item.ownerAvatarUrl" class="h-4 w-4 rounded-full object-cover" />
                  <span class="truncate">{{ item.ownerDisplayName }}</span>
                </RouterLink>
              </div>

              <!-- Hover overlay -->
              <div class="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3">
                <p class="text-[14px] font-bold text-white text-center">{{ item.name }}</p>
                <div class="flex flex-col gap-1.5 w-full max-w-[160px]">
                  <button
                    type="button"
                    class="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 text-[11px] font-semibold transition-all backdrop-blur-sm"
                    @click.stop="openDetails(item)"
                  >
                    <Info :size="12" />
                    Ver detalhes
                  </button>
                  <button
                    type="button"
                    class="inline-flex items-center justify-center gap-1.5 rounded-full bg-(--color-accent-amber) hover:brightness-110 text-black px-3 py-1.5 text-[11px] font-semibold transition-all"
                    @click.stop="openOffer(item)"
                  >
                    <HandCoins :size="12" />
                    Fazer oferta
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <OfferDialog
      v-if="selected"
      :open="offerOpen"
      :item="{
        id: selected.id,
        name: selected.name,
        coverUrl: selected.coverUrl,
        availability: selected.availability,
        askingPrice: selected.askingPrice,
      }"
      @close="offerOpen = false"
      @created="offerOpen = false; refresh()"
    />

    <ItemDetailModal
      v-if="detailsOpen && detailsItem"
      :item="detailsItem"
      :field-schema="detailsSchema"
      @close="detailsOpen = false"
    />
  </div>
</template>
