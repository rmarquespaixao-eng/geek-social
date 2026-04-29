<script setup lang="ts">
import { computed, ref } from 'vue'
import { Package, Trash2 } from 'lucide-vue-next'
import type { Collection, CollectionType, CollectionVisibility } from '../types'
import { useCollectionsStore } from '../composables/useCollections'
import CollectionCoverUpload from './CollectionCoverUpload.vue'

const props = withDefaults(defineProps<{
  collection: Collection
  /** Se `false`, esconde ações (delete, upload de capa, cycle de visibilidade). Default `true` (área "minhas coleções"). */
  owned?: boolean
}>(), {
  owned: true,
})

const emit = defineEmits<{
  click: [id: string]
  delete: [id: string]
  coverUpdated: [collection: Collection]
}>()

const store = useCollectionsStore()
const cyclingVisibility = ref(false)

const visibilityCycle: Record<CollectionVisibility, CollectionVisibility> = {
  public: 'friends_only',
  friends_only: 'private',
  private: 'public',
}

async function cycleVisibility() {
  if (cyclingVisibility.value) return
  cyclingVisibility.value = true
  const next = visibilityCycle[props.collection.visibility]
  await store.updateCollection(props.collection.id, { visibility: next })
  cyclingVisibility.value = false
}

const typeMeta: Record<CollectionType, { emoji: string; label: string; gradient: string; glow: string }> = {
  games:      { emoji: '🎮', label: 'Jogos',       gradient: 'from-violet-700/90 via-indigo-800 to-[#0f0f1a]',  glow: 'shadow-violet-500/20' },
  books:      { emoji: '📚', label: 'Livros',      gradient: 'from-amber-700/90 via-orange-900 to-[#0f0f1a]',   glow: 'shadow-amber-500/20' },
  cardgames:  { emoji: '🃏', label: 'Card Games',  gradient: 'from-emerald-700/90 via-teal-900 to-[#0f0f1a]',   glow: 'shadow-emerald-500/20' },
  boardgames: { emoji: '🎲', label: 'Boardgames',  gradient: 'from-sky-700/90 via-blue-900 to-[#0f0f1a]',       glow: 'shadow-sky-500/20' },
  custom:     { emoji: '⚙️', label: 'Customizado', gradient: 'from-slate-700/90 via-slate-800 to-[#0f0f1a]',    glow: 'shadow-slate-500/20' },
}

const meta = computed(() => typeMeta[props.collection.type])

const visibilityBadge = computed(() => {
  switch (props.collection.visibility) {
    case 'public':
      return { text: 'Pública', class: 'bg-[#22c55e]/25 text-[#4ade80] border-[#22c55e]/40' }
    case 'friends_only':
      return { text: 'Amigos', class: 'bg-[#3b82f6]/25 text-[#60a5fa] border-[#3b82f6]/40' }
    default:
      return { text: 'Privada', class: 'bg-black/50 text-[#cbd5e1] border-white/10' }
  }
})

const coverSrc = computed(() => {
  const url = props.collection.coverUrl
  if (!url) return ''
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${props.collection.updatedAt ?? ''}`
})
</script>

<template>
  <div
    class="group relative bg-[#1e2038] rounded-xl overflow-hidden cursor-pointer border border-[#252640] hover:border-[#f59e0b]/50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#f59e0b]/10"
    @click="emit('click', collection.id)"
  >
    <!-- Cover — wider aspect, more presence -->
    <div class="relative aspect-[5/3] overflow-hidden">
      <!-- Cover photo -->
      <img
        v-if="collection.coverUrl"
        :src="coverSrc"
        :alt="collection.name"
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
      />
      <!-- Placeholder: type-themed gradient + giant emoji + soft radial glow -->
      <div
        v-else
        class="relative w-full h-full flex items-center justify-center bg-gradient-to-br"
        :class="meta.gradient"
      >
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
        <span class="relative text-6xl select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-110">
          {{ meta.emoji }}
        </span>
      </div>

      <!-- Bottom gradient overlay for legibility -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      <!-- Top-right actions (apenas owner) -->
      <div
        v-if="owned"
        class="absolute top-2 right-2 flex items-center gap-1.5"
        @click.stop
      >
        <CollectionCoverUpload :collection-id="collection.id" @cover-updated="emit('coverUpdated', $event)" />
        <button
          class="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm hover:bg-red-600 flex items-center justify-center text-white/90 transition-all opacity-0 group-hover:opacity-100"
          title="Excluir coleção"
          @click="emit('delete', collection.id)"
        >
          <Trash2 :size="13" />
        </button>
      </div>

      <!-- Visibility badge — click cycles para owner; somente exibe para não-owner -->
      <div class="absolute top-2 left-2" @click.stop>
        <button
          v-if="owned"
          type="button"
          class="text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm transition-all hover:scale-105 disabled:opacity-60 disabled:cursor-wait"
          :class="visibilityBadge.class"
          :disabled="cyclingVisibility"
          title="Clique para alterar visibilidade"
          @click="cycleVisibility"
        >
          {{ cyclingVisibility ? '...' : visibilityBadge.text }}
        </button>
        <span
          v-else
          class="text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm"
          :class="visibilityBadge.class"
        >
          {{ visibilityBadge.text }}
        </span>
      </div>

      <!-- Title overlaid on bottom of cover -->
      <div class="absolute inset-x-0 bottom-0 p-3 pt-6">
        <p class="text-[15px] font-bold text-white leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] line-clamp-1">
          {{ collection.name }}
        </p>
      </div>
    </div>

    <!-- Info row below cover -->
    <div class="px-3 py-2.5 flex items-center justify-between gap-2">
      <!-- Type pill -->
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="text-base leading-none">{{ meta.emoji }}</span>
        <span class="text-[10px] uppercase tracking-wider text-[#94a3b8] font-semibold truncate">
          {{ meta.label }}
        </span>
      </div>

      <!-- Item counter -->
      <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#252640] border border-[#2e3050] flex-shrink-0">
        <Package :size="11" class="text-[#f59e0b]" />
        <span class="text-[12px] font-bold text-[#e2e8f0] leading-none">{{ collection.itemCount ?? 0 }}</span>
      </div>
    </div>

    <!-- Optional description (only if present) -->
    <p
      v-if="collection.description"
      class="px-3 pb-3 -mt-1 text-[11px] text-[#94a3b8] line-clamp-2 leading-snug"
    >
      {{ collection.description }}
    </p>
  </div>
</template>
