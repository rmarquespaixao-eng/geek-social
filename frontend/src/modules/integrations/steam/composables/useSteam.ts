import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as steamService from '../services/steamService'
import type { SteamGame, StartImportPayload, StartImportResult } from '../services/steamService'
import { useAuthStore } from '@/shared/auth/authStore'
import { getSocket } from '@/shared/socket/socket'

export type ImportProgressEvent = {
  batchId: string
  total: number
  completed: number
  failed: number
  stage: 'importing' | 'done'
  currentName?: string
}

export type ImportDoneEvent = {
  batchId: string
  total: number
  imported: number
  updated: number
  failed: number
  collectionId: string
  durationMs: number
}

export type CurrentImport = {
  batchId: string
  collectionId: string
  total: number
  completed: number
  failed: number
  stage: 'importing' | 'done'
  currentName: string | null
}

export const useSteam = defineStore('steam', () => {
  const games = ref<SteamGame[] | null>(null)
  const gamesLoadedAt = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentImport = ref<CurrentImport | null>(null)

  const auth = useAuthStore()
  const isLinked = computed(() => Boolean(auth.user?.steamId))
  const steamId = computed(() => auth.user?.steamId ?? null)
  const linkedAt = computed(() => auth.user?.steamLinkedAt ?? null)
  const hasApiKey = computed(() => Boolean(auth.user?.hasSteamApiKey))

  async function fetchGames(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      games.value = await steamService.listGames()
      gamesLoadedAt.value = Date.now()
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } }
      error.value = e.response?.data?.error ?? 'STEAM_LIST_FAILED'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function unlink(): Promise<void> {
    await steamService.unlink()
    if (auth.user) {
      auth.setUser({ ...auth.user, steamId: null, steamLinkedAt: null })
    }
    games.value = null
    gamesLoadedAt.value = null
  }

  async function setApiKey(apiKey: string): Promise<void> {
    await steamService.setApiKey(apiKey)
    if (auth.user) {
      auth.setUser({ ...auth.user, hasSteamApiKey: true })
    }
  }

  async function clearApiKey(): Promise<void> {
    await steamService.clearApiKey()
    if (auth.user) {
      auth.setUser({ ...auth.user, hasSteamApiKey: false })
    }
  }

  async function startImport(payload: StartImportPayload): Promise<StartImportResult> {
    const result = await steamService.startImport(payload)
    currentImport.value = {
      batchId: result.batchId,
      collectionId: result.collectionId,
      total: result.totalJobs,
      completed: 0,
      failed: 0,
      stage: 'importing',
      currentName: null,
    }
    return result
  }

  async function fetchImportStatus(batchId: string): Promise<void> {
    try {
      const status = await steamService.getImportStatus(batchId)
      if (!currentImport.value || currentImport.value.batchId !== batchId) {
        currentImport.value = {
          batchId: status.batchId,
          collectionId: status.collectionId ?? '',
          total: status.total,
          completed: status.completed,
          failed: status.failed,
          stage: status.stage,
          currentName: null,
        }
      } else {
        currentImport.value.total = status.total
        currentImport.value.completed = status.completed
        currentImport.value.failed = status.failed
        currentImport.value.stage = status.stage
        if (status.collectionId) currentImport.value.collectionId = status.collectionId
      }
    } catch {
      // ignora — pode ser batch não existente
    }
  }

  function clearCurrentImport(): void {
    currentImport.value = null
  }

  function handleProgress(payload: ImportProgressEvent): void {
    if (!currentImport.value) {
      currentImport.value = {
        batchId: payload.batchId,
        collectionId: '',
        total: payload.total,
        completed: payload.completed,
        failed: payload.failed,
        stage: payload.stage,
        currentName: payload.currentName ?? null,
      }
      return
    }
    if (currentImport.value.batchId !== payload.batchId) return
    currentImport.value.total = payload.total
    currentImport.value.completed = payload.completed
    currentImport.value.failed = payload.failed
    currentImport.value.stage = payload.stage
    if (payload.currentName) currentImport.value.currentName = payload.currentName
  }

  function handleDone(payload: ImportDoneEvent): void {
    if (!currentImport.value || currentImport.value.batchId !== payload.batchId) {
      currentImport.value = {
        batchId: payload.batchId,
        collectionId: payload.collectionId,
        total: payload.total,
        completed: payload.imported,
        failed: payload.failed,
        stage: 'done',
        currentName: null,
      }
      return
    }
    currentImport.value.collectionId = payload.collectionId
    currentImport.value.total = payload.total
    currentImport.value.completed = payload.imported
    currentImport.value.failed = payload.failed
    currentImport.value.stage = 'done'
  }

  function init(): void {
    const sock = getSocket()
    if (!sock) return
    sock.off('steam:import:progress', handleProgress)
    sock.off('steam:import:done', handleDone)
    sock.on('steam:import:progress', handleProgress)
    sock.on('steam:import:done', handleDone)
  }

  function cleanup(): void {
    const sock = getSocket()
    if (!sock) return
    sock.off('steam:import:progress', handleProgress)
    sock.off('steam:import:done', handleDone)
  }

  return {
    games, gamesLoadedAt, loading, error, currentImport,
    isLinked, steamId, linkedAt, hasApiKey,
    fetchGames, unlink, setApiKey, clearApiKey,
    startImport, fetchImportStatus,
    clearCurrentImport, init, cleanup,
  }
})
