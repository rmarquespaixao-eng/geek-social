import { api } from '@/shared/http/api'

export type SteamGame = {
  appId: number
  name: string
  playtimeForever: number
  imgIconUrl: string | null
  existingCollectionIds: string[]
}

export type StartImportPayload = {
  collectionId?: string
  newCollectionName?: string
  appIds: number[]
  gamesSnapshot?: Array<{ appId: number; name: string; playtimeForever: number }>
}

export type StartImportResult = {
  batchId: string
  collectionId: string
  totalJobs: number
}

export type ImportStatus = {
  batchId: string
  total: number
  completed: number
  failed: number
  stage: 'importing' | 'done'
  collectionId: string | null
  finishedAt: string | null
}

export async function startLogin(): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>('/integrations/steam/login')
  return data
}

export async function listGames(): Promise<SteamGame[]> {
  const { data } = await api.get<{ games: SteamGame[] }>('/integrations/steam/games')
  return data.games
}

export async function unlink(): Promise<void> {
  await api.delete('/integrations/steam/link')
}

export async function setApiKey(apiKey: string): Promise<void> {
  await api.put('/integrations/steam/api-key', { apiKey })
}

export async function clearApiKey(): Promise<void> {
  await api.delete('/integrations/steam/api-key')
}

export async function startImport(payload: StartImportPayload): Promise<StartImportResult> {
  const { data } = await api.post<StartImportResult>('/integrations/steam/import', payload)
  return data
}

export async function getImportStatus(batchId: string): Promise<ImportStatus> {
  const { data } = await api.get<ImportStatus>(`/integrations/steam/import/${batchId}/status`)
  return data
}
