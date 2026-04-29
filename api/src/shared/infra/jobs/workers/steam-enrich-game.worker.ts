import type { IJobsQueue } from '../../../contracts/jobs-queue.contract.js'
import type { ISteamApiClient } from '../../../contracts/steam-api.client.contract.js'
import type { IItemRepository } from '../../../contracts/item.repository.contract.js'
import type { IImportProgressEmitter } from '../../../contracts/import-progress.emitter.contract.js'
import type { IImportBatchFinalizationRepository } from '../../../contracts/import-batch-finalization.repository.contract.js'
import type { EnrichGameJobPayload } from '../jobs.types.js'

export type EnrichDoneNotifier = (params: {
  userId: string
  collectionId: string
  failed: number
}) => Promise<void>

export type SteamEnrichGameWorkerDeps = {
  jobs: IJobsQueue
  steamApi: ISteamApiClient
  itemsRepo: IItemRepository
  emitter: IImportProgressEmitter
  finalizationRepo: IImportBatchFinalizationRepository
  notifyOnDone: EnrichDoneNotifier
  /** Marca o início (timestamp) do batch — usado pra calcular durationMs no done. */
  batchStartedAtMs: () => number
}

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

export function createSteamEnrichGameWorker(deps: SteamEnrichGameWorkerDeps) {
  return async function handle(payload: EnrichGameJobPayload): Promise<void> {
    recordBatchStartedAt(payload.importBatchId)

    const item = await deps.itemsRepo.findById(payload.itemId)
    if (!item) return // item deletado — ignora

    const details = await deps.steamApi.getAppDetails(payload.appId)
    if (details) {
      const newFields: Record<string, unknown> = { ...item.fields }
      let mutated = false

      const currentGenre = item.fields['genre']
      const newGenre = details.genres[0]?.description ?? null
      if (newGenre && (!currentGenre || currentGenre !== newGenre)) {
        newFields['genre'] = newGenre
        mutated = true
      }

      const currentDev = item.fields['developer']
      const newDev = details.developers[0] ?? null
      if (newDev && (!currentDev || currentDev !== newDev)) {
        newFields['developer'] = newDev
        mutated = true
      }

      const currentYear = item.fields['release_year']
      const yearMatch = details.releaseDateRaw?.match(/\b(\d{4})\b/)
      const newYear = yearMatch ? Number(yearMatch[1]) : null
      if (newYear && (!currentYear || currentYear !== newYear)) {
        newFields['release_year'] = newYear
        mutated = true
      }

      if (mutated) {
        await deps.itemsRepo.update(payload.itemId, { fields: newFields })
      }
    }

    const stats = await deps.jobs.getBatchStats(payload.importBatchId)
    // Internamente trabalhamos em jobs (imports + enriches = 2 * N).
    // O próprio job ainda está em `active`, não conta como completed — somamos +1.
    const totalExpectedJobs = payload.expectedTotalImports + payload.expectedTotalEnriches
    const totalDoneJobs = stats.completedImports + stats.completedEnriches
                        + stats.failedImports + stats.failedEnriches
                        + 1

    // O enriquecimento roda em background — não emitimos progress pra UI durante essa fase.
    // O usuário verá o banner como "concluído" assim que a importação termina e
    // será notificado via push quando o enrichment finalizar.
    if (totalDoneJobs < totalExpectedJobs) return

    // Tenta finalizar (apenas o vencedor da inserção emite done)
    // Cada jogo único pode falhar em import OU enrich (não ambos, pois enrich só roda após import OK).
    // Logo failedImports + failedEnriches = nº de jogos com qualquer falha (sem duplicar).
    const failedGames = stats.failedImports + stats.failedEnriches
    const importedGames = Math.max(0, payload.expectedTotalImports - failedGames)
    const won = await deps.finalizationRepo.finalizeOnce({
      batchId: payload.importBatchId,
      userId: payload.userId,
      collectionId: payload.collectionId,
      total: payload.expectedTotalImports,
      imported: importedGames,
      updated: 0,
      failed: failedGames,
    })
    if (!won) return

    const startedAt = getBatchStartedAt(payload.importBatchId)
    deps.emitter.emitDone(payload.userId, {
      batchId: payload.importBatchId,
      total: payload.expectedTotalImports,
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
