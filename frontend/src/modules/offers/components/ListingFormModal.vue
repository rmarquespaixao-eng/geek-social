<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Tag, ArrowLeftRight, ShoppingBag, AlertTriangle, ChevronLeft } from 'lucide-vue-next'
import AppModal from '@/shared/ui/AppModal.vue'
import AppButton from '@/shared/ui/AppButton.vue'
import {
  createListing, updateListing,
  type ListingAvailability, type PaymentMethod, type ListingWithItem,
} from '../services/listingsService'

const props = defineProps<{
  open: boolean
  itemId: string
  itemName: string
  existingListing?: ListingWithItem | null
}>()

const emit = defineEmits<{
  close: []
  created: []
  updated: []
}>()

const isEdit = computed(() => Boolean(props.existingListing))

type Step = 1 | 2 | 3

const step = ref<Step>(1)
const availability = ref<ListingAvailability | null>(null)
const askingPrice = ref<string>('')
const paymentMethods = ref<PaymentMethod[]>([])
const disclaimerAccepted = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix',       label: 'Pix' },
  { value: 'money',     label: 'Dinheiro' },
  { value: 'transfer',  label: 'Transferência' },
  { value: 'card',      label: 'Cartão' },
  { value: 'negotiate', label: 'A combinar' },
]

const needsPriceStep = computed(
  () => availability.value === 'sale' || availability.value === 'both',
)

watch(() => props.open, (open) => {
  if (!open) return
  step.value = 1
  error.value = null
  submitting.value = false
  disclaimerAccepted.value = false
  if (props.existingListing) {
    availability.value = props.existingListing.availability
    askingPrice.value = props.existingListing.askingPrice ?? ''
    paymentMethods.value = [...(props.existingListing.paymentMethods ?? [])]
  } else {
    availability.value = null
    askingPrice.value = ''
    paymentMethods.value = []
  }
})

function togglePayment(method: PaymentMethod) {
  const idx = paymentMethods.value.indexOf(method)
  if (idx >= 0) paymentMethods.value.splice(idx, 1)
  else paymentMethods.value.push(method)
}

function goNext() {
  if (step.value === 1) {
    step.value = needsPriceStep.value ? 2 : 3
  } else if (step.value === 2) {
    step.value = 3
  }
}

function goBack() {
  if (step.value === 3) {
    step.value = needsPriceStep.value ? 2 : 1
  } else if (step.value === 2) {
    step.value = 1
  }
}

const canNext = computed(() => {
  if (step.value === 1) return Boolean(availability.value)
  if (step.value === 2) return !needsPriceStep.value || paymentMethods.value.length > 0
  return false
})

const canSubmit = computed(() => {
  if (!availability.value) return false
  if (isEdit.value) return true
  return disclaimerAccepted.value
})

const priceAsNumber = computed(() => {
  const raw = askingPrice.value
  if (raw == null || raw === '') return null
  const str = typeof raw === 'string' ? raw : String(raw)
  const n = parseFloat(str.replace(',', '.'))
  return Number.isNaN(n) || n <= 0 ? null : n
})

async function submit() {
  if (!availability.value || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    if (isEdit.value && props.existingListing) {
      await updateListing(props.existingListing.id, {
        availability: availability.value,
        askingPrice: needsPriceStep.value ? priceAsNumber.value : null,
        paymentMethods: needsPriceStep.value ? paymentMethods.value : [],
      })
      emit('updated')
    } else {
      await createListing({
        itemId: props.itemId,
        availability: availability.value,
        askingPrice: needsPriceStep.value ? priceAsNumber.value : null,
        paymentMethods: needsPriceStep.value ? paymentMethods.value : [],
        disclaimerAccepted: true,
      })
      emit('created')
    }
    emit('close')
  } catch (e: any) {
    const code = e?.response?.data?.error
    const details = e?.response?.data?.details
    if (details) console.error('[ListingFormModal] validation details:', details)
    console.error('[ListingFormModal] full error:', e?.response?.data ?? e)
    error.value = code === 'ITEM_NOT_FOUND'    ? 'Item não encontrado.'
                : code === 'ALREADY_LISTED'    ? 'Este item já está na vitrine.'
                : code === 'NOT_FOUND'          ? 'Anúncio não encontrado.'
                : code === 'NOT_AUTHORIZED'     ? 'Sem permissão para editar este anúncio.'
                : code === 'INVALID_INPUT'      ? 'Dados inválidos. Veja o console para detalhes.'
                : code === 'INVALID_TRANSITION' ? 'Transição de estado inválida.'
                : code === 'LISTING_CLOSED'     ? 'Anúncio encerrado não pode ser editado.'
                : isEdit.value ? 'Erro ao atualizar anúncio.' : 'Erro ao criar anúncio.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <AppModal v-if="open" size="sm" @close="emit('close')">
      <div class="p-5 space-y-4">
        <!-- Header -->
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-(--color-accent-amber)/10 flex-shrink-0">
            <ShoppingBag :size="18" class="text-(--color-accent-amber)" />
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold text-(--color-text-primary)">
              {{ isEdit ? 'Editar anúncio' : 'Anunciar na vitrine' }}
            </h2>
            <p class="text-xs text-(--color-text-muted) truncate">{{ itemName }}</p>
          </div>
        </div>

        <!-- Edit mode: single form -->
        <template v-if="isEdit">
          <!-- Availability -->
          <div class="space-y-2">
            <p class="text-xs font-medium text-(--color-text-secondary)">Disponível para</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="opt in [
                  { value: 'sale',  label: 'Venda',        icon: Tag },
                  { value: 'trade', label: 'Troca',        icon: ArrowLeftRight },
                  { value: 'both',  label: 'Venda + Troca', icon: ShoppingBag },
                ]"
                :key="opt.value"
                type="button"
                class="flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border text-xs font-medium transition-colors"
                :class="availability === opt.value
                  ? 'border-(--color-accent-amber) bg-(--color-accent-amber)/10 text-(--color-accent-amber)'
                  : 'border-(--color-bg-elevated) text-(--color-text-secondary) hover:border-(--color-text-muted)/40'"
                @click="availability = opt.value as ListingAvailability"
              >
                <component :is="opt.icon" :size="14" />
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Price + payment (if sale or both) -->
          <template v-if="needsPriceStep">
            <div>
              <label class="text-xs font-medium text-(--color-text-secondary)">Preço pedido (R$, opcional)</label>
              <input
                v-model="askingPrice"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Deixe vazio para negociar"
                class="mt-1 w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/20 border border-transparent focus:border-(--color-accent-amber)"
              />
            </div>
            <div>
              <p class="text-xs font-medium text-(--color-text-secondary) mb-2">Formas de pagamento</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="p in PAYMENT_OPTIONS"
                  :key="p.value"
                  type="button"
                  class="px-3 py-1.5 rounded-full border text-xs font-medium transition-colors"
                  :class="paymentMethods.includes(p.value)
                    ? 'border-(--color-accent-amber) bg-(--color-accent-amber)/10 text-(--color-accent-amber)'
                    : 'border-(--color-bg-elevated) text-(--color-text-secondary) hover:border-(--color-text-muted)/40'"
                  @click="togglePayment(p.value)"
                >
                  {{ p.label }}
                </button>
              </div>
            </div>
          </template>

          <div v-if="error" class="flex items-start gap-2 px-3 py-2 rounded-lg bg-(--color-danger)/10 text-(--color-danger) text-xs">
            <AlertTriangle :size="14" class="mt-0.5 flex-shrink-0" />
            {{ error }}
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
              Salvar
            </AppButton>
          </div>
        </template>

        <!-- Create mode: step wizard -->
        <template v-else>
          <!-- Step 1: availability -->
          <template v-if="step === 1">
            <div class="space-y-2">
              <p class="text-xs font-medium text-(--color-text-secondary)">Este item está disponível para</p>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="opt in [
                    { value: 'sale',  label: 'Venda',        icon: Tag },
                    { value: 'trade', label: 'Troca',        icon: ArrowLeftRight },
                    { value: 'both',  label: 'Venda + Troca', icon: ShoppingBag },
                  ]"
                  :key="opt.value"
                  type="button"
                  class="flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border text-xs font-medium transition-colors"
                  :class="availability === opt.value
                    ? 'border-(--color-accent-amber) bg-(--color-accent-amber)/10 text-(--color-accent-amber)'
                    : 'border-(--color-bg-elevated) text-(--color-text-secondary) hover:border-(--color-text-muted)/40'"
                  @click="availability = opt.value as ListingAvailability"
                >
                  <component :is="opt.icon" :size="14" />
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </template>

          <!-- Step 2: price + payment -->
          <template v-else-if="step === 2">
            <div>
              <label class="text-xs font-medium text-(--color-text-secondary)">Preço pedido (R$, opcional)</label>
              <input
                v-model="askingPrice"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Deixe vazio para negociar"
                class="mt-1 w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/20 border border-transparent focus:border-(--color-accent-amber)"
              />
            </div>
            <div>
              <p class="text-xs font-medium text-(--color-text-secondary) mb-2">Formas de pagamento aceitas</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="p in PAYMENT_OPTIONS"
                  :key="p.value"
                  type="button"
                  class="px-3 py-1.5 rounded-full border text-xs font-medium transition-colors"
                  :class="paymentMethods.includes(p.value)
                    ? 'border-(--color-accent-amber) bg-(--color-accent-amber)/10 text-(--color-accent-amber)'
                    : 'border-(--color-bg-elevated) text-(--color-text-secondary) hover:border-(--color-text-muted)/40'"
                  @click="togglePayment(p.value)"
                >
                  {{ p.label }}
                </button>
              </div>
              <p v-if="paymentMethods.length === 0" class="mt-1.5 text-[11px] text-(--color-text-muted)">
                Selecione ao menos uma forma de pagamento.
              </p>
            </div>
          </template>

          <!-- Step 3: disclaimer -->
          <template v-else>
            <div class="rounded-lg border border-(--color-bg-elevated) p-3 text-xs text-(--color-text-muted) space-y-2 leading-relaxed">
              <p class="font-semibold text-(--color-text-secondary)">Antes de publicar</p>
              <ul class="list-disc list-inside space-y-1">
                <li>Este anúncio é visível para todos os usuários.</li>
                <li>Você é responsável pelas informações e pela negociação.</li>
                <li>Itens ilegais ou falsificados não são permitidos.</li>
                <li>O anúncio é encerrado automaticamente quando uma oferta é concluída.</li>
              </ul>
            </div>
            <label class="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                v-model="disclaimerAccepted"
                type="checkbox"
                class="mt-0.5 h-4 w-4 rounded border-[#252640] bg-(--color-bg-elevated) accent-(--color-accent-amber)"
              />
              <span class="text-xs text-(--color-text-secondary)">
                Li e concordo com as condições acima.
              </span>
            </label>
          </template>

          <div v-if="error" class="flex items-start gap-2 px-3 py-2 rounded-lg bg-(--color-danger)/10 text-(--color-danger) text-xs">
            <AlertTriangle :size="14" class="mt-0.5 flex-shrink-0" />
            {{ error }}
          </div>

          <div class="flex gap-2 pt-1">
            <button
              v-if="step > 1"
              type="button"
              class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
              :disabled="submitting"
              @click="goBack"
            >
              <ChevronLeft :size="14" />
              Voltar
            </button>
            <div class="flex-1" />
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
              :disabled="submitting"
              @click="emit('close')"
            >
              Cancelar
            </button>
            <AppButton
              v-if="step < 3"
              variant="primary"
              :disabled="!canNext"
              @click="goNext"
            >
              Continuar
            </AppButton>
            <AppButton
              v-else
              variant="primary"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="submit"
            >
              Publicar anúncio
            </AppButton>
          </div>
        </template>
      </div>
    </AppModal>
  </Teleport>
</template>
