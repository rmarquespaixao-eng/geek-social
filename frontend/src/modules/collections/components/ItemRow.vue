<script setup lang="ts">
import { computed } from 'vue'
import { Image as ImageIcon, ChevronRight, Quote, Hourglass, Gamepad2, Check, Trophy, Tag, ArrowLeftRight, Plus } from 'lucide-vue-next'
import { formatFieldValue } from '../utils/formatField'
import type { Item, CollectionSchemaEntry, CollectionType } from '../types'

const props = defineProps<{
  item: Item
  fieldSchema?: CollectionSchemaEntry[]
  collectionType?: CollectionType
  /** Listing ativo deste item (se houver). */
  listing?: { id: string; availability: 'sale' | 'trade' | 'both'; askingPrice: string | null } | null
  /** Quando true, badge de listing fica clicável e botão "Anunciar" aparece se não houver listing. */
  canList?: boolean
}>()

const emit = defineEmits<{
  click: [id: string]
  'list-action': [id: string]
}>()

const listingBadge = computed(() => {
  const l = props.listing
  if (!l) return null
  const price = l.askingPrice
  if (l.availability === 'sale')  return { icon: Tag, label: price ? `R$ ${formatPriceShort(price)}` : 'À venda' }
  if (l.availability === 'trade') return { icon: ArrowLeftRight, label: 'Troca' }
  return { icon: Tag, label: price ? `R$ ${formatPriceShort(price)} · troca` : 'Venda/Troca' }
})

function formatPriceShort(p: string | null | undefined): string {
  if (!p) return ''
  const n = typeof p === 'number' ? p : Number(p)
  if (Number.isNaN(n)) return String(p)
  return n.toFixed(2).replace('.', ',')
}

function onListClick(e: MouseEvent) {
  e.stopPropagation()
  emit('list-action', props.item.id)
}

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
      return { icon: Hourglass, label: 'Na fila', class: 'bg-[#252640] text-[#cbd5e1] border-[#475569]/50' }
    case 'Em andamento':
      return { icon: Gamepad2, label: 'Jogando', class: 'bg-[#3b82f6]/20 text-[#93c5fd] border-[#3b82f6]/40' }
    case 'Zerado':
      return { icon: Check, label: 'Zerado', class: 'bg-[#22c55e]/20 text-[#86efac] border-[#22c55e]/40' }
    case 'Platinado':
      return { icon: Trophy, label: 'Platina', class: 'bg-[#f59e0b]/25 text-[#fde68a] border-[#fbbf24]/50 shadow-[0_0_8px_rgba(245,158,11,0.35)]' }
    default:
      return null
  }
})

const coverSrc = computed(() => {
  const url = props.item.coverUrl
  if (!url) return ''
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${props.item.updatedAt ?? ''}`
})

// Pega até 5 campos preenchidos (allow wrap)
const fieldChips = computed(() => {
  const schema = props.fieldSchema ?? []
  const fields = props.item.fields ?? {}
  return [...schema]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((entry) => {
      const def = entry.fieldDefinition
      const value = fields[def.fieldKey]
      return { def, value }
    })
    .filter((e) => e.value !== undefined && e.value !== null && e.value !== '')
    .slice(0, 5)
})

const hiddenFieldsCount = computed(() => {
  const schema = props.fieldSchema ?? []
  const fields = props.item.fields ?? {}
  const total = schema.filter((entry) => {
    const v = fields[entry.fieldDefinition.fieldKey]
    return v !== undefined && v !== null && v !== ''
  }).length
  return Math.max(0, total - fieldChips.value.length)
})

function formatChipValue(
  def: { fieldType: string; fieldKey: string; selectOptions?: string[] | null },
  raw: unknown,
): string {
  return formatFieldValue(def, raw)
}

function relativeDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days < 1) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 7) return `há ${days}d`
  if (days < 30) return `há ${Math.floor(days / 7)}sem`
  if (days < 365) return `há ${Math.floor(days / 30)}m`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div
    class="group relative flex gap-4 bg-[#1e2038] hover:bg-[#252640] rounded-xl p-3 border border-[#252640] hover:border-[#f59e0b]/40 transition-all duration-150 cursor-pointer"
    @click="emit('click', item.id)"
  >
    <!-- Cover thumbnail 80x[100] (4:5) -->
    <div class="relative flex-shrink-0 w-20 h-[100px] rounded-lg overflow-hidden bg-[#252640] border border-[#2e3050]">
      <img
        v-if="item.coverUrl"
        :src="coverSrc"
        :alt="item.name"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-[#475569]">
        <ImageIcon :size="26" />
      </div>
      <!-- Game status badge (somente para 'games') -->
      <div
        v-if="gameStatus"
        class="absolute top-1 right-1 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 border backdrop-blur-sm"
        :class="gameStatus.class"
        :title="gameStatus.label"
      >
        <component :is="gameStatus.icon" :size="9" />
        <span class="text-[8px] font-bold uppercase tracking-wider">{{ gameStatus.label }}</span>
      </div>
    </div>

    <!-- Info -->
    <div class="flex-1 min-w-0 flex flex-col gap-1.5">
      <!-- Top row: name + chevron -->
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-[15px] font-bold text-[#e2e8f0] truncate leading-tight">
            {{ item.name }}
          </p>

          <!-- Rating + meta -->
          <div class="flex items-center gap-2 mt-1">
            <div v-if="item.rating" class="flex items-center gap-0.5">
              <span
                v-for="(filled, i) in stars"
                :key="i"
                :class="filled ? 'text-[#f59e0b]' : 'text-[#475569]'"
                class="text-[12px] leading-none"
              >★</span>
              <span class="text-[10px] text-[#94a3b8] ml-1 font-medium">{{ item.rating }}/5</span>
            </div>
            <span v-else class="text-[10px] text-[#475569] uppercase tracking-wider font-semibold">
              Sem nota
            </span>
            <span class="text-[#475569]">·</span>
            <span class="text-[10px] text-[#94a3b8]" :title="`Adicionado em ${new Date(item.createdAt).toLocaleDateString('pt-BR')}`">
              {{ relativeDate(item.createdAt) }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <!-- Listing badge -->
          <button
            v-if="listingBadge"
            type="button"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#f59e0b] text-black text-[10px] font-bold uppercase tracking-wider transition-transform"
            :class="canList ? 'cursor-pointer hover:scale-105 hover:brightness-110' : 'cursor-default'"
            :disabled="!canList"
            :title="canList ? `${listingBadge.label} — clique para editar` : listingBadge.label"
            @click="canList && onListClick($event)"
          >
            <component :is="listingBadge.icon" :size="10" />
            <span>{{ listingBadge.label }}</span>
          </button>
          <!-- Anunciar -->
          <button
            v-else-if="canList"
            type="button"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#f59e0b]/40 text-[#f59e0b] text-[10px] font-semibold hover:bg-[#f59e0b] hover:text-black transition-colors"
            title="Anunciar na vitrine"
            @click="onListClick($event)"
          >
            <Plus :size="10" />
            <span>Anunciar</span>
          </button>

          <ChevronRight
            :size="18"
            class="text-[#475569] group-hover:text-[#f59e0b] group-hover:translate-x-0.5 transition-all"
          />
        </div>
      </div>

      <!-- Field chips (up to 5, with overflow indicator) -->
      <div v-if="fieldChips.length" class="flex flex-wrap items-center gap-1.5">
        <span
          v-for="chip in fieldChips"
          :key="chip.def.fieldKey"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#252640] border border-[#2e3050] text-[10px] leading-tight"
        >
          <span class="text-[#94a3b8] uppercase tracking-wider font-semibold">{{ chip.def.name }}</span>
          <span class="text-[#e2e8f0] font-medium">{{ formatChipValue(chip.def, chip.value) }}</span>
        </span>
        <span
          v-if="hiddenFieldsCount > 0"
          class="inline-flex items-center px-2 py-0.5 rounded-md bg-[#252640]/60 text-[10px] text-[#94a3b8] font-medium"
        >
          +{{ hiddenFieldsCount }}
        </span>
      </div>

      <!-- Comment preview -->
      <div v-if="item.comment" class="flex items-start gap-1.5 text-[#94a3b8]">
        <Quote :size="11" class="flex-shrink-0 mt-0.5 opacity-60" />
        <p class="text-[11px] italic line-clamp-2 leading-snug">{{ item.comment }}</p>
      </div>
    </div>
  </div>
</template>
