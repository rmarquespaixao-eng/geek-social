<!-- src/modules/offers/views/TradesView.vue
  Hub de ofertas: aba Recebidas (sou owner) / Enviadas (sou offerer).
  Ações: aceitar/rejeitar (pending recebida), cancelar (pending enviada), confirmar (accepted).
-->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Inbox, Send, Tag, ArrowLeftRight, Check, X, Hourglass, RotateCw, CheckCircle2, Image as ImageIcon, Clock } from 'lucide-vue-next'
import AppPageHeader from '@/shared/ui/AppPageHeader.vue'
import AppConfirmDialog from '@/shared/ui/AppConfirmDialog.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { timeAgo } from '@/shared/utils/timeAgo'
import {
  listReceived, listSent, acceptOffer, rejectOffer, cancelOffer, confirmOffer,
  type Offer, type OfferStatus,
} from '../services/offersService'

type Tab = 'received' | 'sent'

const auth = useAuthStore()

const tab = ref<Tab>('received')
const statusFilter = ref<OfferStatus | 'all'>('all')

const received = ref<Offer[]>([])
const sent = ref<Offer[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const acting = ref<string | null>(null) // offer id sob ação
const cancelConfirm = ref<Offer | null>(null)
const EXPIRE_DAYS = 7

const list = computed<Offer[]>(() => tab.value === 'received' ? received.value : sent.value)
const filtered = computed(() => statusFilter.value === 'all' ? list.value : list.value.filter(o => o.status === statusFilter.value))

async function refresh() {
  loading.value = true
  error.value = null
  try {
    if (tab.value === 'received') received.value = await listReceived()
    else                          sent.value = await listSent()
  } catch (e: any) {
    error.value = 'Erro ao carregar ofertas.'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

async function doAccept(offer: Offer) {
  acting.value = offer.id
  try { await acceptOffer(offer.id); await refresh() } finally { acting.value = null }
}
async function doReject(offer: Offer) {
  acting.value = offer.id
  try { await rejectOffer(offer.id); await refresh() } finally { acting.value = null }
}
async function doCancel(offer: Offer) {
  acting.value = offer.id
  try { await cancelOffer(offer.id); cancelConfirm.value = null; await refresh() } finally { acting.value = null }
}

function askCancelAccepted(offer: Offer) {
  cancelConfirm.value = offer
}

/** Dias até expiração automática de oferta accepted (7 dias após updatedAt). */
function daysUntilExpire(offer: Offer): number | null {
  if (offer.status !== 'accepted') return null
  const updated = new Date(offer.updatedAt).getTime()
  const expiresAt = updated + EXPIRE_DAYS * 24 * 60 * 60 * 1000
  const remainingMs = expiresAt - Date.now()
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
}
async function doConfirm(offer: Offer) {
  acting.value = offer.id
  try { await confirmOffer(offer.id); await refresh() } finally { acting.value = null }
}

function statusInfo(s: OfferStatus): { label: string; cls: string; icon?: any } {
  switch (s) {
    case 'pending':   return { label: 'Pendente',     cls: 'bg-(--color-accent-amber)/15 text-(--color-accent-amber) border-(--color-accent-amber)/30', icon: Hourglass }
    case 'accepted':  return { label: 'Aguardando confirmação', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30', icon: RotateCw }
    case 'rejected':  return { label: 'Rejeitada',    cls: 'bg-red-500/15 text-red-300 border-red-500/30', icon: X }
    case 'cancelled': return { label: 'Cancelada',    cls: 'bg-(--color-bg-elevated) text-(--color-text-muted) border-(--color-bg-card)', icon: X }
    case 'completed': return { label: 'Concluída',    cls: 'bg-green-500/15 text-green-300 border-green-500/30', icon: CheckCircle2 }
  }
}

function priceFormatted(p: string | null): string {
  if (!p) return ''
  const n = Number(p)
  if (Number.isNaN(n)) return p
  return n.toFixed(2).replace('.', ',')
}

function alreadyConfirmedByMe(offer: Offer): boolean {
  const me = auth.user?.id
  if (offer.ownerId === me) return Boolean(offer.ownerConfirmedAt)
  if (offer.offererId === me) return Boolean(offer.offererConfirmedAt)
  return false
}

function waitingForOtherSide(offer: Offer): boolean {
  if (offer.status !== 'accepted') return false
  return alreadyConfirmedByMe(offer) && (!offer.offererConfirmedAt || !offer.ownerConfirmedAt)
}

const STATUS_FILTERS: Array<{ key: OfferStatus | 'all'; label: string }> = [
  { key: 'all',       label: 'Todas' },
  { key: 'pending',   label: 'Pendentes' },
  { key: 'accepted',  label: 'Aguardando' },
  { key: 'completed', label: 'Concluídas' },
  { key: 'rejected',  label: 'Rejeitadas' },
  { key: 'cancelled', label: 'Canceladas' },
]
</script>

<template>
  <div class="min-h-screen bg-(--color-bg-base)">
    <AppPageHeader :icon="ArrowLeftRight" title="Trocas e ofertas">
      <template #subtitle>
        <span>Gerencie suas propostas de venda e troca</span>
      </template>
    </AppPageHeader>

    <div class="px-4 py-6 md:px-8">
      <div class="mx-auto max-w-4xl">
        <!-- Tab bar -->
        <div class="mb-4 flex gap-1 rounded-xl bg-(--color-bg-surface) p-1 border border-(--color-bg-elevated)/50">
          <button
            v-for="t in [
              { key: 'received', label: 'Recebidas', icon: Inbox },
              { key: 'sent',     label: 'Enviadas',  icon: Send },
            ]"
            :key="t.key"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-semibold transition-all"
            :class="tab === t.key
              ? 'bg-(--color-bg-elevated) text-(--color-accent-amber)'
              : 'text-(--color-text-muted) hover:text-(--color-text-primary)'"
            @click="tab = (t.key as Tab); refresh()"
          >
            <component :is="t.icon" :size="15" />
            {{ t.label }}
          </button>
        </div>

        <!-- Status filter chips -->
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

        <!-- Loading -->
        <div v-if="loading" class="space-y-2">
          <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-xl bg-(--color-bg-surface)" />
        </div>

        <!-- Erro -->
        <div v-else-if="error" class="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {{ error }}
          <button class="ml-2 underline" @click="refresh">Tentar novamente</button>
        </div>

        <!-- Empty -->
        <div v-else-if="filtered.length === 0" class="flex flex-col items-center justify-center py-16 text-center text-(--color-text-muted)">
          <component :is="tab === 'received' ? Inbox : Send" :size="36" class="mb-3 opacity-40" />
          <p class="text-sm">
            {{ tab === 'received' ? 'Nenhuma oferta recebida.' : 'Você ainda não enviou ofertas.' }}
          </p>
        </div>

        <!-- Lista -->
        <div v-else class="space-y-2">
          <div
            v-for="offer in filtered"
            :key="offer.id"
            class="rounded-xl bg-(--color-bg-surface) border border-(--color-bg-elevated) p-4"
          >
            <div class="flex items-start gap-3">
              <!-- Item desejado -->
              <div class="flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden bg-(--color-bg-elevated) flex items-center justify-center">
                <img v-if="offer.item.coverUrl" :src="offer.item.coverUrl" :alt="offer.item.name" class="w-full h-full object-cover" />
                <ImageIcon v-else :size="20" class="text-(--color-text-muted)" />
              </div>

              <div class="flex-1 min-w-0">
                <!-- Header -->
                <div class="flex items-start justify-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <p class="text-[14px] font-semibold text-(--color-text-primary) truncate">{{ offer.item.name }}</p>
                    <p class="text-[11px] text-(--color-text-muted)">
                      <template v-if="tab === 'received'">
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

                <!-- Conteúdo da oferta -->
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

                <!-- Mensagem -->
                <p v-if="offer.message" class="mt-2 text-[12px] text-(--color-text-muted) italic">
                  "{{ offer.message }}"
                </p>

                <!-- Aviso de confirmação -->
                <p v-if="waitingForOtherSide(offer)" class="mt-2 text-[11px] text-blue-300">
                  Você já confirmou. Aguardando confirmação do outro lado para concluir a transferência.
                </p>

                <!-- TTL — expiração automática -->
                <p
                  v-if="offer.status === 'accepted' && daysUntilExpire(offer) !== null"
                  class="mt-2 inline-flex items-center gap-1 text-[11px] text-(--color-text-muted)"
                >
                  <Clock :size="11" />
                  <template v-if="daysUntilExpire(offer)! > 1">
                    Expira em {{ daysUntilExpire(offer) }} dias se ninguém concluir
                  </template>
                  <template v-else-if="daysUntilExpire(offer) === 1">
                    Expira em 1 dia se ninguém concluir
                  </template>
                  <template v-else>
                    Vai expirar em breve
                  </template>
                </p>

                <!-- Ações -->
                <div class="mt-3 flex flex-wrap gap-2">
                  <!-- Recebida pendente: aceitar/rejeitar -->
                  <template v-if="tab === 'received' && offer.status === 'pending'">
                    <button
                      :disabled="acting === offer.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-accent-amber) hover:brightness-110 text-black text-[12px] font-semibold px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="doAccept(offer)"
                    >
                      <Check :size="13" />
                      Aceitar
                    </button>
                    <button
                      :disabled="acting === offer.id"
                      class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-red-300 text-[12px] font-semibold px-3 py-1.5 transition-all disabled:opacity-50"
                      @click="doReject(offer)"
                    >
                      <X :size="13" />
                      Recusar
                    </button>
                  </template>

                  <!-- Enviada pendente: cancelar -->
                  <button
                    v-if="tab === 'sent' && offer.status === 'pending'"
                    :disabled="acting === offer.id"
                    class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-(--color-text-secondary) hover:text-(--color-text-primary) text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                    @click="doCancel(offer)"
                  >
                    <X :size="13" />
                    Cancelar oferta
                  </button>

                  <!-- Aceita: confirmar (se ainda não confirmou) -->
                  <button
                    v-if="offer.status === 'accepted' && !alreadyConfirmedByMe(offer)"
                    :disabled="acting === offer.id"
                    class="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[12px] font-semibold px-3 py-1.5 transition-all disabled:opacity-50"
                    @click="doConfirm(offer)"
                  >
                    <CheckCircle2 :size="13" />
                    Confirmar transação
                  </button>

                  <!-- Aceita: cancelar (qualquer lado, "mudei de ideia") -->
                  <button
                    v-if="offer.status === 'accepted'"
                    :disabled="acting === offer.id"
                    class="inline-flex items-center gap-1.5 rounded-lg bg-(--color-bg-elevated) hover:bg-(--color-bg-card) text-red-300 text-[12px] font-medium px-3 py-1.5 transition-all disabled:opacity-50"
                    @click="askCancelAccepted(offer)"
                  >
                    <X :size="13" />
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AppConfirmDialog
      :open="!!cancelConfirm"
      title="Cancelar transação aceita?"
      description="Vocês deixarão de progredir nesta troca/venda. Notificaremos a outra parte. Você pode renegociar depois fazendo uma nova oferta."
      confirm-label="Cancelar transação"
      :loading="acting !== null"
      @cancel="cancelConfirm = null"
      @confirm="cancelConfirm && doCancel(cancelConfirm)"
    />
  </div>
</template>
