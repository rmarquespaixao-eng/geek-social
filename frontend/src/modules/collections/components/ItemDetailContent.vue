<script setup lang="ts">
import { computed, ref } from 'vue'
import { Calendar, Image as ImageIcon, Tag, ArrowLeftRight, HandCoins } from 'lucide-vue-next'
import { formatFieldValue } from '../utils/formatField'
import { formatLongDate } from '@/shared/utils/timeAgo'
import AppImageLightbox from '@/shared/ui/AppImageLightbox.vue'
import OfferDialog from '@/modules/offers/components/OfferDialog.vue'
import { useFeatureFlagsStore } from '@/shared/featureFlags/featureFlagsStore'
import type { Item, CollectionSchemaEntry } from '../types'

const featureFlags = useFeatureFlagsStore()
const hasMarketplace = computed(() => featureFlags.isEnabled('module_marketplace'))

const props = withDefaults(defineProps<{
  item: Item
  fieldSchema?: CollectionSchemaEntry[]
  /** `compact` é usado dentro de modais; `default` é usado na página dedicada (capa maior). */
  variant?: 'default' | 'compact'
  /** Listing ativo do item (se houver) — usado para exibir disponibilidade e "Fazer oferta". */
  listing?: { id: string; availability: 'sale' | 'trade' | 'both'; askingPrice: string | null } | null
}>(), {
  variant: 'default',
  listing: null,
})

const offerOpen = ref(false)
const isAvailable = computed(() => Boolean(props.listing))

const stars = computed(() => {
  const rating = props.item.rating ?? 0
  return Array.from({ length: 5 }, (_, i) => i < rating)
})

const isPlatinum = computed(() => props.item.rating === 5)

const fieldEntries = computed(() => {
  const schema = props.fieldSchema ?? []
  const fields = props.item.fields ?? {}
  return [...schema]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((entry) => ({ def: entry.fieldDefinition, rawValue: fields[entry.fieldDefinition.fieldKey] }))
    .filter((e) => e.rawValue !== undefined && e.rawValue !== null && e.rawValue !== '')
})

function formatField(def: { fieldType: string; fieldKey: string; selectOptions?: string[] | null }, raw: unknown): string {
  return formatFieldValue(def, raw, { dateStyle: 'long' })
}

const coverSrc = computed(() => {
  const url = props.item.coverUrl
  if (!url) return ''
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${props.item.updatedAt ?? ''}`
})

const coverWidthClass = computed(() => props.variant === 'compact' ? 'md:w-[200px]' : 'md:w-[260px]')
const lightboxOpen = ref(false)

const availabilityInfo = computed(() => {
  const l = props.listing
  if (!l) return null
  const formattedPrice = l.askingPrice ? `R$ ${formatPrice(l.askingPrice)}` : null
  if (l.availability === 'sale')  return { icon: Tag, label: 'À venda', detail: formattedPrice }
  if (l.availability === 'trade') return { icon: ArrowLeftRight, label: 'Aberto a propostas de troca', detail: null }
  return { icon: Tag, label: 'Venda ou troca', detail: formattedPrice }
})

function formatPrice(p: string | number | null | undefined): string {
  if (p == null) return ''
  const n = typeof p === 'number' ? p : Number(p)
  if (Number.isNaN(n)) return String(p)
  return n.toFixed(2).replace('.', ',')
}
</script>

<template>
  <div class="md:flex gap-5">
    <!-- Cover -->
    <div :class="['flex-shrink-0 w-full', coverWidthClass]">
      <div
        class="relative rounded-2xl overflow-hidden bg-[#0f0f1a] border border-[#252640] shadow-lg"
        :class="item.coverUrl ? 'cursor-pointer' : ''"
        style="aspect-ratio: 3/4"
        @click="item.coverUrl && (lightboxOpen = true)"
      >
        <img
          v-if="item.coverUrl"
          :src="coverSrc"
          :alt="item.name"
          class="w-full h-full object-cover hover:opacity-90 transition-opacity"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-[#475569]">
          <ImageIcon :size="56" />
        </div>
        <div
          v-if="isPlatinum"
          class="absolute top-2 right-2 bg-black/55 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1"
          title="Platinado"
        >
          <span class="text-sm leading-none">🏆</span>
          <span class="text-[9px] font-bold uppercase tracking-wider text-[#f59e0b]">Platinado</span>
        </div>
      </div>
    </div>

    <!-- Info (título é renderizado pelo parent — header de modal ou h1 da página) -->
    <div class="flex-1 mt-5 md:mt-0 min-w-0">
      <!-- Rating -->
      <div v-if="item.rating" class="flex items-center gap-1">
        <span
          v-for="(filled, i) in stars"
          :key="i"
          :class="filled ? 'text-[#f59e0b]' : 'text-[#475569]'"
          class="text-[18px] leading-none"
        >★</span>
        <span class="text-[12px] text-[#94a3b8] ml-2 font-medium">{{ item.rating }}/5</span>
      </div>
      <p v-else class="text-[12px] text-[#475569]">Sem avaliação</p>

      <!-- Disponibilidade (venda/troca) -->
      <div v-if="availabilityInfo" class="mt-3 flex flex-wrap items-center gap-2">
        <div class="inline-flex items-center gap-2 rounded-full bg-[#f59e0b]/15 border border-[#f59e0b]/40 text-[#f59e0b] px-3 py-1.5">
          <component :is="availabilityInfo.icon" :size="13" />
          <span class="text-[12px] font-semibold">
            {{ availabilityInfo.label }}<template v-if="availabilityInfo.detail"> · {{ availabilityInfo.detail }}</template>
          </span>
        </div>
        <button
          v-if="isAvailable && hasMarketplace"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full bg-(--color-accent-amber) hover:brightness-110 text-black px-3 py-1.5 text-[12px] font-semibold transition-all"
          @click="offerOpen = true"
        >
          <HandCoins :size="13" />
          Fazer oferta
        </button>
      </div>

      <!-- Slot para ações (botões editar/excluir do owner; modal não usa) -->
      <slot name="actions" />

      <!-- Notes -->
      <div v-if="item.comment" class="mt-4 rounded-xl bg-[#0f0f1a] border border-[#252640] p-3">
        <p class="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-1.5">Notas</p>
        <p class="text-[13px] text-[#e2e8f0] leading-relaxed whitespace-pre-wrap">
          {{ item.comment }}
        </p>
      </div>

      <!-- Detalhes (campos do schema) -->
      <div v-if="fieldEntries.length" class="mt-4">
        <p class="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider mb-2">Detalhes</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            v-for="entry in fieldEntries"
            :key="entry.def.fieldKey"
            class="rounded-lg bg-[#0f0f1a] border border-[#252640] px-3 py-2"
          >
            <p class="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">
              {{ entry.def.name }}
            </p>
            <p class="mt-0.5 text-[13px] font-medium text-[#e2e8f0] break-words">
              {{ formatField(entry.def, entry.rawValue) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Meta -->
      <div class="mt-4 flex items-center gap-1.5 text-[11px] text-[#475569]">
        <Calendar :size="11" />
        Adicionado em {{ formatLongDate(item.createdAt) }}
      </div>
    </div>
  </div>

  <AppImageLightbox
    v-if="item.coverUrl"
    :open="lightboxOpen"
    :src="item.coverUrl"
    :alt="item.name"
    @close="lightboxOpen = false"
  />

  <OfferDialog
    v-if="isAvailable && listing"
    :open="offerOpen"
    :listing="listing"
    :item-name="item.name"
    @close="offerOpen = false"
    @created="offerOpen = false"
  />
</template>
