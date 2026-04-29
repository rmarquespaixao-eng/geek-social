import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createSteamEnrichGameWorker, clearBatchStartedAt, type SteamEnrichGameWorkerDeps,
} from '../../../../src/shared/infra/jobs/workers/steam-enrich-game.worker.js'
import type { Item } from '../../../../src/shared/contracts/item.repository.contract.js'
import type { EnrichGameJobPayload } from '../../../../src/shared/infra/jobs/jobs.types.js'

const USER_ID = 'u-1'
const COL_ID = 'c-1'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i-1', collectionId: COL_ID, name: 'Hollow Knight', coverUrl: null,
    fields: { steam_appid: 100, playtime_minutes: 120 },
    rating: null, comment: null,
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

function basePayload(overrides: Partial<EnrichGameJobPayload> = {}): EnrichGameJobPayload {
  return {
    userId: USER_ID, collectionId: COL_ID, itemId: 'i-1', appId: 100,
    importBatchId: 'b-1', expectedTotal: 2,
    expectedTotalImports: 2, expectedTotalEnriches: 2,
    ...overrides,
  }
}

function buildDeps(overrides: Partial<SteamEnrichGameWorkerDeps> = {}): SteamEnrichGameWorkerDeps {
  return {
    jobs: {
      enqueue: vi.fn(),
      registerWorker: vi.fn(),
      getBatchStats: vi.fn().mockResolvedValue({
        // Cenário "não-último": atual + 1 outro ainda pendentes (totalDone com +1 = 3 < 4 esperado)
        totalImports: 2, completedImports: 2, failedImports: 0,
        totalEnriches: 2, completedEnriches: 0, failedEnriches: 0,
      }),
      hasActiveBatchForUser: vi.fn(),
      start: vi.fn(), stop: vi.fn(),
    },
    steamApi: {
      getOwnedGames: vi.fn(),
      getAppDetails: vi.fn().mockResolvedValue({
        appId: 100, type: 'game', name: 'Hollow Knight',
        shortDescription: null, releaseDateRaw: '24 Feb, 2017',
        developers: ['Team Cherry'], publishers: ['Team Cherry'],
        genres: [{ id: '23', description: 'Indie' }],
      }),
      downloadCover: vi.fn(),
    },
    itemsRepo: {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeItem()),
      findByCollectionId: vi.fn(),
      findByCollectionAndAppId: vi.fn(),
      findExistingSteamItemsForUser: vi.fn(),
      update: vi.fn().mockResolvedValue(makeItem()),
      delete: vi.fn(),
    },
    emitter: {
      emitProgress: vi.fn(),
      emitDone: vi.fn(),
    },
    finalizationRepo: {
      finalizeOnce: vi.fn().mockResolvedValue(true),
      findByBatchId: vi.fn(),
    },
    notifyOnDone: vi.fn().mockResolvedValue(undefined),
    batchStartedAtMs: () => Date.now(),
    ...overrides,
  }
}

describe('steam-enrich-game worker', () => {
  beforeEach(() => {
    clearBatchStartedAt('b-1')
  })

  it('atualiza genre/release_year/developer quando vazios', async () => {
    const deps = buildDeps()
    const handle = createSteamEnrichGameWorker(deps)
    await handle(basePayload())

    expect(deps.itemsRepo.update).toHaveBeenCalledWith('i-1', {
      fields: expect.objectContaining({
        genre: 'Indie',
        developer: 'Team Cherry',
        release_year: 2017,
        steam_appid: 100, // preservado
        playtime_minutes: 120, // preservado
      }),
    })
  })

  it('preserva campos do usuário (rating/comment/status)', async () => {
    const deps = buildDeps()
    ;(deps.itemsRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeItem({
      fields: {
        steam_appid: 100, playtime_minutes: 500,
        rating: 5, comment: 'top demais', status: 'Zerado',
        completion_date: '2026-01-15',
      },
    }))
    const handle = createSteamEnrichGameWorker(deps)
    await handle(basePayload())

    const call = (deps.itemsRepo.update as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].fields).toMatchObject({
      rating: 5,
      comment: 'top demais',
      status: 'Zerado',
      completion_date: '2026-01-15',
    })
  })

  it('quando appdetails retorna null: ignora silenciosamente', async () => {
    const deps = buildDeps({
      steamApi: {
        getOwnedGames: vi.fn(),
        getAppDetails: vi.fn().mockResolvedValue(null),
        downloadCover: vi.fn(),
      },
    })
    const handle = createSteamEnrichGameWorker(deps)
    await handle(basePayload())
    expect(deps.itemsRepo.update).not.toHaveBeenCalled()
  })

  it('item deletado: ignora', async () => {
    const deps = buildDeps()
    ;(deps.itemsRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    const handle = createSteamEnrichGameWorker(deps)
    await handle(basePayload())
    expect(deps.steamApi.getAppDetails).not.toHaveBeenCalled()
  })

  it('último do batch: tenta finalizar e emite done quando vence (job atual ainda active conta +1)', async () => {
    const deps = buildDeps({
      jobs: {
        enqueue: vi.fn(),
        registerWorker: vi.fn(),
        getBatchStats: vi.fn().mockResolvedValue({
          // Atual está active (não conta como completed). Stats vê 2 imports + 1 enrich completos.
          // O worker conta +1 pra si mesmo → totalDone = 4 = totalExpected.
          totalImports: 2, completedImports: 2, failedImports: 0,
          totalEnriches: 2, completedEnriches: 1, failedEnriches: 0,
        }),
        hasActiveBatchForUser: vi.fn(),
        start: vi.fn(), stop: vi.fn(),
      },
    })
    const handle = createSteamEnrichGameWorker(deps)
    await handle(basePayload())
    expect(deps.finalizationRepo.finalizeOnce).toHaveBeenCalledWith(expect.objectContaining({
      batchId: 'b-1', userId: USER_ID, collectionId: COL_ID, total: 2, failed: 0,
    }))
    expect(deps.emitter.emitDone).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      batchId: 'b-1', collectionId: COL_ID, failed: 0,
    }))
    expect(deps.notifyOnDone).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID, collectionId: COL_ID, failed: 0,
    }))
  })

  it('último do batch mas finalizationRepo retorna false (perdeu race): não emite done', async () => {
    const deps = buildDeps({
      jobs: {
        enqueue: vi.fn(),
        registerWorker: vi.fn(),
        getBatchStats: vi.fn().mockResolvedValue({
          totalImports: 2, completedImports: 2, failedImports: 0,
          totalEnriches: 2, completedEnriches: 1, failedEnriches: 0,
        }),
        hasActiveBatchForUser: vi.fn(),
        start: vi.fn(), stop: vi.fn(),
      },
      finalizationRepo: {
        finalizeOnce: vi.fn().mockResolvedValue(false),
        findByBatchId: vi.fn(),
      },
    })
    const handle = createSteamEnrichGameWorker(deps)
    await handle(basePayload())
    expect(deps.emitter.emitDone).not.toHaveBeenCalled()
    expect(deps.notifyOnDone).not.toHaveBeenCalled()
  })

  it('não-último do batch: não tenta finalizar', async () => {
    const deps = buildDeps()
    const handle = createSteamEnrichGameWorker(deps)
    await handle(basePayload())
    expect(deps.finalizationRepo.finalizeOnce).not.toHaveBeenCalled()
    expect(deps.emitter.emitDone).not.toHaveBeenCalled()
  })

  it('não emite progress durante enriching (roda em background)', async () => {
    const deps = buildDeps()
    const handle = createSteamEnrichGameWorker(deps)
    await handle(basePayload())
    expect(deps.emitter.emitProgress).not.toHaveBeenCalled()
  })
})
