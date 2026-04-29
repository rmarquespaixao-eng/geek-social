import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-webp')),
  })),
}))

import { createSteamImportGameWorker } from '../../../../src/shared/infra/jobs/workers/steam-import-game.worker.js'
import type { SteamImportGameWorkerDeps } from '../../../../src/shared/infra/jobs/workers/steam-import-game.worker.js'
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

function buildDeps(overrides: Partial<SteamImportGameWorkerDeps> = {}): SteamImportGameWorkerDeps {
  return {
    jobs: {
      enqueue: vi.fn().mockResolvedValue('job-id'),
      registerWorker: vi.fn(),
      getBatchStats: vi.fn().mockResolvedValue({
        totalImports: 2, completedImports: 1, failedImports: 0,
        totalEnriches: 0, completedEnriches: 0, failedEnriches: 0,
      }),
      hasActiveBatchForUser: vi.fn(),
      start: vi.fn(), stop: vi.fn(),
    },
    steamApi: {
      getOwnedGames: vi.fn(),
      getAppDetails: vi.fn(),
      downloadCover: vi.fn().mockResolvedValue(Buffer.from('cover-bin')),
    },
    itemsRepo: {
      create: vi.fn().mockResolvedValue(makeItem({ id: 'new-item' })),
      findById: vi.fn(),
      findByCollectionId: vi.fn(),
      findByCollectionAndAppId: vi.fn().mockResolvedValue(null),
      findExistingSteamItemsForUser: vi.fn(),
      update: vi.fn().mockResolvedValue(makeItem()),
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
    ...overrides,
  }
}

describe('steam-import-game worker', () => {
  it('INSERT path: cria item, baixa cover, atualiza cover_url, enfileira enrich', async () => {
    const deps = buildDeps()
    const handle = createSteamImportGameWorker(deps)
    await handle(basePayload())

    expect(deps.itemsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      collectionId: COL_ID,
      name: 'Hollow Knight',
      fields: expect.objectContaining({
        steam_appid: APP_ID,
        playtime_minutes: 2820,
        status: 'Na fila',
      }),
    }))
    expect(deps.steamApi.downloadCover).toHaveBeenCalledWith(APP_ID)
    expect(deps.storage.upload).toHaveBeenCalledWith(
      'items/new-item/cover.webp',
      expect.any(Buffer),
      'image/webp',
    )
    expect(deps.itemsRepo.update).toHaveBeenCalledWith('new-item', { coverUrl: 'https://s3/items/new-item/cover.webp' })
    expect(deps.jobs.enqueue).toHaveBeenCalledWith(
      'steam.enrich-game',
      expect.objectContaining({ itemId: 'new-item', appId: APP_ID, importBatchId: 'b-1' }),
      expect.any(Object),
    )
    expect(deps.emitter.emitProgress).toHaveBeenCalled()
  })

  it('UPDATE path: detecta item existente por appId, atualiza só playtime/name', async () => {
    const deps = buildDeps()
    ;(deps.itemsRepo.findByCollectionAndAppId as ReturnType<typeof vi.fn>).mockResolvedValue(makeItem({
      id: 'existing-id',
      name: 'Old Name',
      fields: { steam_appid: APP_ID, playtime_minutes: 100, rating: 5, comment: 'meu comment' },
    }))
    const handle = createSteamImportGameWorker(deps)
    await handle(basePayload())

    expect(deps.itemsRepo.create).not.toHaveBeenCalled()
    expect(deps.itemsRepo.update).toHaveBeenCalledWith('existing-id', expect.objectContaining({
      name: 'Hollow Knight',
      fields: expect.objectContaining({
        playtime_minutes: 2820,
        steam_appid: APP_ID,
        rating: 5,
        comment: 'meu comment', // preservado
      }),
    }))
    // Não deveria baixar cover novo (item já existia → preserva cover)
    expect(deps.steamApi.downloadCover).not.toHaveBeenCalled()
  })

  it('cover null (downloadCover retorna null): segue sem cover', async () => {
    const deps = buildDeps({
      steamApi: {
        getOwnedGames: vi.fn(),
        getAppDetails: vi.fn(),
        downloadCover: vi.fn().mockResolvedValue(null),
      },
    })
    const handle = createSteamImportGameWorker(deps)
    await handle(basePayload())
    expect(deps.itemsRepo.create).toHaveBeenCalled()
    expect(deps.storage.upload).not.toHaveBeenCalled()
    // não chama update com coverUrl (mas pode ter chamado pra outras coisas — checamos que coverUrl não foi setado)
    const calls = (deps.itemsRepo.update as ReturnType<typeof vi.fn>).mock.calls
    const coverCall = calls.find(c => c[1].coverUrl)
    expect(coverCall).toBeUndefined()
  })

  it('coleção deletada: não cria item, não enfileira enrich', async () => {
    const deps = buildDeps({
      collectionsRepo: {
        findById: vi.fn().mockResolvedValue(null),
      } as never,
    })
    const handle = createSteamImportGameWorker(deps)
    await handle(basePayload())
    expect(deps.itemsRepo.create).not.toHaveBeenCalled()
    expect(deps.jobs.enqueue).not.toHaveBeenCalled()
  })

  it('user desconectou Steam (steamId null): não processa', async () => {
    const deps = buildDeps({
      usersRepo: {
        findById: vi.fn().mockResolvedValue(makeUser({ steamId: null })),
      } as never,
    })
    const handle = createSteamImportGameWorker(deps)
    await handle(basePayload())
    expect(deps.itemsRepo.create).not.toHaveBeenCalled()
    expect(deps.jobs.enqueue).not.toHaveBeenCalled()
  })

  it('coleção pertence a outro user: não processa', async () => {
    const deps = buildDeps({
      collectionsRepo: {
        findById: vi.fn().mockResolvedValue({ id: COL_ID, userId: 'other-user', type: 'games' }),
      } as never,
    })
    const handle = createSteamImportGameWorker(deps)
    await handle(basePayload())
    expect(deps.itemsRepo.create).not.toHaveBeenCalled()
  })

  it('emite progresso após processar', async () => {
    const deps = buildDeps()
    const handle = createSteamImportGameWorker(deps)
    await handle(basePayload())
    expect(deps.emitter.emitProgress).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      batchId: 'b-1',
      stage: expect.any(String),
      currentName: 'Hollow Knight',
    }))
  })
})
