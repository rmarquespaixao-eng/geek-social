<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  Store, Tag, ArrowLeftRight, Image as ImageIcon, HandCoins, Info,
  Inbox, Send, Check, X, Hourglass, RotateCw, CheckCircle2, Clock,
  Pause, Play, Trash2,
} from 'lucide-vue-next'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import ItemDetailModal from '@/modules/collections/components/ItemDetailModal.vue'
import OfferDialog from '../components/OfferDialog.vue'
import RatingDialog from '../components/RatingDialog.vue'
import ListingFormModal from '../components/ListingFormModal.vue'
import ItemPickerModal from '../components/ItemPickerModal.vue'
import CounterProposalDialog from '../components/CounterProposalDialog.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { timeAgo } from '@/shared/utils/timeAgo'
import {
  listMarketplace, listMyListings, pauseListing, resumeListing, closeListing, hardDeleteListing,
  type MarketplaceListing, type ListingWithItem, type ListingAvailability, type MarketplaceQuery,
} from '../services/listingsService'
import {
  listReceived, listSent, acceptOffer, rejectOffer, cancelOffer, confirmOffer, getOfferHistory,
  type Offer, type OfferStatus, type OfferProposal,
} from '../services/offersService'
import { getMyRatingForOffer, listMyRatings, type ListingRating } from '../services/ratingsService'
import type { Item, CollectionSchemaEntry } from '@/modules/collections/types'

type MainTab = 'explore' | 'offers' | 'mine'
type OffersSubTab = 'received' | 'sent'

const auth = useAuthStore()

// ─── Tab state ───────────────────────────────────────────────────────────────
const mainTab = ref<MainTab>('explore')

// ─── Marketplace ─────────────────────────────────────────────────────────────
const listings = ref<MarketplaceListing[]>([])
const exploreLoading = ref(false)
const exploreError = ref<string | null>(null)
const typeFilter = ref<'all' | ListingAvailability>('all')
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

async function refreshMarketplace() {
  exploreLoading.value = true
  exploreError.value = null
  try {
    const q: MarketplaceQuery = { limit: 60 }
    if (typeFilter.value !== 'all') q.type = typeFilter.value
    if (collectionTypeFilter.value) q.collectionType = collectionTypeFilter.value
    if (minPrice.value) q.minPrice = Number(minPrice.value)
    if (maxPrice.value) q.maxPrice = Number(maxPrice.value)
    listings.value = await listMarketplace(q)
  } catch {
    exploreError.value = 'Erro ao carregar vitrine.'
  } finally {
    exploreLoading.value = false
  }
}

// Quick-access listing from selected card
const selectedListing = ref<MarketplaceListing | null>(null)

function listingAsItem(l: MarketplaceListing): Item {
  return {
    id: l.item.id,
    collectionId: l.item.collectionId,
    name: l.item.name,
    coverUrl: l.item.coverUrl ?? undefined,
    rating: l.item.rating ?? undefined,
    comment: l.item.comment ?? undefined,
    fields: l.item.fields,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }
}
function listingFieldSchema(l: MarketplaceListing): CollectionSchemaEntry[] {
  return l.item.fieldSchema ?? []
}
function listingForOffer(l: MarketplaceListing) {
  return { id: l.id, availability: l.availability, askingPrice: l.askingPrice }
}

function priceFormatted(p: string | null): string {
  if (!p) return ''
  const n = Number(p)
  return Number.isNaN(n) ? p : n.toFixed(2).replace('.', ',')
}

function badgeFor(l: MarketplaceListing): { icon: typeof Tag; label: string; cls: string } {
  if (l.availability === 'sale')
    return { icon: Tag, label: l.askingPrice ? `R$ ${priceFormatted(l.askingPrice)}` : 'À venda', cls: 'bg-(--color-accent-amber) text-black' }
  if (l.availability === 'trade')
    return { icon: ArrowLeftRight, label: 'Para troca', cls: 'bg-blue-500 text-white' }
  return { icon: Tag, label: l.askingPrice ? `R$ ${priceFormatted(l.askingPrice)} / troca` : 'Venda ou troca', cls: 'bg-(--color-accent-amber) text-black' }
}

// Detail modal (from explore tab)
const detailOpen = ref(false)
const offerDialogOpen = ref(false)

function openDetail(l: MarketplaceListing) {
  selectedListing.value = l
  detailOpen.value = true
  offerDialogOpen.value = false
}
function openOffer(l: MarketplaceListing) {
  selectedListing.value = l
  offerDialogOpen.value = true
}

// ─── Trades / Offers ─────────────────────────────────────────────────────────
const offersSubTab = ref<OffersSubTab>('received')
const statusFilter = ref<OfferStatus | 'all'>('all')
const received = ref<Offer[]>([])
const sent = ref<Offer[]>([])
const offersLoading = ref(false)
const offersError = ref<string | null>(null)
const acting = ref<string | null>(null)
const cancelConfirm = ref<Offer | null>(null)
const EXPIRE_DAYS = 7

const offersList = computed<Offer[]>(() => offersSubTab.value === 'received' ? received.value : sent.value)
const offersFiltered = computed(() =>
  statusFilter.value === 'all' ? offersList.value : offersList.value.filter(o => o.status === statusFilter.value),
)

async function refreshOffers() {
  offersLoading.value = true
  offersError.value = null
  try {
    if (offersSubTab.value === 'received') received.value = await listReceived()
    else sent.value = await listSent()
    refreshMyRatings()
  } catch {
    offersError.value = 'Erro ao carregar ofertas.'
  } finally {
    offersLoading.value = false
  }
}

async function doAccept(offer: Offer) {
  acting.value = offer.id
  try { await acceptOffer(offer.id); await refreshOffers() } finally { acting.value = null }
}
async function doReject(offer: Offer) {
  acting.value = offer.id
  try { await rejectOffer(offer.id); await refreshOffers() } finally { acting.value = null }
}
async function doCancel(offer: Offer) {
  acting.value = offer.id
  try { await cancelOffer(offer.id); cancelConfirm.value = null; await refreshOffers() } finally { acting.value = null }
}
const confirmError = ref<string | null>(null)
async function doConfirm(offer: Offer) {
  acting.value = offer.id
  confirmError.value = null
  try {
    await confirmOffer(offer.id)
    await refreshOffers()
  } catch (e: any) {
    const code = e?.response?.data?.error
    confirmError.value = code === 'OFFERER_HAS_NO_COLLECTION'
        ? 'O comprador/recebedor não tem nenhuma coleção. Peça pra criar uma coleção antes de concluir.'
      : code === 'OWNER_HAS_NO_COLLECTION'
        ? 'O dono atual não tem coleção destino para o item recebido. Peça pra criar uma coleção antes de concluir.'
      : code === 'ITEM_GONE' || code === 'OFFERED_ITEM_GONE'
        ? 'Algum item da transação não está mais disponível.'
      : code === 'ALREADY_CONFIRMED'
        ? 'Você já confirmou. Aguardando a outra parte.'
      : code === 'INVALID_TRANSITION'
        ? 'Esta oferta não está mais aceita — talvez tenha sido cancelada ou já concluída.'
      : 'Erro ao confirmar transação.'
  } finally {
    acting.value = null
  }
}

// ─── Contra-propostas / histórico ─────────────────────────────────────────
const counterTarget = ref<Offer | null>(null)
const counterOpen = ref(false)
function openCounter(offer: Offer) {
  counterTarget.value = offer
  counterOpen.value = true
}

const expandedHistoryId = ref<string | null>(null)
const historyByOfferId = ref<Record<string, OfferProposal[]>>({})

async function toggleHistory(offerId: string) {
  if (expandedHistoryId.value === offerId) {
    expandedHistoryId.value = null
    return
  }
  expandedHistoryId.value = offerId
  if (!historyByOfferId.value[offerId]) {
    try { historyByOfferId.value[offerId] = await getOfferHistory(offerId) }
    catch { historyByOfferId.value[offerId] = [] }
  }
}

/** É meu turno? Tenho a "bola" — posso aceitar/recusar/contra-propor. */
function isMyTurn(offer: Offer): boolean {
  if (offer.status !== 'pending') return false
  const me = auth.user?.id
  if (!me) return false
  // Sem histórico de proposta carregado: pendente sem latestProposal = primeira oferta sem migração.
  // Caso seja pendente, quem recebeu (owner) tem o turno; quem ofereceu (offerer) aguarda.
  if (!offer.latestProposal) return offer.ownerId === me
  // Última proposta pendente: turno do não-proposer
  if (offer.latestProposal.status === 'pending') return offer.latestProposal.proposerId !== me
  // Última proposta rejeitada: ambos podem propor de novo, mas ninguém tem "aceitar"
  return true
}

/** Pode aceitar a proposta atual? Apenas se há proposta pendente E não fui eu que propus. */
function canAccept(offer: Offer): boolean {
  if (offer.status !== 'pending') return false
  const me = auth.user?.id
  if (!me) return false
  if (!offer.latestProposal) return offer.ownerId === me
  return offer.latestProposal.status === 'pending' && offer.latestProposal.proposerId !== me
}

/** Pode rejeitar a proposta atual? Mesma regra que aceitar. */
function canReject(offer: Offer): boolean {
  return canAccept(offer)
}

/** Pode fazer (contra-)proposta? Pendente E (sem proposta pendente OU não fui eu o último proposer). */
function canPropose(offer: Offer): boolean {
  if (offer.status !== 'pending') return false
  const me = auth.user?.id
  if (!me) return false
  if (!offer.latestProposal) return offer.ownerId === me
  if (offer.latestProposal.status === 'rejected') return true
  // Latest pending: só pode contra-propor se não fui eu o último proposer
  return offer.latestProposal.proposerId !== me
}

function priceFormattedNullable(p: string | null): string {
  if (!p) return '—'
  const n = Number(p)
  return Number.isNaN(n) ? p : n.toFixed(2).replace('.', ',')
}

function userLabel(uid: string, offer: Offer): string {
  if (uid === offer.owner.id) return offer.owner.displayName
  if (uid === offer.offerer.id) return offer.offerer.displayName
  return uid.slice(0, 8)
}

function proposalStatusLabel(s: OfferProposal['status']): { label: string; cls: string } {
  if (s === 'pending')    return { label: 'Aguardando', cls: 'text-(--color-accent-amber)' }
  if (s === 'accepted')   return { label: 'Aceita',     cls: 'text-green-300' }
  if (s === 'rejected')   return { label: 'Rejeitada',  cls: 'text-red-300' }
  return { label: 'Substituída', cls: 'text-(--color-text-muted)' }
}

function daysUntilExpire(offer: Offer): number | null {
  if (offer.status !== 'accepted') return null
  const expiresAt = new Date(offer.updatedAt).getTime() + EXPIRE_DAYS * 24 * 60 * 60 * 1000
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
}

function alreadyConfirmedByMe(offer: Offer): boolean {
  const me = auth.user?.id
  if (offer.ownerId === me) return Boolean(offer.ownerConfirmedAt)
  if (offer.offererId === me) return Boolean(offer.offererConfirmedAt)
  return false
}

function waitingForOtherSide(offer: Offer): boolean {
  return offer.status === 'accepted' && alreadyConfirmedByMe(offer)
    && (!offer.offererConfirmedAt || !offer.ownerConfirmedAt)
}

function statusInfo(s: OfferStatus): { label: string; cls: string; icon: typeof X } {
  switch (s) {
    case 'pending':   return { label: 'Pendente',              cls: 'bg-(--color-accent-amber)/15 text-(--color-accent-amber) border-(--color-accent-amber)/30', icon: Hourglass as typeof X }
    case 'accepted':  return { label: 'Aguardando confirmação', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30', icon: RotateCw as typeof X }
    case 'rejected':  return { label: 'Rejeitada',             cls: 'bg-red-500/15 text-red-300 border-red-500/30', icon: X }
    case 'cancelled': return { label: 'Cancelada',             cls: 'bg-(--color-bg-elevated) text-(--color-text-muted) border-(--color-bg-card)', icon: X }
    case 'completed': return { label: 'Concluída',             cls: 'bg-green-500/15 text-green-300 border-green-500/30', icon: CheckCircle2 as typeof X }
  }
}

// Rating dialog (from completed offers)
const ratingOffer = ref<Offer | null>(null)
const ratingExisting = ref<ListingRating | null>(null)
const ratingOpen = ref(false)
const myRatingsByOfferId = ref<Record<string, ListingRating>>({})

async function refreshMyRatings() {
  try {
    const all = await listMyRatings()
    const map: Record<string, ListingRating> = {}
    for (const r of all) map[r.offerId] = r
    myRatingsByOfferId.value = map
  } catch {
    myRatingsByOfferId.value = {}
  }
}

async function openRating(offer: Offer) {
  ratingOffer.value = offer
  ratingExisting.value = myRatingsByOfferId.value[offer.id]
    ?? await getMyRatingForOffer(offer.id).catch(() => null)
  ratingOpen.value = true
}

function rateeForOffer(offer: Offer): string {
  const me = auth.user?.id
  if (offer.ownerId === me) return offer.offerer.displayName
  return offer.owner.displayName
}

const STATUS_FILTERS: Array<{ key: OfferStatus | 'all'; label: string }> = [
  { key: 'all',       label: 'Todas' },
  { key: 'pending',   label: 'Pendentes' },
  { key: 'accepted',  label: 'Aguardando' },
  { key: 'completed', label: 'Concluídas' },
  { key: 'rejected',  label: 'Rejeitadas' },
  { key: 'cancelled', label: 'Canceladas' },
]

// ─── Meus Anúncios ────────────────────────────────────────────────────────────
const myListings = ref<ListingWithItem[]>([])
const mineLoading = ref(false)
const mineError = ref<string | null>(null)
const mineActing = ref<string | null>(null)

async function refreshMine() {
  mineLoading.value = true
  mineError.value = null
  try {
    myListings.value = await listMyListings()
  } catch {
    mineError.value = 'Erro ao carregar seus anúncios.'
  } finally {
    mineLoading.value = false
  }
}

async function doPause(l: ListingWithItem) {
  mineActing.value = l.id
  try { await pauseListing(l.id); await refreshMine() } finally { mineActing.value = null }
}
async function doResume(l: ListingWithItem) {
  mineActing.value = l.id
  try { await resumeListing(l.id); await refreshMine() } finally { mineActing.value = null }
}

const closeTarget = ref<ListingWithItem | null>(null)
async function doClose(l: ListingWithItem) {
  mineActing.value = l.id
  try { await closeListing(l.id); closeTarget.value = null; await refreshMine() } finally { mineActing.value = null }
}

const deleteTarget = ref<ListingWithItem | null>(null)
async function doHardDelete(l: ListingWithItem) {
  mineActing.value = l.id
  try { await hardDeleteListing(l.id); deleteTarget.value = null; await refreshMine() } finally { mineActing.value = null }
}

// Listing form modal
const listingFormOpen = ref(false)
const listingFormTarget = ref<ListingWithItem | null>(null)
const listingFormItemId = ref<string | null>(null)
const listingFormItemName = ref<string>('')

function openEditListing(existing: ListingWithItem) {
  listingFormTarget.value = existing
  listingFormItemId.value = existing.itemId
  listingFormItemName.value = existing.item.name
  listingFormOpen.value = true
}

// Item picker (criar novo anúncio direto da Vitrine)
const itemPickerOpen = ref(false)
const activeItemIds = computed(() =>
  myListings.value.filter(l => l.status === 'active').map(l => l.itemId),
)

function onItemPicked(picked: { id: string; name: string }) {
  itemPickerOpen.value = false
  listingFormTarget.value = null
  listingFormItemId.value = picked.id
  listingFormItemName.value = picked.name
  listingFormOpen.value = true
}

function closeListingForm() {
  listingFormOpen.value = false
  listingFormTarget.value = null
  listingFormItemId.value = null
  listingFormItemName.value = ''
}

function statusBadge(l: ListingWithItem): { cls: string; label: string } {
  if (l.status === 'active')  return { cls: 'bg-green-500/15 text-green-300 border-green-500/30', label: 'Ativo' }
  if (l.status === 'paused')  return { cls: 'bg-(--color-accent-amber)/15 text-(--color-accent-amber) border-(--color-accent-amber)/30', label: 'Pausado' }
  return { cls: 'bg-(--color-bg-elevated) text-(--color-text-muted) border-(--color-bg-card)', label: 'Encerrado' }
}

function availLabel(a: ListingWithItem['availability']): string {
  if (a === 'sale')  return 'Venda'
  if (a === 'trade') return 'Troca'
  return 'Venda + Troca'
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  refreshMarketplace()
})

watch(mainTab, (tab) => {
  if (tab === 'explore' && listings.value.length === 0) refreshMarketplace()
  if (tab === 'offers') refreshOffers()
  if (tab === 'mine') refreshMine()
})

watch(offersSubTab, () => refreshOffers())
</script>

<template>
  <div class="min-h-screen bg-(--color-bg-base)">
    <AppPageHeader :icon="Store" title="Vitrine">
      <template #subtitle>
        <span>Marketplace · Trocas · Meus anúncios</span>
      </template>
    </AppPageHeader>

    <!-- Main tab bar -->
    <div class="sticky top-16 z-10 bg-(--color-bg-base)/90 backdrop-blur-sm border-b border-(--color-bg-elevated)/60">
      <div class="mx-auto max-w-5xl px-4 md:px-8">
        <div class="flex gap-0">
          <button
            v-for="t in [
              { key: 'explore', label: 'Explorar', icon: Store },
              { key: 'offers',  label: 'Ofertas',  icon: ArrowLeftRight },
              { key: 'mine',    label: 'Meus anúncios', icon: Tag },
            ]"
            :key="t.key"
            class="inline-flex items-center gap-1.5 px-4 py-3 text-[13px] font-semibold transition-all border-b-2"
            :class="mainTab === t.key
              ? 'border-(--color-accent-amber) text-(--color-accent-amber)'
              : 'border-transparent text-(--color-text-muted) hover:text-(--color-text-primary)'"
            @click="mainTab = (t.key as MainTab)"
          >
            <component :is="t.icon" :size="14" />
            {{ t.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="px-4 py-6 md:px-8">
      <div class="mx-auto max-w-5xl">

        <!-- ═══════════════════ EXPLORE TAB ═══════════════════ -->
        <template v-if="mainTab === 'explore'">
          <!-- Filters -->
          <div class="mb-5 flex flex-wrap items-center gap-2">
            <div class="flex gap-1 rounded-xl bg-(--color-bg-surface) p-1 border border-(--color-bg-elevated)/50">
              <button
                v-for="t in [
                  { key: 'all',   label: 'Todos' },
                  { key: 'sale',  label: 'Venda' },
                  { key: 'trade', label: 'Troca' },
                  { key: 'both',  label: 'Venda + Troca' },
                ]"
                :key="t.key"
                class="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
                :class="typeFilter === t.key
                  ? 'bg-(--color-bg-elevated) text-(--color-accent-amber)'
                  : 'text-(--color-text-muted) hover:text-(--color-text-primary)'"
                @click="typeFilter = (t.key as typeof typeFilter); refreshMarketplace()"
              >
                {{ t.label }}
              </button>
            </div>

            <select
              v-model="collectionTypeFilter"
              class="px-3 py-1.5 rounded-lg bg-(--color-bg-surface) border border-(--color-bg-elevated) text-(--color-text-primary) text-[12px]"
              @change="refreshMarketplace()"
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
                @click="refreshMarketplace()"
              >
                Aplicar
              </button>
            </div>
          </div>

          <div v-if="exploreLoading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div v-for="i in 8" :key="i" class="aspect-[2/3] animate-pulse rounded-xl bg-(--color-bg-surface)" />
          </div>

          <div v-else-if="exploreError" class="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {{ exploreError }}
            <button class="ml-2 underline" @click="refreshMarketplace">Tentar novamente</button>
          </div>

          <div v-else-if="listings.length === 0" class="flex flex-col items-center justify-center py-16 text-center">
            <Store :size="36" class="text-(--color-text-muted)/50 mb-3" />
            <p class="text-sm text-(--color-text-muted)">Nenhum item disponível com os filtros atuais.</p>
          </div>

          <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div
              v-for="l in listings"
              :key="l.id"
              role="button"
              tabindex="0"
              class="group relative bg-(--color-bg-surface) rounded-xl overflow-hidden border border-(--color-bg-elevated) hover:border-(--color-accent-amber)/50 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/40"
              style="aspect-ratio: 2/3"
              @click="openDetail(l)"
              @keydown.enter.prevent="openDetail(l)"
              @keydown.space.prevent="openDetail(l)"
            >
              <div class="relative w-full h-full bg-(--color-bg-base)">
                <img v-if="l.item.coverUrl" :src="l.item.coverUrl" :alt="l.item.name" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-(--color-text-muted)">
                  <ImageIcon :size="40" />
                </div>

                <!-- Badge -->
                <div
                  class="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-black/40 shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
                  :class="badgeFor(l).cls"
                >
                  <component :is="badgeFor(l).icon" :size="10" />
                  <span class="text-[9px] font-bold uppercase tracking-wider">{{ badgeFor(l).label }}</span>
                </div>

                <!-- Bottom info -->
                <div class="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black via-black/85 to-transparent">
                  <p class="text-[13px] font-bold text-white truncate drop-shadow">{{ l.item.name }}</p>
                  <RouterLink
                    :to="`/profile/${l.ownerId}`"
                    class="mt-1 inline-flex items-center gap-1.5 text-[10px] text-white/80 hover:text-white"
                    @click.stop
                  >
                    <img v-if="l.owner.avatarUrl" :src="l.owner.avatarUrl" class="h-4 w-4 rounded-full object-cover" />
                    <span class="truncate">{{ l.owner.displayName }}</span>
                  </RouterLink>
                </div>

                <!-- Hover overlay -->
                <div class="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3">
                  <p class="text-[14px] font-bold text-white text-center">{{ l.item.name }}</p>
                  <div class="flex flex-col gap-1.5 w-full max-w-[160px]">
                    <button
                      type="button"
                      class="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 text-[11px] font-semibold transition-all backdrop-blur-sm"
                      @click.stop="openDetail(l)"
                    >
                      <Info :size="12" />
                      Ver detalhes
                    </button>
                    <button
                      v-if="l.ownerId !== auth.user?.id"
                      type="button"
                      class="inline-flex items-center justify-center gap-1.5 rounded-full bg-(--color-accent-amber) hover:brightness-110 text-black px-3 py-1.5 text-[11px] font-semibold transition-all"
                      @click.stop="openOffer(l)"
                    >
                      <HandCoins :size="12" />
                      Fazer oferta
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ═══════════════════ OFFERS TAB ═══════════════════ -->
        <template v-else-if="mainTab === 'offers'">
          <!-- Sub-tab bar -->
          <div class="mb-4 flex gap-1 rounded-xl bg-(--color-bg-surface) p-1 border border-(--color-bg-elevated)/50">
            <button
              v-for="t in [
                { key: 'received', label: 'Recebidas', icon: Inbox },
                { key: 'sent',     label: 'Enviadas',  icon: Send },
              ]"
              :key="t.key"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-semibold transition-all"
              :class="offersSubTab === t.key
                ? 'bg-(--color-bg-elevated) text-(--color-accent-amber)'
                : 'text-(--color-text-muted) hover:text-(--color-text-primary)'"
              @click="offersSubTab = (t.key as OffersSubTab)"
            >
              <component :is="t.icon" :size="15" />
              {{ t.label }}
            </button>
          </div>

          <!-- Status chips -->
          <div class="mb-5 flex flex-wrap gap-1.5">
            <button
              v-for="f in STATUS_FILTERS"
              :key="f.key"
              class="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors"
              :class="statusFilter === f.key
                ? 'bg-(--color-accent-amber)/15 text-(--color-accent-amber) border border-(--color-accent-amber)/40'
                : 'bg-(--color-bg-surface) text-(--color-text-muted) border border-(--color-bg-elevated) hover:text-(--color-text-primary)'"
              @click="statusFilter = f.key"
            >
              {{ f.label }}
            </button>
          </div>

          <div v-if="offersLoading" class="space-y-2">
            <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-xl bg-(--color-bg-surface)" />
          </div>

          <div v-else-if="offersError" class="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {{ offersError }}
            <button class="ml-2 underline" @click="refreshOffers">Tentar novamente</button>
          </div>

          <div v-else-if="offersFiltered.length === 0" class="flex flex-col items-center justify-center py-16 text-center text-(--color-text-muted)">
            <component :is="offersSubTab === 'received' ? Inbox : Send" :size="36" class="mb-3 opacity-40" />
            <p class="text-sm">
              {{ offersSubTab === 'received' ? 'Nenhuma oferta recebida.' : 'Você ainda não enviou ofertas.' }}
            </p>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="offer in offersFiltered"
              :key="offer.id"
              class="rounded-xl bg-(--color-bg-surface) border border-(--color-bg-elevated) p-4"
            >
              <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden bg-(--color-bg-elevated) flex items-center justify-center">
                  <img v-if="offer.item.coverUrl" :src="offer.item.coverUrl" :alt="offer.item.name" class="w-full h-full object-cover" />
                  <ImageIcon v-else :size="20" class="text-(--color-text-muted)" />
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 flex-wrap">
                    <div class="min-w-0">
                      <p class="text-[14px] font-semibold text-(--color-text-primary) truncate">{{ offer.item.name }}</p>
                      <p class="text-[11px] text-(--color-text-muted)">
                        <template v-if="offersSubTab === 'received'">
                          Oferta de <RouterLink :to="`/profile/${offer.offerer.id}`" class="text-(--color-accent-amber) hover:underline">{{ offer.offerer.displayName }}</RouterLink>
                        </template>
                        <template v-else>
                          Para <RouterLink :to="`/profile/${offer.owner.id}`" class="text-(--color-accent-amber) hover:underline">{{ offer.owner.displayName }}</RouterLink>
                        </template>
                        · {{ timeAgo(offer.createdAt) }}
                      </p>
                    </div>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border" :class="statusInfo(offer.status).cls">
                      <component :is="statusInfo(offer.status).icon" :size="11" />
                      {{ statusInfo(offer.status).label }}
                    </span>
                  </div>

                  <div class="mt-2 flex items-center gap-3 text-[13px] text-(--color-text-secondary)">
                    <template v-if="offer.type === 'buy'">
                      <Tag :size="14" class="text-(--color-accent-amber)" />
                      <span>Comprar por <span class="text-(--color-text-primary) font-semibold">R$ {{ priceFormatted(offer.offeredPrice) }}</span></span>
                    </template>
                    <template v-else>
                      <ArrowLeftRight :size="14" class="text-(--color-accent-amber)" />
                      <span>
                        Trocar pelo
                        <template v-if="offer.offeredItem">
                          <span class="text-(--color-text-primary) font-semibold">{{ offer.offeredItem.name }}</span>
                        </template>
                        <template v-else>
                          <span class="italic text-(--color-text-muted)">item indisponível</span>
                        </template>
                      </span>
                    </template>
                  </div>

                  <p v-if="offer.message" class="mt-2 text-[12px] text-(--color-text-muted) italic">"{{ offer.message }}"</p>

                  <p v-if="waitingForOtherSide(offer)" class="mt-2 text-[11px] text-blue-300">
                    Você já confirmou. Aguardando a outra parte para concluir a transferência.
                  </p>

                  <p
                    v-if="offer.status === 'accepted' && daysUntilExpire(offer) !== null"
                    class="mt-2 inline-flex items-center gap-1 text-[11px] text-(--color-text-muted)"
                  >
                    <Clock :size="11" />
                    <template v-if="daysUntilExpire(offer)! > 1">Expira em {{ daysUntilExpire(offer) }} dias</template>
                    <template v-else-if="daysUntilExpire(offer) === 1">Expira em 1 dia</template>
                    <template v-else>Vai expirar em breve</template>
                  </p>

                  <div class="mt-3 flex flex-wrap gap-2">
                    <!-- Aviso quando estou aguardando o outro lado -->
                    <p
                      v-if="offer.status === 'pending' && !isMyTurn(offer)"
                      class="w-full text-[11px] text-(--color-text-muted) italic"
                    >
                      Aguardando resposta do outro lado para sua proposta…
                    </p>

                    <!-- Aceitar — só se a proposta atual NÃO foi minha -->
                    <button
                      v-if="canAccept(offer)"
                      :disabled="acting === offer.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-accent-amber) hover:brightness-110 text-black text-[12px] font-semibold px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="doAccept(offer)"
                    >
                      <Check :size="13" />
                      Aceitar
                    </button>

                    <!-- Recusar proposta — só se a proposta atual NÃO foi minha -->
                    <button
                      v-if="canReject(offer)"
                      :disabled="acting === offer.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-red-300 text-[12px] font-semibold px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="doReject(offer)"
                    >
                      <X :size="13" />
                      Recusar proposta
                    </button>

                    <!-- Contra-propor — só se a última proposta NÃO foi minha (ou foi rejeitada) -->
                    <button
                      v-if="canPropose(offer)"
                      :disabled="acting === offer.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-(--color-accent-amber) text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="openCounter(offer)"
                    >
                      Contra-propor
                    </button>

                    <!-- Cancelar oferta — qualquer parte enquanto estiver pendente -->
                    <button
                      v-if="offer.status === 'pending'"
                      :disabled="acting === offer.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-(--color-text-secondary) hover:text-(--color-text-primary) text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="doCancel(offer)"
                    >
                      <X :size="13" />
                      Cancelar oferta
                    </button>

                    <!-- Histórico -->
                    <button
                      v-if="offer.status !== 'cancelled'"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-(--color-text-muted) hover:text-(--color-text-primary) text-[12px] font-medium px-3 py-1.5 transition-colors"
                      @click="toggleHistory(offer.id)"
                    >
                      {{ expandedHistoryId === offer.id ? 'Fechar' : 'Ver' }} histórico
                    </button>

                    <!-- Aceita: confirmar -->
                    <button
                      v-if="offer.status === 'accepted' && !alreadyConfirmedByMe(offer)"
                      :disabled="acting === offer.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[12px] font-semibold px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="doConfirm(offer)"
                    >
                      <CheckCircle2 :size="13" />
                      Confirmar transação
                    </button>
                    <!-- Erro de confirmação (ex: faltam coleções) -->
                    <p
                      v-if="confirmError && acting !== offer.id && offer.status === 'accepted'"
                      class="w-full text-[11px] text-(--color-danger)"
                    >
                      {{ confirmError }}
                    </p>

                    <!-- Aceita: cancelar -->
                    <button
                      v-if="offer.status === 'accepted'"
                      :disabled="acting === offer.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-red-300 text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="cancelConfirm = offer"
                    >
                      <X :size="13" />
                      Cancelar
                    </button>

                    <!-- Concluída: avaliar (ou mostrar nota dada) -->
                    <template v-if="offer.status === 'completed'">
                      <span
                        v-if="myRatingsByOfferId[offer.id]"
                        class="inline-flex items-center gap-1 rounded-lg bg-(--color-bg-elevated) text-(--color-accent-amber) text-[12px] font-semibold px-3 py-1.5"
                        :title="`Sua nota: ${myRatingsByOfferId[offer.id].score}/5`"
                      >
                        <span v-for="n in 5" :key="n">{{ myRatingsByOfferId[offer.id].score >= n ? '★' : '☆' }}</span>
                      </span>
                      <button
                        v-else
                        class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-(--color-accent-amber) text-[12px] font-medium px-3 py-1.5 transition-colors"
                        @click="openRating(offer)"
                      >
                        ★ Avaliar
                      </button>
                    </template>
                  </div>

                  <!-- Timeline / histórico de propostas -->
                  <div v-if="expandedHistoryId === offer.id" class="mt-3 pl-3 border-l-2 border-(--color-bg-elevated)">
                    <p class="text-[10px] uppercase tracking-wider font-bold text-(--color-text-muted) mb-2">Histórico</p>
                    <div v-if="!historyByOfferId[offer.id]" class="text-[11px] text-(--color-text-muted) italic">Carregando…</div>
                    <ul v-else class="space-y-2">
                      <li v-for="p in historyByOfferId[offer.id]" :key="p.id" class="text-[11px]">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-(--color-text-primary) font-semibold">{{ userLabel(p.proposerId, offer) }}</span>
                          <span :class="proposalStatusLabel(p.status).cls" class="font-medium">· {{ proposalStatusLabel(p.status).label }}</span>
                          <span class="text-(--color-text-muted)">· {{ timeAgo(p.createdAt) }}</span>
                        </div>
                        <div class="mt-0.5 text-(--color-text-secondary)">
                          <template v-if="offer.type === 'buy'">
                            <Tag :size="11" class="inline mr-1" />
                            R$ {{ priceFormattedNullable(p.offeredPrice) }}
                          </template>
                          <template v-else>
                            <ArrowLeftRight :size="11" class="inline mr-1" />
                            <span v-if="p.offeredItemId === offer.offeredItem?.id">{{ offer.offeredItem?.name ?? 'item' }}</span>
                            <span v-else class="italic text-(--color-text-muted)">item alterado</span>
                          </template>
                        </div>
                        <p v-if="p.message" class="mt-0.5 text-(--color-text-muted) italic">"{{ p.message }}"</p>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ═══════════════════ MINE TAB ═══════════════════ -->
        <template v-else>
          <div class="mb-4 flex items-center justify-between">
            <p class="text-sm text-(--color-text-muted)">
              {{ myListings.length }} anúncio{{ myListings.length !== 1 ? 's' : '' }}
            </p>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-accent-amber) hover:brightness-110 text-black text-[12px] font-semibold transition-all"
              @click="itemPickerOpen = true"
            >
              <Tag :size="13" />
              Anunciar item
            </button>
          </div>

          <div v-if="mineLoading" class="space-y-2">
            <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-xl bg-(--color-bg-surface)" />
          </div>

          <div v-else-if="mineError" class="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {{ mineError }}
            <button class="ml-2 underline" @click="refreshMine">Tentar novamente</button>
          </div>

          <div v-else-if="myListings.length === 0" class="flex flex-col items-center justify-center py-16 text-center text-(--color-text-muted)">
            <Store :size="36" class="mb-3 opacity-40" />
            <p class="text-sm mb-4">Você ainda não tem itens na vitrine.</p>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-(--color-accent-amber) hover:brightness-110 text-black text-sm font-semibold transition-all"
              @click="itemPickerOpen = true"
            >
              <Tag :size="14" />
              Anunciar primeiro item
            </button>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="l in myListings"
              :key="l.id"
              class="rounded-xl bg-(--color-bg-surface) border border-(--color-bg-elevated) p-4"
            >
              <div class="flex items-start gap-3">
                <div class="flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden bg-(--color-bg-elevated) flex items-center justify-center">
                  <img v-if="l.item.coverUrl" :src="l.item.coverUrl" :alt="l.item.name" class="w-full h-full object-cover" />
                  <ImageIcon v-else :size="20" class="text-(--color-text-muted)" />
                </div>

                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 flex-wrap">
                    <div class="min-w-0">
                      <p class="text-[14px] font-semibold text-(--color-text-primary) truncate">{{ l.item.name }}</p>
                      <p class="text-[11px] text-(--color-text-muted)">
                        {{ availLabel(l.availability) }}
                        <template v-if="l.askingPrice"> · R$ {{ priceFormatted(l.askingPrice) }}</template>
                        · {{ timeAgo(l.createdAt) }}
                      </p>
                    </div>
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border" :class="statusBadge(l).cls">
                      {{ statusBadge(l).label }}
                    </span>
                  </div>

                  <p v-if="l.pendingOffersCount > 0" class="mt-1.5 text-[11px] text-(--color-accent-amber)">
                    {{ l.pendingOffersCount }} oferta{{ l.pendingOffersCount !== 1 ? 's' : '' }} pendente{{ l.pendingOffersCount !== 1 ? 's' : '' }}
                  </p>

                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      v-if="l.status !== 'closed'"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-(--color-text-secondary) hover:text-(--color-text-primary) text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                      :disabled="mineActing === l.id"
                      @click="openEditListing(l)"
                    >
                      Editar
                    </button>

                    <button
                      v-if="l.status === 'active'"
                      :disabled="mineActing === l.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-(--color-text-secondary) hover:text-(--color-text-primary) text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="doPause(l)"
                    >
                      <Pause :size="12" />
                      Pausar
                    </button>
                    <button
                      v-else-if="l.status === 'paused'"
                      :disabled="mineActing === l.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-accent-amber)/10 hover:bg-(--color-accent-amber)/20 text-(--color-accent-amber) text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="doResume(l)"
                    >
                      <Play :size="12" />
                      Reativar
                    </button>

                    <button
                      v-if="l.status !== 'closed'"
                      :disabled="mineActing === l.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-red-500/10 text-(--color-text-muted) hover:text-red-300 text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="closeTarget = l"
                    >
                      <Trash2 :size="12" />
                      Encerrar
                    </button>
                    <button
                      v-else
                      :disabled="mineActing === l.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="deleteTarget = l"
                    >
                      <Trash2 :size="12" />
                      Excluir permanentemente
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

      </div>
    </div>

    <!-- ─── Dialogs ─────────────────────────────────────────────────────────── -->

    <!-- Item detail modal (from explore) -->
    <ItemDetailModal
      v-if="detailOpen && selectedListing"
      :item="listingAsItem(selectedListing)"
      :field-schema="listingFieldSchema(selectedListing)"
      :listing="selectedListing.ownerId !== auth.user?.id ? listingForOffer(selectedListing) : null"
      @close="detailOpen = false"
    />

    <!-- Offer dialog (from explore hover button) -->
    <OfferDialog
      v-if="offerDialogOpen && selectedListing"
      :open="offerDialogOpen"
      :listing="listingForOffer(selectedListing)"
      :item-name="selectedListing.item.name"
      @close="offerDialogOpen = false"
      @created="offerDialogOpen = false; refreshMarketplace()"
    />

    <!-- Cancel accepted offer confirmation -->
    <AppConfirmDialog
      :open="!!cancelConfirm"
      title="Cancelar transação aceita?"
      description="Vocês deixarão de progredir nesta troca/venda. Notificaremos a outra parte."
      confirm-label="Cancelar transação"
      :loading="acting !== null"
      @cancel="cancelConfirm = null"
      @confirm="cancelConfirm && doCancel(cancelConfirm)"
    />

    <!-- Close listing confirmation -->
    <AppConfirmDialog
      :open="!!closeTarget"
      title="Encerrar anúncio?"
      description="O item sairá da vitrine. Ofertas pendentes serão canceladas automaticamente."
      confirm-label="Encerrar"
      :loading="mineActing !== null"
      @cancel="closeTarget = null"
      @confirm="closeTarget && doClose(closeTarget)"
    />

    <!-- Hard delete listing confirmation -->
    <AppConfirmDialog
      :open="!!deleteTarget"
      title="Excluir anúncio permanentemente?"
      description="O anúncio será removido do histórico. Esta ação não pode ser desfeita."
      confirm-label="Excluir"
      :loading="mineActing !== null"
      @cancel="deleteTarget = null"
      @confirm="deleteTarget && doHardDelete(deleteTarget)"
    />

    <!-- Counter-proposal dialog -->
    <CounterProposalDialog
      v-if="counterTarget"
      :open="counterOpen"
      :offer="counterTarget"
      @close="counterOpen = false; counterTarget = null"
      @proposed="counterOpen = false; counterTarget = null; refreshOffers()"
    />

    <!-- Rating dialog -->
    <RatingDialog
      v-if="ratingOffer"
      :open="ratingOpen"
      :offer-id="ratingOffer.id"
      :ratee-display-name="rateeForOffer(ratingOffer)"
      :existing-rating="ratingExisting"
      @close="ratingOpen = false; ratingOffer = null"
      @rated="refreshMyRatings(); refreshOffers()"
    />

    <!-- Item picker (criar novo anúncio) -->
    <ItemPickerModal
      :open="itemPickerOpen"
      :exclude-item-ids="activeItemIds"
      @close="itemPickerOpen = false"
      @pick="onItemPicked"
    />

    <!-- Listing form modal (create/edit) -->
    <ListingFormModal
      v-if="listingFormOpen && listingFormItemId"
      :open="listingFormOpen"
      :item-id="listingFormItemId"
      :item-name="listingFormItemName"
      :existing-listing="listingFormTarget"
      @close="closeListingForm"
      @created="closeListingForm(); refreshMine()"
      @updated="closeListingForm(); refreshMine()"
    />
  </div>
</template>
