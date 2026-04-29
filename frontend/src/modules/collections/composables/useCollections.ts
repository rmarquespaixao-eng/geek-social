import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Collection, CreateCollectionPayload, UpdateCollectionPayload } from '../types'
import * as collectionsService from '../services/collectionsService'
import { extractApiError } from './extractApiError'

export const useCollectionsStore = defineStore('collections', () => {
  const collections = ref<Collection[]>([])
  const current = ref<Collection | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchCollections() {
    loading.value = true
    error.value = null
    try {
      collections.value = await collectionsService.listCollections()
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao carregar coleções')
    } finally {
      loading.value = false
    }
  }

  async function fetchCollection(id: string) {
    loading.value = true
    error.value = null
    try {
      current.value = await collectionsService.getCollection(id)
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao carregar coleção')
    } finally {
      loading.value = false
    }
  }

  async function createCollection(payload: CreateCollectionPayload): Promise<Collection | null> {
    loading.value = true
    error.value = null
    try {
      const created = await collectionsService.createCollection(payload)
      collections.value.unshift(created)
      return created
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao criar coleção')
      return null
    } finally {
      loading.value = false
    }
  }

  async function updateCollection(id: string, payload: UpdateCollectionPayload): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const updated = await collectionsService.updateCollection(id, payload)
      const idx = collections.value.findIndex((c) => c.id === id)
      if (idx !== -1) collections.value[idx] = { ...collections.value[idx], ...updated }
      if (current.value?.id === id) current.value = { ...current.value, ...updated }
      return true
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao atualizar coleção')
      return false
    } finally {
      loading.value = false
    }
  }

  async function deleteCollection(id: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await collectionsService.deleteCollection(id)
      collections.value = collections.value.filter((c) => c.id !== id)
      return true
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao excluir coleção')
      return false
    } finally {
      loading.value = false
    }
  }

  async function uploadCover(id: string, file: File): Promise<Collection | null> {
    loading.value = true
    error.value = null
    try {
      const updated = await collectionsService.uploadCollectionCover(id, file)
      const idx = collections.value.findIndex((c) => c.id === id)
      const merged = idx !== -1
        ? { ...collections.value[idx], ...updated }
        : updated
      if (idx !== -1) collections.value[idx] = merged
      if (current.value?.id === id) current.value = { ...current.value, ...updated }
      return merged
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao enviar capa')
      return null
    } finally {
      loading.value = false
    }
  }

  async function attachSchemaEntry(
    collectionId: string,
    fieldDefinitionId: string,
    isRequired = false,
  ) {
    error.value = null
    try {
      const entry = await collectionsService.attachSchemaEntry(collectionId, fieldDefinitionId, isRequired)
      if (current.value?.id === collectionId) {
        const fieldSchema = [...(current.value.fieldSchema ?? []), entry]
        current.value = { ...current.value, fieldSchema }
      }
      return entry
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao adicionar campo')
      return null
    }
  }

  async function detachSchemaEntry(collectionId: string, entryId: string) {
    error.value = null
    try {
      await collectionsService.detachSchemaEntry(collectionId, entryId)
      if (current.value?.id === collectionId) {
        const fieldSchema = (current.value.fieldSchema ?? []).filter((e) => e.id !== entryId)
        current.value = { ...current.value, fieldSchema }
      }
      return true
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao remover campo')
      return false
    }
  }

  async function updateSchemaEntry(
    collectionId: string,
    entryId: string,
    data: { isRequired: boolean },
  ) {
    error.value = null
    try {
      const updated = await collectionsService.updateSchemaEntry(collectionId, entryId, data)
      if (current.value?.id === collectionId) {
        const fieldSchema = (current.value.fieldSchema ?? []).map((e) => e.id === entryId ? updated : e)
        current.value = { ...current.value, fieldSchema }
      }
      return updated
    } catch (e: unknown) {
      error.value = extractApiError(e, 'Erro ao atualizar campo')
      return null
    }
  }

  return {
    collections,
    current,
    loading,
    error,
    fetchCollections,
    fetchCollection,
    createCollection,
    updateCollection,
    deleteCollection,
    uploadCover,
    attachSchemaEntry,
    detachSchemaEntry,
    updateSchemaEntry,
  }
})
