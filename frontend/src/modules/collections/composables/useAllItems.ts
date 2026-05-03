import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ItemWithCollection, ItemListQuery } from '../types'
import { listAllItemsPage } from '../services/itemsService'
import { extractApiError } from './extractApiError'

const PAGE_SIZE = 30

export const useAllItemsStore = defineStore('allItems', () => {
  const items = ref<ItemWithCollection[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const lastQuery = ref<ItemListQuery>({})
  const error = ref<string | null>(null)
  const initialized = ref(false)

  async function fetchPage(query: ItemListQuery = {}): Promise<void> {
    loading.value = true
    error.value = null
    lastQuery.value = { ...query }
    try {
      const page = await listAllItemsPage({
        ...query,
        limit: query.limit ?? PAGE_SIZE,
        cursor: null,
      })
      items.value = page.items
      nextCursor.value = page.nextCursor
      hasMore.value = page.nextCursor !== null
      initialized.value = true
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao carregar itens')
      items.value = []
      hasMore.value = false
      nextCursor.value = null
    } finally {
      loading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (!hasMore.value || !nextCursor.value || loadingMore.value) return
    loadingMore.value = true
    error.value = null
    try {
      const page = await listAllItemsPage({
        ...lastQuery.value,
        limit: lastQuery.value.limit ?? PAGE_SIZE,
        cursor: nextCursor.value,
      })
      const seen = new Set(items.value.map(i => i.id))
      for (const it of page.items) {
        if (!seen.has(it.id)) items.value.push(it)
      }
      nextCursor.value = page.nextCursor
      hasMore.value = page.nextCursor !== null
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao carregar mais itens')
    } finally {
      loadingMore.value = false
    }
  }

  async function refresh(): Promise<void> {
    if (!initialized.value) return
    try {
      const page = await listAllItemsPage({
        ...lastQuery.value,
        limit: Math.max(items.value.length, lastQuery.value.limit ?? PAGE_SIZE),
        cursor: null,
      })
      const freshMap = new Map(page.items.map(i => [i.id, i]))
      for (let i = 0; i < items.value.length; i++) {
        const updated = freshMap.get(items.value[i].id)
        if (updated) items.value[i] = { ...items.value[i], ...updated }
      }
      const existingIds = new Set(items.value.map(i => i.id))
      for (const f of page.items) {
        if (!existingIds.has(f.id)) items.value.push(f)
      }
      items.value = items.value.filter(i => freshMap.has(i.id))
      nextCursor.value = page.nextCursor
      hasMore.value = page.nextCursor !== null
    } catch {
      // best-effort
    }
  }

  return {
    items, loading, loadingMore, nextCursor, hasMore, error, initialized,
    fetchPage, loadMore, refresh,
  }
})
