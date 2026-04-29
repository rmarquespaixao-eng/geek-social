import sharp from 'sharp'
import type { IJobsQueue } from '../../../contracts/jobs-queue.contract.js'
import type { ISteamApiClient, SteamOwnedGame } from '../../../contracts/steam-api.client.contract.js'
import type { IItemRepository } from '../../../contracts/item.repository.contract.js'
import type { IStorageService } from '../../../contracts/storage.service.contract.js'
import type { IImportProgressEmitter } from '../../../contracts/import-progress.emitter.contract.js'
import type { IImportBatchFinalizationRepository } from '../../../contracts/import-batch-finalization.repository.contract.js'
import type { ImportGameJobPayload } from '../jobs.types.js'
import type { CollectionsRepository } from '../../../../modules/collections/collections.repository.js'
import type { UsersRepository } from '../../../../modules/users/users.repository.js'
import { mapSteamGenreToPtBr } from '../../../../modules/integrations/steam/steam-genre.mapper.js'

const SNAPSHOT_TTL_MS = 30 * 60 * 1000

type SnapshotCache = Map<string, { games: Map<number, SteamOwnedGame>; expiresAt: number }>

/**
 * Início (timestamp) de cada batch — usado pra calcular durationMs no done.
 * O `recordBatchStartedAt` é chamado no primeiro job que toca o batch.
 */
const STARTED_AT = new Map<string, number>()

export function recordBatchStartedAt(batchId: string): void {
  if (!STARTED_AT.has(batchId)) STARTED_AT.set(batchId, Date.now())
}

export function getBatchStartedAt(batchId: string): number {
  return STARTED_AT.get(batchId) ?? Date.now()
}

export function clearBatchStartedAt(batchId: string): void {
  STARTED_AT.delete(batchId)
}

export type DoneNotifier = (params: {
  userId: string
  collectionId: string
  failed: number
}) => Promise<void>

export type SteamImportGameWorkerDeps = {
  jobs: IJobsQueue
  steamApi: ISteamApiClient
  itemsRepo: IItemRepository
  collectionsRepo: CollectionsRepository
  usersRepo: UsersRepository
  storage: IStorageService
  emitter: IImportProgressEmitter
  finalizationRepo: IImportBatchFinalizationRepository
  notifyOnDone: DoneNotifier
}

/**
 * Worker unificado de importação Steam: traz nome+playtime+cover, busca
 * appdetails, mapeia genre pra pt-BR, e grava o item completo em uma única
 * passada. Ao mover pro próximo jogo, o anterior já está totalmente preenchido.
 *
 * Rate-limit: o `SteamApiClient.serializeAppDetailsCall` enfileira chamadas
 * de appdetails com 1500ms entre cada uma globalmente — `teamConcurrency: 1`
 * (ver `app.ts`) e essa fila garantem que nunca se passe do limite da Steam.
 */
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

  async function processCover(itemId: string, appId: number): Promise<string | null> {
    const buf = await deps.steamApi.downloadCover(appId)
    if (!buf) return null
    const processed = await sharp(buf)
      .resize(800, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    const url = await deps.storage.upload(`items/${itemId}/cover.webp`, processed, 'image/webp')
    return url
  }

  return async function handle(payload: ImportGameJobPayload): Promise<void> {
    recordBatchStartedAt(payload.importBatchId)

    const user = await deps.usersRepo.findById(payload.userId)
    if (!user || !user.steamId) return // user desconectou Steam — silenciosamente desiste

    const collection = await deps.collectionsRepo.findById(payload.collectionId)
    if (!collection || collection.userId !== payload.userId) return // coleção foi deletada/movida

    const info = await getGameInfo(payload)
    if (!info) return

    // Rate-limited: 1500ms entre chamadas (ver SteamApiClient).
    // Se appdetails falha (jogo delistado, 5xx) → details=null e seguimos sem genre/dev/year.
    let details: Awaited<ReturnType<ISteamApiClient['getAppDetails']>> = null
    try {
      details = await deps.steamApi.getAppDetails(payload.appId)
    } catch {
      details = null
    }

    // Steam devolve genre em inglês — passa pelo mapper pra cair em uma opção
    // pt-BR válida do select `genre` (ou 'Outro').
    const enrichedFields: Record<string, unknown> = {}
    if (details) {
      const mappedGenre = mapSteamGenreToPtBr(details.genres[0])
      if (mappedGenre) enrichedFields.genre = mappedGenre
      const dev = details.developers[0]
      if (dev) enrichedFields.developer = dev
      const yearMatch = details.releaseDateRaw?.match(/\b(\d{4})\b/)
      if (yearMatch) enrichedFields.release_year = Number(yearMatch[1])
    }

    const existing = await deps.itemsRepo.findByCollectionAndAppId(payload.collectionId, payload.appId)
    let itemId: string

    if (existing) {
      // Re-import: preserva campos do usuário (rating/comment/status/completion_date)
      // mas atualiza playtime e enriched fields (caso a Steam tenha mudado).
      const mergedFields: Record<string, unknown> = {
        ...existing.fields,
        ...enrichedFields,
        steam_appid: payload.appId,
        playtime_minutes: info.playtimeForever,
      }
      const updates: { fields?: Record<string, unknown>; name?: string } = { fields: mergedFields }
      if (info.name && existing.name !== info.name) updates.name = info.name
      await deps.itemsRepo.update(existing.id, updates)
      itemId = existing.id
    } else {
      // Item novo: já cria com tudo preenchido (incluindo genre/dev/year do enrich).
      const created = await deps.itemsRepo.create({
        collectionId: payload.collectionId,
        name: info.name || `App ${payload.appId}`,
        fields: {
          ...enrichedFields,
          steam_appid: payload.appId,
          playtime_minutes: info.playtimeForever,
          status: 'Na fila',
        },
      })
      itemId = created.id

      // Cover só pra item novo. Existing preserva a cover anterior (do user
      // ou de import antigo) — não estourar storage com re-upload sem motivo.
      const coverUrl = await processCover(itemId, payload.appId)
      if (coverUrl) await deps.itemsRepo.update(itemId, { coverUrl })
    }

    // Progresso: o job atual ainda está `active` no pgboss; soma +1.
    const stats = await deps.jobs.getBatchStats(payload.importBatchId)
    const completedSoFar = stats.completedImports + 1
    const isLast = completedSoFar + stats.failedImports >= payload.expectedTotal

    deps.emitter.emitProgress(payload.userId, {
      batchId: payload.importBatchId,
      total: payload.expectedTotal,
      completed: completedSoFar,
      failed: stats.failedImports,
      stage: isLast ? 'done' : 'importing',
      currentName: info.name,
    })

    if (!isLast) return

    // Último: tenta finalizar (apenas o "vencedor" da inserção emite done).
    const failedGames = stats.failedImports
    const importedGames = Math.max(0, payload.expectedTotal - failedGames)
    const won = await deps.finalizationRepo.finalizeOnce({
      batchId: payload.importBatchId,
      userId: payload.userId,
      collectionId: payload.collectionId,
      total: payload.expectedTotal,
      imported: importedGames,
      updated: 0,
      failed: failedGames,
    })
    if (!won) return

    const startedAt = getBatchStartedAt(payload.importBatchId)
    deps.emitter.emitDone(payload.userId, {
      batchId: payload.importBatchId,
      total: payload.expectedTotal,
      imported: importedGames,
      updated: 0,
      failed: failedGames,
      collectionId: payload.collectionId,
      durationMs: Date.now() - startedAt,
    })
    await deps.notifyOnDone({
      userId: payload.userId,
      collectionId: payload.collectionId,
      failed: failedGames,
    })
    clearBatchStartedAt(payload.importBatchId)
  }
}
