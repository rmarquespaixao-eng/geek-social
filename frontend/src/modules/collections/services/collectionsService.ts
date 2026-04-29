import { api } from '@/shared/http/api'
import type {
  Collection,
  CollectionSchemaEntry,
  CreateCollectionPayload,
  UpdateCollectionPayload,
  FieldDefinition,
  CreateFieldDefinitionPayload,
} from '../types'

export async function listCollections(): Promise<Collection[]> {
  const { data } = await api.get<Collection[]>('/collections')
  return data
}

export async function createCollection(payload: CreateCollectionPayload): Promise<Collection> {
  const { data } = await api.post<Collection>('/collections', payload)
  return data
}

export async function getCollection(id: string): Promise<Collection> {
  const { data } = await api.get<Collection>(`/collections/${id}`)
  return data
}

export async function updateCollection(id: string, payload: UpdateCollectionPayload): Promise<Collection> {
  const { data } = await api.put<Collection>(`/collections/${id}`, payload)
  return data
}

export async function deleteCollection(id: string): Promise<void> {
  await api.delete(`/collections/${id}`)
}

export async function uploadCollectionIcon(id: string, file: File): Promise<Collection> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<Collection>(`/collections/${id}/icon`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function uploadCollectionCover(id: string, file: File): Promise<Collection> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<Collection>(`/collections/${id}/cover`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function listPublicCollections(userId: string): Promise<Collection[]> {
  const { data } = await api.get<Collection[]>(`/users/${userId}/collections`)
  return data
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
