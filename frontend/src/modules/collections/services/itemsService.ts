import { api } from '@/shared/http/api'
import type {
  Item, CreateItemPayload, UpdateItemPayload,
  ItemListQuery, ItemsPage, AllItemsPage, FieldFilterValue,
} from '../types'

function buildListParams(query: ItemListQuery): Record<string, string> {
  const params: Record<string, string> = {}
  if (query.q) params.q = query.q
  if (query.cursor) params.cursor = query.cursor
  if (query.limit) params.limit = String(query.limit)
  if (query.sort) params.sort = query.sort
  if (query.ratingMin !== undefined && query.ratingMin !== null) {
    params.rating_min = String(query.ratingMin)
  }
  if (query.hasCover !== undefined && query.hasCover !== null) {
    params.has_cover = query.hasCover ? 'true' : 'false'
  }
  if (query.collectionId) params.collection_id = query.collectionId
  for (const [key, f] of Object.entries(query.fieldFilters ?? {})) {
    if (!f) continue
    if (f.contains) params[`field_${key}`] = f.contains
    if (f.equalsAny && f.equalsAny.length > 0) params[`field_${key}`] = f.equalsAny.join(',')
    if (f.boolValue === true) params[`field_${key}`] = 'true'
    else if (f.boolValue === false) params[`field_${key}`] = 'false'
    if (f.gte !== undefined && f.gte !== null && f.gte !== '') params[`field_${key}_gte`] = String(f.gte)
    if (f.lte !== undefined && f.lte !== null && f.lte !== '') params[`field_${key}_lte`] = String(f.lte)
  }
  return params
}

/** @deprecated Use `listItemsPage` para paginação. Mantido para compat. */
export async function listItems(collectionId: string): Promise<Item[]> {
  const page = await listItemsPage(collectionId, { limit: 100 })
  return page.items
}

export async function listItemsPage(
  collectionId: string,
  query: ItemListQuery,
): Promise<ItemsPage> {
  const { data } = await api.get<ItemsPage>(`/collections/${collectionId}/items`, {
    params: buildListParams(query),
  })
  return data
}

export async function listAllItemsPage(query: ItemListQuery): Promise<AllItemsPage> {
  const { data } = await api.get<AllItemsPage>('/collections/items', {
    params: buildListParams(query),
  })
  return data
}

export type { FieldFilterValue }

export async function createItem(collectionId: string, payload: CreateItemPayload): Promise<Item> {
  const { data } = await api.post<Item>(`/collections/${collectionId}/items`, payload)
  return data
}

export async function getItem(collectionId: string, itemId: string): Promise<Item> {
  const { data } = await api.get<Item>(`/collections/${collectionId}/items/${itemId}`)
  return data
}

export async function updateItem(
  collectionId: string,
  itemId: string,
  payload: UpdateItemPayload,
): Promise<Item> {
  const { data } = await api.put<Item>(`/collections/${collectionId}/items/${itemId}`, payload)
  return data
}

export async function deleteItem(collectionId: string, itemId: string): Promise<void> {
  await api.delete(`/collections/${collectionId}/items/${itemId}`)
}

export async function uploadItemCover(collectionId: string, itemId: string, file: File): Promise<Item> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<Item>(
    `/collections/${collectionId}/items/${itemId}/cover`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}
