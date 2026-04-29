import { describe, it, expect, vi } from 'vitest'

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-webp')),
  })),
}))

import {
  createSteamImportGameWorker, clearBatchStartedAt,
  type SteamImportGameWorkerDeps,
} from '../../../../src/shared/infra/jobs/workers/steam-import-game.worker.js'
import type { Item } from '../../../../src/shared/contracts/item.repository.contract.js'
import type { User } from '../../../../src/shared/contracts/user.repository.contract.js'
import type { ImportGameJobPayload } from '../../../../src/shared/infra/jobs/jobs.types.js'

const USER_ID = 'u-1'
const COL_ID = 'c-1'
const APP_ID = 100

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID, email: 'u@x.com', passwordHash: null, displayName: 'U',
    bio: null, avatarUrl: null, coverUrl: null, privacy: 'public',
    keycloakId: null, emailVerified: true, showPresence: true, showReadReceipts: true,
    steamId: '76561198000000001', steamLinkedAt: new Date(), steamApiKey: 'ABCDEF0123456789ABCDEF0123456789',
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i-1', collectionId: COL_ID, name: 'Old Name', coverUrl: null,
    fields: {}, rating: null, comment: null,
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

function basePayload(overrides: Partial<ImportGameJobPayload> = {}): ImportGameJobPayload {
  return {
    userId: USER_ID, collectionId: COL_ID, appId: APP_ID,
    importBatchId: 'b-1', expectedTotal: 2,
    gameSnapshot: { name: 'Hollow Knight', playtimeForever: 2820 },
    ...overrides,
  }
}

const APP_DETAILS_HOLLOW = {
  appId: APP_ID, type: 'game', name: 'Hollow Knight',
  shortDescription: null, releaseDateRaw: '24 Feb, 2017',
  developers: ['Team Cherry'], publishers: ['Team Cherry'],
  genres: [{ id: '23', description: 'Indie' }],
}

function buildDeps(overrides: Partial<SteamImportGameWorkerDeps> = {}): SteamImportGameWorkerDeps {
  return {
    jobs: {
      enqueue: vi.fn().mockResolvedValue('job-id'),
      registerWorker: vi.fn(),
      getBatchStats: vi.fn().mockResolvedValue({
        // Cenário "não-último": 1 outro completed (eu sou +1 active = 2 total expected)
        totalImports: 2, completedImports: 0, failedImports: 0,
      }),
      hasActiveBatchForUser: vi.fn(),
      cancelEventJobs: vi.fn(),
      start: vi.fn(), stop: vi.fn(),
    },
    steamApi: {
      getOwnedGames: vi.fn(),
      getAppDetails: vi.fn().mockResolvedValue(APP_DETAILS_HOLLOW),
      downloadCover: vi.fn().mockResolvedValue(Buffer.from('cover-bin')),
    },
    itemsRepo: {
      create: vi.fn().mockResolvedValue(makeItem({ id: 'new-item' })),
      findById: vi.fn(),
      findByCollectionId: vi.fn(),
      findByCollectionAndAppId: vi.fn().mockResolvedValue(null),
      findExistingSteamItemsForUser: vi.fn(),
      update: vi.fn().mockResolvedValue(makeItem()),
      searchByCollection: vi.fn(),
      delete: vi.fn(),
    },
    collectionsRepo: {
      findById: vi.fn().mockResolvedValue({ id: COL_ID, userId: USER_ID, type: 'games' }),
    } as never,
    usersRepo: {
      findById: vi.fn().mockResolvedValue(makeUser()),
    } as never,
    storage: {
      upload: vi.fn().mockResolvedValue('https://s3/items/new-item/cover.webp'),
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
    ...overrides,
  }
}

describe('steam-import-game worker (unified pipeline)', () => {
  it('INSERT path: cria item já com genre/dev/year preenchidos do appdetails', async () => {
    const deps = buildDeps()
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.steamApi.getAppDetails).toHaveBeenCalledWith(APP_ID)
    expect(deps.itemsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      collectionId: COL_ID,
      name: 'Hollow Knight',
      fields: expect.objectContaining({
        steam_appid: APP_ID,
        playtime_minutes: 2820,
        status: 'Na fila',
        genre: 'Indie',
        developer: 'Team Cherry',
        release_year: 2017,
      }),
    }))
    expect(deps.steamApi.downloadCover).toHaveBeenCalledWith(APP_ID)
    expect(deps.itemsRepo.update).toHaveBeenCalledWith('new-item', {
      coverUrl: 'https://s3/items/new-item/cover.webp',
    })
  })

  it('mapeia genre em inglês pra pt-BR ("Action" → "Ação")', async () => {
    const deps = buildDeps({
      steamApi: {
        getOwnedGames: vi.fn(),
        getAppDetails: vi.fn().mockResolvedValue({
          ...APP_DETAILS_HOLLOW,
          genres: [{ id: '1', description: 'Action' }],
        }),
        downloadCover: vi.fn().mockResolvedValue(Buffer.from('cover')),
      },
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.itemsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.objectContaining({ genre: 'Ação' }),
    }))
  })

  it('UPDATE path: preserva campos do usuário (rating/comment/status) e atualiza playtime + enriched', async () => {
    const deps = buildDeps()
    ;(deps.itemsRepo.findByCollectionAndAppId as ReturnType<typeof vi.fn>).mockResolvedValue(makeItem({
      id: 'existing-id',
      name: 'Old Name',
      fields: {
        steam_appid: APP_ID, playtime_minutes: 100,
        status: 'Zerado', completion_date: '2026-01-15',
      },
      rating: 5, comment: 'top',
    }))
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.itemsRepo.create).not.toHaveBeenCalled()
    const updateCall = (deps.itemsRepo.update as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === 'existing-id')
    expect(updateCall).toBeDefined()
    expect(updateCall![1]).toMatchObject({
      name: 'Hollow Knight',
      fields: expect.objectContaining({
        playtime_minutes: 2820,
        steam_appid: APP_ID,
        status: 'Zerado', // preservado
        completion_date: '2026-01-15', // preservado
        genre: 'Indie',
        developer: 'Team Cherry',
        release_year: 2017,
      }),
    })
    // Cover não é re-baixada quando item já existia
    expect(deps.steamApi.downloadCover).not.toHaveBeenCalled()
  })

  it('appdetails retorna null: cria item só com snapshot básico (sem genre/dev/year)', async () => {
    const deps = buildDeps({
      steamApi: {
        getOwnedGames: vi.fn(),
        getAppDetails: vi.fn().mockResolvedValue(null),
        downloadCover: vi.fn().mockResolvedValue(Buffer.from('cover')),
      },
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.itemsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      fields: {
        steam_appid: APP_ID,
        playtime_minutes: 2820,
        status: 'Na fila',
      },
    }))
  })

  it('appdetails throws: tolera silenciosamente, cria item sem enrich', async () => {
    const deps = buildDeps({
      steamApi: {
        getOwnedGames: vi.fn(),
        getAppDetails: vi.fn().mockRejectedValue(new Error('STEAM_RATE_LIMIT')),
        downloadCover: vi.fn().mockResolvedValue(Buffer.from('cover')),
      },
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.itemsRepo.create).toHaveBeenCalled()
    const created = (deps.itemsRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(created.fields).not.toHaveProperty('genre')
  })

  it('cover null: cria item sem cover, sem chamar storage', async () => {
    const deps = buildDeps({
      steamApi: {
        getOwnedGames: vi.fn(),
        getAppDetails: vi.fn().mockResolvedValue(APP_DETAILS_HOLLOW),
        downloadCover: vi.fn().mockResolvedValue(null),
      },
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.itemsRepo.create).toHaveBeenCalled()
    expect(deps.storage.upload).not.toHaveBeenCalled()
    const calls = (deps.itemsRepo.update as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.find(c => c[1]?.coverUrl)).toBeUndefined()
  })

  it('coleção deletada: não cria item nem chama appdetails', async () => {
    const deps = buildDeps({
      collectionsRepo: { findById: vi.fn().mockResolvedValue(null) } as never,
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.itemsRepo.create).not.toHaveBeenCalled()
    expect(deps.steamApi.getAppDetails).not.toHaveBeenCalled()
  })

  it('user desconectou Steam (steamId null): não processa', async () => {
    const deps = buildDeps({
      usersRepo: { findById: vi.fn().mockResolvedValue(makeUser({ steamId: null })) } as never,
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.itemsRepo.create).not.toHaveBeenCalled()
  })

  it('coleção pertence a outro user: não processa', async () => {
    const deps = buildDeps({
      collectionsRepo: {
        findById: vi.fn().mockResolvedValue({ id: COL_ID, userId: 'other-user', type: 'games' }),
      } as never,
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.itemsRepo.create).not.toHaveBeenCalled()
  })

  it('emite progresso "importing" quando ainda não é o último', async () => {
    const deps = buildDeps()
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload({ expectedTotal: 5 }))

    expect(deps.emitter.emitProgress).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      batchId: 'b-1',
      stage: 'importing',
      currentName: 'Hollow Knight',
    }))
    expect(deps.emitter.emitDone).not.toHaveBeenCalled()
    expect(deps.finalizationRepo.finalizeOnce).not.toHaveBeenCalled()
  })

  it('último do batch: finaliza e emite done', async () => {
    const deps = buildDeps({
      jobs: {
        enqueue: vi.fn(),
        registerWorker: vi.fn(),
        // Outro já completou; este vai ser o segundo (último)
        getBatchStats: vi.fn().mockResolvedValue({
          totalImports: 2, completedImports: 1, failedImports: 0,
        }),
        hasActiveBatchForUser: vi.fn(),
        cancelEventJobs: vi.fn(),
        start: vi.fn(), stop: vi.fn(),
      },
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
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
          totalImports: 2, completedImports: 1, failedImports: 0,
        }),
        hasActiveBatchForUser: vi.fn(),
        cancelEventJobs: vi.fn(),
        start: vi.fn(), stop: vi.fn(),
      },
      finalizationRepo: {
        finalizeOnce: vi.fn().mockResolvedValue(false),
        findByBatchId: vi.fn(),
      },
    })
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload())

    expect(deps.emitter.emitDone).not.toHaveBeenCalled()
    expect(deps.notifyOnDone).not.toHaveBeenCalled()
  })

  it('progresso emitido inclui currentName e contadores corretos', async () => {
    const deps = buildDeps()
    const handle = createSteamImportGameWorker(deps)
    clearBatchStartedAt('b-1')
    await handle(basePayload({ expectedTotal: 10 }))

    expect(deps.emitter.emitProgress).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      batchId: 'b-1',
      total: 10,
      completed: 1, // 0 já completos + este (active +1)
      failed: 0,
      stage: 'importing',
      currentName: 'Hollow Knight',
    }))
  })
})
