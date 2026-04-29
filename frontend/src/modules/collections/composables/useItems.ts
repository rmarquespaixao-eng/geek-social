import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Item, CreateItemPayload, UpdateItemPayload, ItemListQuery } from '../types'
import * as itemsService from '../services/itemsService'
import { useCollectionsStore } from './useCollections'
import { extractApiError } from './extractApiError'

const PAGE_SIZE = 30

function bumpCollectionCount(collectionId: string, delta: number) {
  const collectionsStore = useCollectionsStore()
  const idx = collectionsStore.collections.findIndex((c) => c.id === collectionId)
  if (idx !== -1) {
    const current = collectionsStore.collections[idx]
    collectionsStore.collections[idx] = { ...current, itemCount: Math.max(0, (current.itemCount ?? 0) + delta) }
  }
  if (collectionsStore.current?.id === collectionId) {
    collectionsStore.current = {
      ...collectionsStore.current,
      itemCount: Math.max(0, (collectionsStore.current.itemCount ?? 0) + delta),
    }
  }
}

export const useItemsStore = defineStore('items', () => {
  const items = ref<Item[]>([])
  const current = ref<Item | null>(null)
  const loading = ref(false)
  const loadingMore = ref(false)
  const nextCursor = ref<string | null>(null)
  const hasMore = ref(false)
  const lastQuery = ref<ItemListQuery>({})
  const lastCollectionId = ref<string | null>(null)
  const error = ref<string | null>(null)

  /** Carrega a primeira página com a query atual; substitui a lista. */
  async function fetchPage(collectionId: string, query: ItemListQuery = {}): Promise<void> {
    loading.value = true
    error.value = null
    lastCollectionId.value = collectionId
    lastQuery.value = { ...query }
    try {
      const page = await itemsService.listItemsPage(collectionId, {
        ...query,
        limit: query.limit ?? PAGE_SIZE,
        cursor: null,
      })
      items.value = page.items
      nextCursor.value = page.nextCursor
      hasMore.value = page.nextCursor !== null
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao carregar itens')
      items.value = []
      hasMore.value = false
      nextCursor.value = null
    } finally {
      loading.value = false
    }
  }

  /** Carrega a próxima página usando o cursor armazenado e adiciona ao fim. */
  async function loadMore(): Promise<void> {
    if (!hasMore.value || !nextCursor.value || !lastCollectionId.value) return
    if (loadingMore.value) return
    loadingMore.value = true
    error.value = null
    try {
      const page = await itemsService.listItemsPage(lastCollectionId.value, {
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

  /** @deprecated mantido para compat — chama fetchPage sem query. */
  async function fetchItems(collectionId: string) {
    await fetchPage(collectionId, {})
  }

  /**
   * Atualiza a lista sem disparar `loading` (refresh silencioso durante import Steam).
   * Recarrega a primeira página com a query atual.
   */
  async function refreshItems(collectionId: string): Promise<void> {
    let pageItems: Item[]
    try {
      const page = await itemsService.listItemsPage(collectionId, {
        ...lastQuery.value,
        limit: Math.max(items.value.length, lastQuery.value.limit ?? PAGE_SIZE),
        cursor: null,
      })
      pageItems = page.items
      nextCursor.value = page.nextCursor
      hasMore.value = page.nextCursor !== null
    } catch {
      return // refresh é best-effort
    }
    const freshMap = new Map(pageItems.map(i => [i.id, i]))
    for (let i = 0; i < items.value.length; i++) {
      const updated = freshMap.get(items.value[i].id)
      if (updated) items.value[i] = { ...items.value[i], ...updated }
    }
    const existingIds = new Set(items.value.map(i => i.id))
    for (const f of pageItems) {
      if (!existingIds.has(f.id)) items.value.push(f)
    }
    items.value = items.value.filter(i => freshMap.has(i.id))
  }

  async function fetchItem(collectionId: string, itemId: string) {
    loading.value = true
    error.value = null
    try {
      current.value = await itemsService.getItem(collectionId, itemId)
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao carregar item')
    } finally {
      loading.value = false
    }
  }

  async function createItem(collectionId: string, payload: CreateItemPayload): Promise<Item | null> {
    loading.value = true
    error.value = null
    try {
      const created = await itemsService.createItem(collectionId, payload)
      items.value.unshift(created)
      bumpCollectionCount(collectionId, +1)
      return created
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao criar item')
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateItem(
    collectionId: string,
    itemId: string,
    payload: UpdateItemPayload,
  ): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const updated = await itemsService.updateItem(collectionId, itemId, payload)
      const idx = items.value.findIndex((i) => i.id === itemId)
      if (idx !== -1) items.value[idx] = { ...items.value[idx], ...updated }
      if (current.value?.id === itemId) current.value = { ...current.value, ...updated }
      return true
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao atualizar item')
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteItem(collectionId: string, itemId: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await itemsService.deleteItem(collectionId, itemId)
      items.value = items.value.filter((i) => i.id !== itemId)
      bumpCollectionCount(collectionId, -1)
      return true
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao excluir item')
      return false
    } finally {
      loading.value = false
    }
  }

  async function uploadItemCover(collectionId: string, itemId: string, file: File): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      // Backend retorna apenas { coverUrl } — fazer merge para preservar name/fields/etc
      const updated = await itemsService.uploadItemCover(collectionId, itemId, file)
      const idx = items.value.findIndex((i) => i.id === itemId)
      if (idx !== -1) items.value[idx] = { ...items.value[idx], ...updated }
      if (current.value?.id === itemId) current.value = { ...current.value, ...updated }
      return true
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao enviar capa do item')
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    items,
    current,
    loading,
    loadingMore,
    hasMore,
    nextCursor,
    error,
    fetchPage,
    loadMore,
    fetchItems,
    refreshItems,
    fetchItem,
    createItem,
    updateItem,
    deleteItem,
    uploadItemCover,
  }
})
