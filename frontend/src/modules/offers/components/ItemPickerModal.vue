<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronLeft, Image as ImageIcon, Search } from 'lucide-vue-next'
import AppModal from '@/shared/ui/AppModal.vue'
import { listCollections } from '@/modules/collections/services/collectionsService'
import { listItems } from '@/modules/collections/services/itemsService'
import type { Collection, Item } from '@/modules/collections/types'

const props = defineProps<{
  open: boolean
  /** IDs de itens já anunciados (filtra do picker para não permitir duplicar). */
  excludeItemIds?: string[]
}>()

const emit = defineEmits<{
  close: []
  pick: [item: { id: string; name: string }]
}>()

const collections = ref<Collection[]>([])
const collectionsLoading = ref(false)
const selectedCollectionId = ref<string | null>(null)
const items = ref<Item[]>([])
const itemsLoading = ref(false)
const search = ref('')

watch(() => props.open, (open) => {
  if (open) {
    selectedCollectionId.value = null
    items.value = []
    search.value = ''
    loadCollections()
  }
})

async function loadCollections() {
  collectionsLoading.value = true
  try {
    collections.value = await listCollections()
  } finally {
    collectionsLoading.value = false
  }
}

async function pickCollection(id: string) {
  selectedCollectionId.value = id
  items.value = []
  itemsLoading.value = true
  try {
    const all = await listItems(id)
    const exclude = new Set(props.excludeItemIds ?? [])
    items.value = all.filter(i => !exclude.has(i.id))
  } finally {
    itemsLoading.value = false
  }
}

function backToCollections() {
  selectedCollectionId.value = null
  items.value = []
}

function pickItem(item: Item) {
  emit('pick', { id: item.id, name: item.name })
}

const visibleItems = (() => {
  return () => {
    const q = search.value.trim().toLowerCase()
    if (!q) return items.value
    return items.value.filter(i => i.name.toLowerCase().includes(q))
  }
})()
</script>

<template>
  <Teleport to="body">
    <AppModal v-if="open" size="md" @close="emit('close')">
      <div class="p-5 space-y-4">
        <h2 class="text-base font-semibold text-(--color-text-primary)">
          Escolha um item para anunciar
        </h2>

        <!-- Step 1: pick collection -->
        <div v-if="!selectedCollectionId">
          <p class="text-xs font-medium text-(--color-text-secondary) mb-2">Suas coleções</p>
          <div v-if="collectionsLoading" class="py-6 flex justify-center">
            <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
          </div>
          <div v-else-if="collections.length === 0" class="py-4 text-sm text-(--color-text-muted) text-center">
            Você ainda não tem coleções.
          </div>
          <div v-else class="space-y-1 max-h-72 overflow-y-auto">
            <button
              v-for="c in collections"
              :key="c.id"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-(--color-bg-elevated)/50 text-left transition-colors"
              @click="pickCollection(c.id)"
            >
              <span class="text-sm text-(--color-text-primary)">{{ c.name }}</span>
              <span class="ml-auto text-[10px] text-(--color-text-muted)">{{ c.itemCount ?? 0 }} itens</span>
            </button>
          </div>
        </div>

        <!-- Step 2: pick item -->
        <div v-else>
          <button type="button" class="inline-flex items-center gap-1 text-xs text-(--color-text-muted) hover:text-(--color-text-primary) mb-2" @click="backToCollections">
            <ChevronLeft :size="12" />
            Voltar
          </button>

          <div class="relative mb-3">
            <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-muted)" />
            <input
              v-model="search"
              type="text"
              placeholder="Buscar item..."
              class="w-full pl-9 pr-3 py-2 rounded-lg bg-(--color-bg-elevated) text-(--color-text-primary) placeholder-(--color-text-muted) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-accent-amber)/30"
            />
          </div>

          <div v-if="itemsLoading" class="py-6 flex justify-center">
            <div class="w-5 h-5 border-2 border-(--color-accent-amber) border-t-transparent rounded-full animate-spin" />
          </div>
          <div v-else-if="items.length === 0" class="py-4 text-sm text-(--color-text-muted) text-center">
            Esta coleção não tem itens disponíveis para anunciar.
          </div>
          <div v-else class="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
            <button
              v-for="it in visibleItems()"
              :key="it.id"
              type="button"
              class="relative aspect-[2/3] rounded-lg border border-(--color-bg-elevated) hover:border-(--color-accent-amber) overflow-hidden bg-[#0f0f1a] transition-colors"
              @click="pickItem(it)"
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
        </div>

        <div class="flex justify-end pt-1">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            @click="emit('close')"
          >
            Cancelar
          </button>
        </div>
      </div>
    </AppModal>
  </Teleport>
</template>
