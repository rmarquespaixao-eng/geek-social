<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Tag, ArrowLeftRight, AlertTriangle, ChevronLeft, Image as ImageIcon } from 'lucide-vue-next'
import AppModal from '@/shared/ui/AppModal.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import { listCollections } from '@/modules/collections/services/collectionsService'
import { listItems } from '@/modules/collections/services/itemsService'
import type { Collection, Item } from '@/modules/collections/types'
import { proposeOffer, type Offer, type OfferType } from '../services/offersService'

const props = defineProps<{
  open: boolean
  offer: Offer
}>()

const emit = defineEmits<{
  close: []
  proposed: []
}>()

const offerType = computed<OfferType>(() => props.offer.type)

const offeredPrice = ref<string>('')
const message = ref<string>('')
const submitting = ref(false)
const error = ref<string | null>(null)

// Trade picker
const myCollections = ref<Collection[]>([])
const collectionsLoading = ref(false)
const selectedCollectionId = ref<string | null>(null)
const myItems = ref<Item[]>([])
const itemsLoading = ref(false)
const selectedOfferedItemId = ref<string | null>(null)

watch(() => props.open, (open) => {
  if (open) {
    offeredPrice.value = ''
    message.value = ''
    error.value = null
    submitting.value = false
    selectedCollectionId.value = null
    selectedOfferedItemId.value = null
    myItems.value = []
    if (offerType.value === 'trade') void loadMyCollections()
  }
}, { immediate: true })

async function loadMyCollections() {
  if (myCollections.value.length > 0 || collectionsLoading.value) return
  collectionsLoading.value = true
  try {
    const all = await listCollections()
    myCollections.value = all.filter(c => c.visibility !== 'private')
  } finally {
    collectionsLoading.value = false
  }
}

async function pickCollection(id: string) {
  selectedCollectionId.value = id
  selectedOfferedItemId.value = null
  itemsLoading.value = true
  try {
    myItems.value = await listItems(id)
  } finally {
    itemsLoading.value = false
  }
}

function backToCollections() {
  selectedCollectionId.value = null
  selectedOfferedItemId.value = null
  myItems.value = []
}

const canSubmit = computed(() => {
  if (offerType.value === 'buy') {
    const n = Number(offeredPrice.value)
    return !Number.isNaN(n) && n > 0
  }
  return Boolean(selectedOfferedItemId.value)
})

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    if (offerType.value === 'buy') {
      await proposeOffer(props.offer.id, {
        offeredPrice: Number(offeredPrice.value),
        message: message.value.trim() || null,
      })
    } else {
      await proposeOffer(props.offer.id, {
        offeredItemId: selectedOfferedItemId.value!,
        message: message.value.trim() || null,
      })
    }
    emit('proposed')
    emit('close')
  } catch (e: any) {
    const code = e?.response?.data?.error
    error.value = code === 'ALREADY_PROPOSED'                  ? 'Você já tem uma proposta pendente — aguarde a resposta da outra parte.'
                : code === 'OFFER_NOT_NEGOTIABLE'              ? 'Esta oferta não está mais aberta para propostas.'
                : code === 'OFFERED_ITEM_NOT_OWNED'            ? 'O item escolhido não é seu.'
                : code === 'OFFERED_COLLECTION_PRIVATE'        ? 'A coleção do item escolhido é privada.'
                : code === 'OFFERED_COLLECTION_REQUIRES_FRIENDSHIP' ? 'Vocês precisam ser amigos para esta troca.'
                : code === 'INVALID_PROPOSAL'                  ? 'Dados da proposta inválidos.'
                : 'Erro ao enviar contra-proposta.'
  } finally {
    submitting.value = false
  }
}

const selectedItem = computed(() => myItems.value.find(i => i.id === selectedOfferedItemId.value))
</script>

<template>
  <Teleport to="body">
    <AppModal v-if="open" size="md" @close="emit('close')">
      <div class="p-5 space-y-4">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-accent-amber)/10 flex-shrink-0">
            <component :is="offerType === 'buy' ? Tag : ArrowLeftRight" :size="18" class="text-(--color-accent-amber)" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold text-(--color-text-primary)">Contra-proposta</h2>
            <p class="text-xs text-(--color-text-muted) truncate">
              {{ offer.item.name }}
            </p>
          </div>
        </div>

        <!-- Buy: novo preço -->
        <div v-if="offerType === 'buy'" class="space-y-3">
          <div>
            <label class="text-xs font-medium text-(--color-text-secondary)">Novo valor (R$)</label>
            <input
              v-model="offeredPrice"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0,00"
              class="mt-1 w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/20 border border-transparent focus:border-(--color-accent-amber)"
            />
            <p v-if="offer.offeredPrice" class="mt-1 text-[11px] text-(--color-text-muted)">
              Proposta atual: R$ {{ Number(offer.offeredPrice).toFixed(2).replace('.', ',') }}
            </p>
          </div>
        </div>

        <!-- Trade: novo item -->
        <div v-else class="space-y-3">
          <div v-if="!selectedCollectionId">
            <p class="text-xs font-medium text-(--color-text-secondary) mb-2">Escolha o item que você oferece</p>
            <div v-if="collectionsLoading" class="py-6 flex justify-center">
              <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
            </div>
            <div v-else-if="myCollections.length === 0" class="py-4 text-sm text-(--color-text-muted) text-center">
              Você não tem coleções públicas ou friends-only.
            </div>
            <div v-else class="space-y-1 max-h-56 overflow-y-auto">
              <button
                v-for="c in myCollections"
                :key="c.id"
                type="button"
                class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-(--color-bg-elevated)/50 text-left transition-colors"
                @click="pickCollection(c.id)"
              >
                <span class="text-sm text-(--color-text-primary)">{{ c.name }}</span>
                <span class="text-[10px] text-(--color-text-muted) ml-auto">{{ c.visibility }}</span>
              </button>
            </div>
          </div>

          <div v-else>
            <button type="button" class="inline-flex items-center gap-1 text-xs text-(--color-text-muted) hover:text-(--color-text-primary) mb-2" @click="backToCollections">
              <ChevronLeft :size="12" />
              Voltar
            </button>
            <div v-if="itemsLoading" class="py-6 flex justify-center">
              <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
            </div>
            <div v-else-if="myItems.length === 0" class="py-4 text-sm text-(--color-text-muted) text-center">
              Esta coleção não tem itens.
            </div>
            <div v-else class="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
              <button
                v-for="it in myItems"
                :key="it.id"
                type="button"
                class="relative aspect-[2/3] rounded-lg border overflow-hidden bg-[#0f0f1a] transition-colors"
                :class="selectedOfferedItemId === it.id ? 'border-(--color-accent-amber) ring-2 ring-(--color-accent-amber)/40' : 'border-(--color-bg-elevated) hover:border-(--color-text-muted)/40'"
                @click="selectedOfferedItemId = it.id"
              >
                <img v-if="it.coverUrl" :src="it.coverUrl" :alt="it.name" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-(--color-text-muted)">
                  <ImageIcon :size="20" />
                </div>
                <p class="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black via-black/80 to-transparent text-white text-[10px] font-semibold truncate">
                  {{ it.name }}
                </p>
              </button>
            </div>
            <p v-if="selectedItem" class="mt-2 text-[11px] text-(--color-text-muted)">
              Oferecendo: <span class="text-(--color-text-primary) font-medium">{{ selectedItem.name }}</span>
            </p>
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-(--color-text-secondary)">Mensagem (opcional)</label>
          <textarea
            v-model="message"
            rows="2"
            maxlength="2000"
            placeholder="Comente sua contra-proposta..."
            class="mt-1 w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) text-sm resize-none focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/20 border border-transparent focus:border-(--color-accent-amber)"
          />
        </div>

        <div v-if="error" class="flex items-start gap-2 px-3 py-2 rounded-lg bg-(--color-danger)/10 text-(--color-danger) text-xs">
          <AlertTriangle :size="14" class="mt-0.5 flex-shrink-0" />
          <span>{{ error }}</span>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            :disabled="submitting"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <AppButton variant="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
            Enviar contra-proposta
          </AppButton>
        </div>
      </div>
    </AppModal>
  </Teleport>
</template>
