// src/modules/events/composables/useEvents.ts
import { computed, reactive, ref } from 'vue'
import { useEventsStore } from '../stores/eventsStore'
import type { EventListFilters, EventType } from '../types'

export interface DiscoverFilters {
  date: 'all' | '7d' | '30d'
  type: EventType | 'all'
  cidade: string
}

function buildFilters(state: DiscoverFilters): EventListFilters {
  const filters: EventListFilters = {}
  if (state.type !== 'all') filters.type = state.type
  if (state.cidade.trim()) filters.cidade = state.cidade.trim()
  if (state.date === '7d') {
    filters.from = new Date().toISOString()
    filters.to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  } else if (state.date === '30d') {
    filters.from = new Date().toISOString()
    filters.to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }
  return filters
}

export function useEvents() {
  const store = useEventsStore()
  const filters = reactive<DiscoverFilters>({
    date: 'all',
    type: 'all',
    cidade: '',
  })
  const initialized = ref(false)

  const events = computed(() => store.discoverEvents)
  const loading = computed(() => store.discoverLoading)
  const hasMore = computed(() => store.discoverHasMore)

  async function load() {
    initialized.value = true
    await store.fetchDiscover(buildFilters(filters))
  }

  async function applyFilters() {
    await store.fetchDiscover(buildFilters(filters))
  }

  async function loadMore() {
    if (!store.discoverHasMore || store.discoverLoading) return
    await store.fetchDiscover(
      { ...buildFilters(filters), cursor: store.discoverNextCursor },
      true,
    )
  }

  return {
    filters,
    events,
    loading,
    hasMore,
    initialized,
    load,
    applyFilters,
    loadMore,
  }
}
