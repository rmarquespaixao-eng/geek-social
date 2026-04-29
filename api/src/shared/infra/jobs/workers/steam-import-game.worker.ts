import sharp from 'sharp'
import type { IJobsQueue } from '../../../contracts/jobs-queue.contract.js'
import type { ISteamApiClient, SteamOwnedGame } from '../../../contracts/steam-api.client.contract.js'
import type { IItemRepository } from '../../../contracts/item.repository.contract.js'
import type { IStorageService } from '../../../contracts/storage.service.contract.js'
import type { IImportProgressEmitter } from '../../../contracts/import-progress.emitter.contract.js'
import type { ImportGameJobPayload, EnrichGameJobPayload } from '../jobs.types.js'
import type { CollectionsRepository } from '../../../../modules/collections/collections.repository.js'
import type { UsersRepository } from '../../../../modules/users/users.repository.js'

const SNAPSHOT_TTL_MS = 30 * 60 * 1000

type SnapshotCache = Map<string, { games: Map<number, SteamOwnedGame>; expiresAt: number }>

export type SteamImportGameWorkerDeps = {
  jobs: IJobsQueue
  steamApi: ISteamApiClient
  itemsRepo: IItemRepository
  collectionsRepo: CollectionsRepository
  usersRepo: UsersRepository
  storage: IStorageService
  emitter: IImportProgressEmitter
}

export function createSteamImportGameWorker(deps: SteamImportGameWorkerDeps) {
  const snapshotCache: SnapshotCache = new Map()

  async function getGameInfo(payload: ImportGameJobPayload): Promise<SteamOwnedGame | null> {
    if (payload.gameSnapshot) {
      return {
        appId: payload.appId,
        name: payload.gameSnapshot.name,
        playtimeForever: payload.gameSnapshot.playtimeForever,
        imgIconUrl: null,
      }
    }
    const cached = snapshotCache.get(payload.importBatchId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.games.get(payload.appId) ?? null
    }
    const user = await deps.usersRepo.findById(payload.userId)
    if (!user?.steamId || !user.steamApiKey) return null
    const games = await deps.steamApi.getOwnedGames(user.steamId, user.steamApiKey)
    const map = new Map(games.map(g => [g.appId, g]))
    snapshotCache.set(payload.importBatchId, { games: map, expiresAt: Date.now() + SNAPSHOT_TTL_MS })
    return map.get(payload.appId) ?? null
  }

  async function processCover(itemId: string, appId: number, hadExisting: boolean): Promise<string | null> {
    if (hadExisting) return null // não sobrescreve cover quando item já existia
    const buf = await deps.steamApi.downloadCover(appId)
    if (!buf) return null
    const processed = await sharp(buf)
      .resize(800, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    const url = await deps.storage.upload(`items/${itemId}/cover.webp`, processed, 'image/webp')
    return url
  }

  async function emitImportingProgress(payload: ImportGameJobPayload, currentName: string) {
    const stats = await deps.jobs.getBatchStats(payload.importBatchId)
    // O próprio import-game ainda está `active` no pg-boss; conta +1 pra ele.
    const completedImports = stats.completedImports + 1
    // Reportamos APENAS o progresso da fase de importação (jogos baixados).
    // O enriquecimento (gênero/ano/dev) roda em background e só notifica via push no fim.
    deps.emitter.emitProgress(payload.userId, {
      batchId: payload.importBatchId,
      total: payload.expectedTotal,
      completed: completedImports,
      failed: stats.failedImports,
      stage: completedImports < payload.expectedTotal ? 'importing' : 'enriching',
      currentName,
    })
  }

  return async function handle(payload: ImportGameJobPayload): Promise<void> {
    const user = await deps.usersRepo.findById(payload.userId)
    if (!user || !user.steamId) {
      // user desconectou Steam — silenciosamente desiste
      return
    }
    const collection = await deps.collectionsRepo.findById(payload.collectionId)
    if (!collection || collection.userId !== payload.userId) {
      // coleção foi deletada ou movida
      return
    }

    const info = await getGameInfo(payload)
    if (!info) return

    const existing = await deps.itemsRepo.findByCollectionAndAppId(payload.collectionId, payload.appId)
    let itemId: string

    if (existing) {
      const updates: Record<string, unknown> = {}
      const newFields = { ...existing.fields }
      const currentPlaytime = Number(existing.fields['playtime_minutes'] ?? 0)
      if (currentPlaytime !== info.playtimeForever) {
        newFields['playtime_minutes'] = info.playtimeForever
        updates.fields = newFields
      }
      if (existing.name !== info.name && info.name) {
        updates.name = info.name
      }
      if (Object.keys(updates).length > 0) {
        await deps.itemsRepo.update(existing.id, updates)
      }
      itemId = existing.id
    } else {
      const created = await deps.itemsRepo.create({
        collectionId: payload.collectionId,
        name: info.name || `App ${payload.appId}`,
        fields: {
          steam_appid: payload.appId,
          playtime_minutes: info.playtimeForever,
          status: 'Na fila',
        },
      })
      itemId = created.id
    }

    const coverUrl = await processCover(itemId, payload.appId, !!existing)
    if (coverUrl) {
      await deps.itemsRepo.update(itemId, { coverUrl })
    }

    const enrichPayload: EnrichGameJobPayload = {
      userId: payload.userId,
      collectionId: payload.collectionId,
      itemId,
      appId: payload.appId,
      importBatchId: payload.importBatchId,
      expectedTotal: payload.expectedTotal,
      expectedTotalImports: payload.expectedTotal,
      expectedTotalEnriches: payload.expectedTotal,
    }
    await deps.jobs.enqueue('steam.enrich-game', enrichPayload, { retryLimit: 3, retryDelay: 30 })

    await emitImportingProgress(payload, info.name)
  }
}
