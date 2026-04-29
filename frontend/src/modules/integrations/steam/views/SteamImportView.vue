<template>
  <div class="min-h-screen bg-(--color-bg-base)">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-(--color-bg-base)/90 backdrop-blur border-b border-(--color-bg-elevated)">
      <div class="max-w-4xl mx-auto px-4 md:px-8 h-16 flex items-center gap-3">
        <button
          class="w-9 h-9 rounded-lg hover:bg-(--color-bg-elevated) flex items-center justify-center text-(--color-text-secondary) transition-colors"
          @click="$router.push('/settings')"
        >
          <ChevronLeft :size="20" />
        </button>
        <h1 class="text-base font-semibold text-(--color-text-primary)">Importar jogos da Steam</h1>
      </div>
    </div>

    <div class="max-w-4xl mx-auto px-4 md:px-8 py-6">
      <!-- Estado: erro privacidade -->
      <div v-if="loadError === 'STEAM_PROFILE_PRIVATE'"
           class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated) text-center">
        <Lock :size="48" class="mx-auto text-(--color-text-muted) mb-3" />
        <h2 class="text-base font-semibold text-(--color-text-primary) mb-2">Perfil Steam privado</h2>
        <p class="text-sm text-(--color-text-secondary) mb-4">
          Para importar seus jogos, sua biblioteca precisa estar visível.<br>
          Vá em Steam → Perfil → Editar perfil → Privacidade → "Detalhes do jogo" → Público.
        </p>
        <AppButton variant="primary" @click="loadGames">Tentar de novo</AppButton>
      </div>

      <!-- Estado: erro genérico -->
      <div v-else-if="loadError && !loadingGames"
           class="bg-(--color-bg-card) rounded-2xl p-6 border border-(--color-bg-elevated) text-center">
        <p class="text-sm text-(--color-danger) mb-4">{{ loadError }}</p>
        <AppButton variant="primary" @click="loadGames">Tentar de novo</AppButton>
      </div>

      <!-- Loading -->
      <div v-else-if="loadingGames" class="text-center py-12">
        <Loader2 :size="24" class="animate-spin mx-auto text-(--color-text-muted) mb-3" />
        <p class="text-sm text-(--color-text-muted)">Buscando seus jogos na Steam...</p>
      </div>

      <!-- Lista -->
      <template v-else-if="steam.games">
        <!-- Destino -->
        <div class="bg-(--color-bg-card) rounded-2xl p-5 border border-(--color-bg-elevated) mb-4">
          <p class="text-sm font-semibold text-(--color-text-primary) mb-3">Destino</p>
          <div class="flex flex-col gap-2">
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="radio" v-model="destinationMode" value="new" class="mt-1 accent-(--color-accent-amber)" />
              <div class="flex-1">
                <p class="text-sm text-(--color-text-primary)">Criar nova coleção</p>
                <input
                  v-if="destinationMode === 'new'"
                  v-model="newCollectionName"
                  placeholder="Nome da coleção"
                  class="mt-2 w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-sm text-(--color-text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/30"
                />
              </div>
            </label>
            <label class="flex items-start gap-3 cursor-pointer">
              <input type="radio" v-model="destinationMode" value="existing" class="mt-1 accent-(--color-accent-amber)" />
              <div class="flex-1">
                <p class="text-sm text-(--color-text-primary)">Adicionar a uma coleção existente</p>
                <select
                  v-if="destinationMode === 'existing'"
                  v-model="existingCollectionId"
                  class="mt-2 w-full px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-sm text-(--color-text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/30"
                >
                  <option value="">Selecione uma coleção...</option>
                  <option v-for="c in gamesCollections" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <p v-if="destinationMode === 'existing' && gamesCollections.length === 0" class="text-xs text-(--color-text-muted) mt-2">
                  Você não tem coleções de jogos. Crie uma primeiro ou use a opção acima.
                </p>
              </div>
            </label>
          </div>
        </div>

        <!-- Filtros -->
        <div class="bg-(--color-bg-card) rounded-2xl p-5 border border-(--color-bg-elevated) mb-4">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <button v-for="f in filters" :key="f.value"
                    class="px-3 py-1.5 rounded-lg text-xs transition-colors"
                    :class="activeFilter === f.value
                      ? 'bg-(--color-accent-amber) text-(--color-bg-base)'
                      : 'bg-(--color-bg-elevated) text-(--color-text-secondary) hover:bg-(--color-bg-elevated)/70'"
                    @click="activeFilter = f.value">
              {{ f.label }}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <Search :size="16" class="text-(--color-text-muted)" />
            <input
              v-model="searchQuery"
              placeholder="Buscar jogos..."
              class="flex-1 px-3 py-2 rounded-lg bg-(--color-bg-elevated) text-sm text-(--color-text-primary) focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/30"
            />
          </div>
          <div class="flex items-center justify-between mt-3 text-xs text-(--color-text-muted)">
            <span>Selecionados: <strong class="text-(--color-text-primary)">{{ selectedAppIds.size }} / {{ steam.games.length }}</strong></span>
            <div class="flex items-center gap-2">
              <button class="px-2 py-1 rounded hover:bg-(--color-bg-elevated)/50" @click="selectVisible">Selecionar visíveis</button>
              <button class="px-2 py-1 rounded hover:bg-(--color-bg-elevated)/50" @click="clearAll">Limpar</button>
            </div>
          </div>
        </div>

        <!-- Lista de jogos -->
        <div class="bg-(--color-bg-card) rounded-2xl border border-(--color-bg-elevated) overflow-hidden mb-4">
          <div v-if="visibleGames.length === 0" class="text-center py-8 text-sm text-(--color-text-muted)">
            Nenhum jogo encontrado com os filtros atuais.
          </div>
          <div v-else class="max-h-[60vh] overflow-y-auto">
            <SteamGameRow
              v-for="g in visibleGames" :key="g.appId"
              :game="g"
              :selected="selectedAppIds.has(g.appId)"
              :already-in-collection="isAlreadyImported(g)"
              @toggle="toggleSelect(g.appId)"
            />
          </div>
        </div>

        <!-- Ações -->
        <div class="flex justify-between items-center">
          <p v-if="importError" class="text-sm text-(--color-danger)">{{ importError }}</p>
          <div class="flex gap-2 ml-auto">
            <AppButton variant="secondary" @click="$router.push('/settings')">Cancelar</AppButton>
            <AppButton
              variant="primary"
              :loading="importing"
              :disabled="selectedAppIds.size === 0 || !destinationValid"
              @click="submitImport"
            >
              Importar {{ selectedAppIds.size }} {{ selectedAppIds.size === 1 ? 'jogo' : 'jogos' }}
            </AppButton>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeft, Lock, Loader2, Search } from 'lucide-vue-next'
import { useSteam } from '../composables/useSteam'
import { useCollectionsStore } from '@/modules/collections/composables/useCollections'
import AppButton from '@/shared/ui/AppButton.vue'
import SteamGameRow from '../components/SteamGameRow.vue'
import type { SteamGame } from '../services/steamService'

const router = useRouter()
const route = useRoute()
const steam = useSteam()
const collectionsStore = useCollectionsStore()

const destinationMode = ref<'new' | 'existing'>('new')
const newCollectionName = ref('Steam')
const existingCollectionId = ref('')
const activeFilter = ref<'all' | 'played' | 'unplayed' | 'top20'>('all')
const searchQuery = ref('')
const selectedAppIds = ref<Set<number>>(new Set())
const importing = ref(false)
const importError = ref<string | null>(null)
const loadingGames = ref(false)
const loadError = ref<string | null>(null)

const filters = [
  { value: 'all' as const, label: 'Todos' },
  { value: 'played' as const, label: 'Jogados ≥1h' },
  { value: 'unplayed' as const, label: 'Nunca jogados' },
  { value: 'top20' as const, label: 'Top 20 mais jogados' },
]

const gamesCollections = computed(() =>
  collectionsStore.collections.filter(c => c.type === 'games'),
)

const destinationValid = computed(() => {
  if (destinationMode.value === 'new') return newCollectionName.value.trim().length > 0
  return Boolean(existingCollectionId.value)
})

const targetCollectionId = computed(() =>
  destinationMode.value === 'existing' ? existingCollectionId.value : null,
)

function isAlreadyImported(g: SteamGame): boolean {
  if (!targetCollectionId.value) return false
  return g.existingCollectionIds.includes(targetCollectionId.value)
}

const visibleGames = computed<SteamGame[]>(() => {
  if (!steam.games) return []
  let list = [...steam.games]
  if (activeFilter.value === 'played') list = list.filter(g => g.playtimeForever >= 60)
  if (activeFilter.value === 'unplayed') list = list.filter(g => g.playtimeForever === 0)
  if (activeFilter.value === 'top20') {
    list = list.sort((a, b) => b.playtimeForever - a.playtimeForever).slice(0, 20)
  } else {
    list = list.sort((a, b) => b.playtimeForever - a.playtimeForever)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(g => g.name.toLowerCase().includes(q))
  }
  return list
})

function toggleSelect(appId: number) {
  if (selectedAppIds.value.has(appId)) selectedAppIds.value.delete(appId)
  else selectedAppIds.value.add(appId)
  // força reatividade
  selectedAppIds.value = new Set(selectedAppIds.value)
}

// Quando muda o destino, deseleciona jogos que viraram "já importados" lá
watch(targetCollectionId, () => {
  if (!steam.games) return
  const next = new Set(selectedAppIds.value)
  for (const g of steam.games) {
    if (isAlreadyImported(g)) next.delete(g.appId)
  }
  selectedAppIds.value = next
})

function selectVisible() {
  const next = new Set(selectedAppIds.value)
  for (const g of visibleGames.value) {
    if (!isAlreadyImported(g)) next.add(g.appId)
  }
  selectedAppIds.value = next
}

function clearAll() {
  selectedAppIds.value = new Set()
}

async function loadGames() {
  loadingGames.value = true
  loadError.value = null
  try {
    await steam.fetchGames()
  } catch (err) {
    const e = err as { response?: { data?: { error?: string } } }
    loadError.value = e.response?.data?.error ?? steam.error ?? 'STEAM_LIST_FAILED'
  } finally {
    loadingGames.value = false
  }
}

async function submitImport() {
  importError.value = null
  importing.value = true
  try {
    const snapshot = (steam.games ?? [])
      .filter(g => selectedAppIds.value.has(g.appId))
      .map(g => ({ appId: g.appId, name: g.name, playtimeForever: g.playtimeForever }))

    const payload = destinationMode.value === 'new'
      ? {
          newCollectionName: newCollectionName.value.trim(),
          appIds: Array.from(selectedAppIds.value),
          gamesSnapshot: snapshot,
        }
      : {
          collectionId: existingCollectionId.value,
          appIds: Array.from(selectedAppIds.value),
          gamesSnapshot: snapshot,
        }

    const result = await steam.startImport(payload)
    router.push(`/collections/${result.collectionId}`)
  } catch (err) {
    const e = err as { response?: { data?: { error?: string } } }
    importError.value = e.response?.data?.error ?? 'Falha ao iniciar importação'
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadGames(), collectionsStore.fetchCollections()])

  // Pré-seleciona destino se veio da rota /collections/:id via query
  const presetId = route.query.collectionId as string | undefined
  if (presetId && gamesCollections.value.some(c => c.id === presetId)) {
    destinationMode.value = 'existing'
    existingCollectionId.value = presetId
  }
})
</script>
