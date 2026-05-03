import { api } from '@/shared/http/api'
import type {
  Collection,
  CollectionType,
  CollectionSchemaEntry,
  CreateCollectionPayload,
  UpdateCollectionPayload,
  FieldDefinition,
  CreateFieldDefinitionPayload,
} from '../types'

const VALID_TYPES = new Set<CollectionType>(['games', 'books', 'cardgames', 'boardgames', 'custom'])

function normalizeCollection(raw: Record<string, unknown>): Collection {
  const key = (raw.collectionTypeKey ?? raw.type) as string | null
  const type: CollectionType = (key && VALID_TYPES.has(key as CollectionType))
    ? (key as CollectionType)
    : 'custom'
  return { ...raw, type } as unknown as Collection
}

function normalizeList(raw: Record<string, unknown>[]): Collection[] {
  return raw.map(normalizeCollection)
}

export async function listCollections(): Promise<Collection[]> {
  const { data } = await api.get<Record<string, unknown>[]>('/collections')
  return normalizeList(data)
}

export async function createCollection(payload: CreateCollectionPayload): Promise<Collection> {
  const { data } = await api.post<Record<string, unknown>>('/collections', payload)
  return normalizeCollection(data)
}

export async function getCollection(id: string): Promise<Collection> {
  const { data } = await api.get<Record<string, unknown>>(`/collections/${id}`)
  return normalizeCollection(data)
}

export async function updateCollection(id: string, payload: UpdateCollectionPayload): Promise<Collection> {
  const { data } = await api.put<Record<string, unknown>>(`/collections/${id}`, payload)
  return normalizeCollection(data)
}

export async function deleteCollection(id: string): Promise<void> {
  await api.delete(`/collections/${id}`)
}

export async function uploadCollectionIcon(id: string, file: File): Promise<Collection> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<Record<string, unknown>>(`/collections/${id}/icon`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return normalizeCollection(data)
}

export async function uploadCollectionCover(id: string, file: File): Promise<Collection> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<Record<string, unknown>>(`/collections/${id}/cover`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return normalizeCollection(data)
}

export async function listPublicCollections(userId: string): Promise<Collection[]> {
  const { data } = await api.get<Record<string, unknown>[]>(`/users/${userId}/collections`)
  return normalizeList(data)
}

// Field Definitions (biblioteca do usuário)

export async function listFieldDefinitions(): Promise<FieldDefinition[]> {
  const { data } = await api.get<FieldDefinition[]>('/field-definitions')
  return data
}

export async function createFieldDefinition(payload: CreateFieldDefinitionPayload): Promise<FieldDefinition> {
  const { data } = await api.post<FieldDefinition>('/field-definitions', payload)
  return data
}

export async function deleteFieldDefinition(id: string): Promise<void> {
  await api.delete(`/field-definitions/${id}`)
}

// Schema da coleção (anexar/remover/editar campos)

export async function attachSchemaEntry(
  collectionId: string,
  fieldDefinitionId: string,
  isRequired = false,
): Promise<CollectionSchemaEntry> {
  const { data } = await api.post<CollectionSchemaEntry>(
    `/collections/${collectionId}/schema`,
    { fieldDefinitionId, isRequired },
  )
  return data
}

export async function detachSchemaEntry(collectionId: string, entryId: string): Promise<void> {
  await api.delete(`/collections/${collectionId}/schema/${entryId}`)
}

export async function updateSchemaEntry(
  collectionId: string,
  entryId: string,
  data: { isRequired: boolean },
): Promise<CollectionSchemaEntry> {
  const res = await api.patch<CollectionSchemaEntry>(
    `/collections/${collectionId}/schema/${entryId}`,
    data,
  )
  return res.data
}
