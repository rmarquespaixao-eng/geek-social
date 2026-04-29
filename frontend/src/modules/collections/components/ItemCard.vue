<script setup lang="ts">
import { computed } from 'vue'
import { Image as ImageIcon, Quote, Hourglass, Gamepad2, Check, Trophy, Tag, ArrowLeftRight, Plus } from 'lucide-vue-next'
import { formatFieldValue } from '../utils/formatField'
import type { Item, CollectionSchemaEntry, CollectionType } from '../types'

const props = defineProps<{
  item: Item
  fieldSchema?: CollectionSchemaEntry[]
  collectionType?: CollectionType
  /** Listing ativo deste item (se houver). Mostra badge de disponibilidade. */
  listing?: { id: string; availability: 'sale' | 'trade' | 'both'; askingPrice: string | null } | null
  /** Quando true, o badge da vitrine vira clicável (criar/editar anúncio). */
  canList?: boolean
}>()

const emit = defineEmits<{
  click: [id: string]
  'list-action': [id: string]
}>()

const stars = computed(() => {
  const rating = props.item.rating ?? 0
  return Array.from({ length: 5 }, (_, i) => i < rating)
})

const gameStatus = computed(() => {
  if (props.collectionType !== 'games') return null
  const status = props.item.fields?.status
  if (typeof status !== 'string') return null
  switch (status) {
    case 'Na fila':
      return {
        icon: Hourglass,
        label: 'Na fila',
        class: 'bg-black/55 backdrop-blur-sm text-[#cbd5e1] border-white/15',
      }
    case 'Em andamento':
      return {
        icon: Gamepad2,
        label: 'Jogando',
        class: 'bg-[#2563eb] text-white border-[#1e3a8a] ring-1 ring-black/40 shadow-[0_1px_3px_rgba(0,0,0,0.5)]',
      }
    case 'Zerado':
      return {
        icon: Check,
        label: 'Zerado',
        class: 'bg-[#16a34a] text-white border-[#14532d] ring-1 ring-black/40 shadow-[0_1px_3px_rgba(0,0,0,0.5)]',
      }
    case 'Platinado':
      return {
        icon: Trophy,
        label: 'Platina',
        class: 'bg-[#d97706] text-white border-[#78350f] ring-1 ring-black/40 shadow-[0_0_14px_rgba(245,158,11,0.6),0_1px_3px_rgba(0,0,0,0.5)]',
      }
    default:
      return null
  }
})

const filledFields = computed(() => {
  const schema = props.fieldSchema ?? []
  const fields = props.item.fields ?? {}
  return [...schema]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((entry) => ({ def: entry.fieldDefinition, value: fields[entry.fieldDefinition.fieldKey] }))
    .filter((e) => e.value !== undefined && e.value !== null && e.value !== '')
})

// 1-2 chips para o rodapé sempre visível
const primaryChips = computed(() => filledFields.value.slice(0, 2))

function formatValue(
  def: { fieldType: string; fieldKey: string; selectOptions?: string[] | null },
  raw: unknown,
): string {
  return formatFieldValue(def, raw)
}

const coverSrc = computed(() => {
  const url = props.item.coverUrl
  if (!url) return ''
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${props.item.updatedAt ?? ''}`
})

const listingBadge = computed(() => {
  const l = props.listing
  if (!l) return null
  const price = l.askingPrice
  if (l.availability === 'sale')  return { icon: Tag, label: price ? `R$ ${formatPrice(price)}` : 'À venda' }
  if (l.availability === 'trade') return { icon: ArrowLeftRight, label: 'Para troca' }
  return { icon: Tag, label: price ? `R$ ${formatPrice(price)} / troca` : 'Venda ou troca' }
})

function formatPrice(p: string | null | undefined): string {
  if (!p) return ''
  const n = typeof p === 'number' ? p : Number(p)
  if (Number.isNaN(n)) return String(p)
  return n.toFixed(2).replace('.', ',')
}

function onListClick(e: MouseEvent) {
  e.stopPropagation()
  emit('list-action', props.item.id)
}
</script>

<template>
  <div
    class="group relative bg-[#1e2038] rounded-xl overflow-hidden cursor-pointer border border-[#252640] hover:border-[#f59e0b]/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#f59e0b]/10"
    style="aspect-ratio: 2/3"
    @click="emit('click', item.id)"
  >
    <div class="relative w-full h-full bg-[#0f0f1a] overflow-hidden">
      <template v-if="item.coverUrl">
        <!-- Backdrop borrado: cobre o card todo, simulando um glow temático da imagem -->
        <img
          :src="coverSrc"
          aria-hidden="true"
          class="absolute inset-0 w-full h-full object-cover scale-150 blur-2xl saturate-150 select-none pointer-events-none"
        />
        <!-- Camada escura sutil para legibilidade do título sobre o glow -->
        <div class="absolute inset-0 bg-black/35 pointer-events-none" />
        <!-- Imagem principal: contain para nunca cropar -->
        <img
          :src="coverSrc"
          :alt="item.name"
          class="relative w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.03] drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
        />
      </template>
      <!-- Placeholder -->
      <div
        v-else
        class="w-full h-full bg-gradient-to-br from-[#252640] via-[#1e2038] to-[#0f0f1a] flex items-center justify-center"
      >
        <ImageIcon :size="56" class="text-[#475569]" />
      </div>

      <!-- Game status badge (somente para tipo 'games') -->
      <div
        v-if="gameStatus"
        class="absolute top-2 right-2 rounded-full px-2 py-0.5 flex items-center gap-1 border"
        :class="gameStatus.class"
        :title="gameStatus.label"
      >
        <component :is="gameStatus.icon" :size="10" />
        <span class="text-[9px] font-bold uppercase tracking-wider">{{ gameStatus.label }}</span>
      </div>

      <!-- Listing badge (anunciado na vitrine) — clicável quando canList -->
      <button
        v-if="listingBadge"
        type="button"
        class="absolute top-2 left-2 z-10 rounded-full px-2 py-0.5 flex items-center gap-1 bg-[#f59e0b] text-black ring-1 ring-black/40 shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-transform"
        :class="canList ? 'cursor-pointer hover:scale-105 hover:brightness-110' : 'cursor-default'"
        :disabled="!canList"
        :title="canList ? `${listingBadge.label} — clique para editar` : listingBadge.label"
        @click="canList && onListClick($event)"
      >
        <component :is="listingBadge.icon" :size="10" />
        <span class="text-[9px] font-bold uppercase tracking-wider">{{ listingBadge.label }}</span>
      </button>

      <!-- "Anunciar" — sempre visível pro dono quando o item não tem listing -->
      <button
        v-else-if="canList"
        type="button"
        class="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-black/65 backdrop-blur-sm text-white ring-1 ring-white/30 hover:bg-[#f59e0b] hover:text-black hover:ring-black/40 transition-all"
        title="Anunciar na vitrine"
        @click="onListClick($event)"
      >
        <Plus :size="11" />
        <span class="text-[9px] font-bold uppercase tracking-wider">Anunciar</span>
      </button>

      <!-- Bottom info: stars + name + 1-2 chips (sempre visível) -->
      <div class="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black via-black/85 to-transparent">
        <!-- Stars -->
        <div v-if="item.rating" class="flex items-center gap-0.5 mb-1">
          <span
            v-for="(filled, i) in stars"
            :key="i"
            :class="filled ? 'text-[#f59e0b]' : 'text-white/25'"
            class="text-[11px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          >★</span>
        </div>

        <!-- Name -->
        <p class="text-[13px] font-bold text-white leading-tight truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {{ item.name }}
        </p>

        <!-- Chips primárias -->
        <div v-if="primaryChips.length" class="flex flex-wrap items-center gap-1 mt-1.5">
          <span
            v-for="chip in primaryChips"
            :key="chip.def.fieldKey"
            class="inline-flex items-center px-1.5 py-0.5 rounded bg-white/15 backdrop-blur-sm text-[10px] font-medium text-white truncate max-w-[100px]"
          >
            {{ formatValue(chip.def, chip.value) }}
          </span>
        </div>
      </div>

      <!-- Hover overlay: detalhes completos -->
      <div
        class="absolute inset-0 bg-gradient-to-t from-black via-black/95 to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col p-3.5 overflow-hidden"
      >
        <!-- Title -->
        <p class="text-[14px] font-bold text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {{ item.name }}
        </p>

        <!-- Stars -->
        <div v-if="item.rating" class="flex items-center gap-0.5 mt-1">
          <span
            v-for="(filled, i) in stars"
            :key="i"
            :class="filled ? 'text-[#f59e0b]' : 'text-white/25'"
            class="text-[12px] leading-none"
          >★</span>
          <span class="text-[10px] text-white/70 ml-1.5 font-medium">{{ item.rating }}/5</span>
        </div>
        <p v-else class="text-[10px] text-white/50 mt-1 uppercase tracking-wider font-semibold">Sem nota</p>

        <!-- Lista de fields no formato label/value -->
        <div v-if="filledFields.length" class="mt-2.5 flex-1 overflow-y-auto pr-1 -mr-1">
          <dl class="space-y-1">
            <div
              v-for="entry in filledFields"
              :key="entry.def.fieldKey"
              class="flex items-baseline gap-2 text-[10px]"
            >
              <dt class="text-white/55 uppercase tracking-wider font-semibold flex-shrink-0">
                {{ entry.def.name }}
              </dt>
              <dd class="text-white font-medium text-right break-words ml-auto truncate">
                {{ formatValue(entry.def, entry.value) }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Comment preview -->
        <div v-if="item.comment" class="mt-2 flex items-start gap-1 text-white/70">
          <Quote :size="10" class="flex-shrink-0 mt-0.5 opacity-60" />
          <p class="text-[10px] italic line-clamp-3 leading-snug">{{ item.comment }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
