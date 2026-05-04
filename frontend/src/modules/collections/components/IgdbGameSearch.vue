<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search, Loader2, X } from 'lucide-vue-next'
import { searchIgdbGames, type IgdbGame } from '../services/igdbService'

const emit = defineEmits<{
  (e: 'select', game: IgdbGame): void
}>()

const query = ref('')
const results = ref<IgdbGame[]>([])
const loading = ref(false)
const open = ref(false)
const error = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!val.trim()) {
    results.value = []
    open.value = false
    return
  }
  loading.value = true
  error.value = false
  debounceTimer = setTimeout(async () => {
    try {
      results.value = await searchIgdbGames(val.trim())
      open.value = true
    } catch {
      error.value = true
      results.value = []
    } finally {
      loading.value = false
    }
  }, 400)
})

function select(game: IgdbGame) {
  emit('select', game)
  query.value = ''
  results.value = []
  open.value = false
}

function clear() {
  query.value = ''
  results.value = []
  open.value = false
}
</script>

<template>
  <div class="relative">
    <div class="relative flex items-center">
      <Search :size="14" class="absolute left-3 text-[#475569] pointer-events-none" />
      <input
        v-model="query"
        type="text"
        placeholder="Buscar jogo na IGDB..."
        class="w-full bg-[#1e2038] border border-[#252640] hover:border-[#f59e0b]/40 focus:border-[#f59e0b] text-[#e2e8f0] placeholder-[#475569] text-[13px] pl-8 pr-8 py-2.5 rounded-lg outline-none transition-colors"
        @focus="open = results.length > 0"
        @blur.capture="setTimeout(() => { open = false }, 150)"
      />
      <Loader2 v-if="loading" :size="14" class="absolute right-3 text-[#94a3b8] animate-spin" />
      <button
        v-else-if="query"
        type="button"
        class="absolute right-3 text-[#475569] hover:text-[#94a3b8] transition-colors"
        @click="clear"
      >
        <X :size="14" />
      </button>
    </div>

    <div
      v-if="open && results.length > 0"
      class="absolute z-50 mt-1 w-full bg-[#1a1b2e] border border-[#252640] rounded-xl shadow-xl overflow-hidden"
    >
      <ul class="max-h-72 overflow-y-auto divide-y divide-[#252640]">
        <li
          v-for="game in results"
          :key="game.id"
          class="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[#252640] transition-colors"
          @mousedown.prevent="select(game)"
        >
          <img
            v-if="game.coverUrl"
            :src="game.coverUrl.replace('t_cover_big', 't_thumb')"
            :alt="game.name"
            class="w-9 h-12 object-cover rounded flex-shrink-0 bg-[#252640]"
          />
          <div v-else class="w-9 h-12 rounded flex-shrink-0 bg-[#252640]" />
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold text-[#e2e8f0] truncate">{{ game.name }}</p>
            <p class="text-[11px] text-[#94a3b8] truncate">
              <span v-if="game.releaseYear">{{ game.releaseYear }}</span>
              <span v-if="game.releaseYear && game.platform"> · </span>
              <span v-if="game.platform">{{ game.platform }}</span>
              <span v-if="game.developer && (game.releaseYear || game.platform)"> · </span>
              <span v-if="game.developer">{{ game.developer }}</span>
            </p>
          </div>
        </li>
      </ul>
    </div>

    <p v-if="error" class="text-[11px] text-red-400 mt-1">Erro ao buscar jogos. Tente novamente.</p>
    <p v-if="open && !loading && query && results.length === 0 && !error" class="text-[11px] text-[#475569] mt-1">Nenhum jogo encontrado.</p>
  </div>
</template>
