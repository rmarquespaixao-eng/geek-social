import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SteamService, SteamError } from '../../../../src/modules/integrations/steam/steam.service.js'
import { SteamProfilePrivateError, type ISteamApiClient } from '../../../../src/shared/contracts/steam-api.client.contract.js'
import type { IOpenIdVerifier } from '../../../../src/shared/contracts/openid-verifier.contract.js'
import type { IJobsQueue } from '../../../../src/shared/contracts/jobs-queue.contract.js'
import type { IItemRepository } from '../../../../src/shared/contracts/item.repository.contract.js'
import type { IFieldDefinitionRepository } from '../../../../src/shared/contracts/field-definition.repository.contract.js'
import type { User } from '../../../../src/shared/contracts/user.repository.contract.js'

const USER_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222'
const COL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const STEAM_ID = '76561198000000001'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'u@x.com',
    passwordHash: null,
    displayName: 'User',
    bio: null,
    avatarUrl: null,
    coverUrl: null,
    privacy: 'public',
    keycloakId: null,
    emailVerified: true,
    showPresence: true,
    showReadReceipts: true,
    steamId: null,
    steamLinkedAt: null,
    steamApiKey: null,
    googleId: null,
    googleLinkedAt: null,
    birthday: null,
    interests: [],
    pronouns: null,
    location: null,
    website: null,
    profileBackgroundUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const VALID_KEY = 'ABCDEF0123456789ABCDEF0123456789'

function makeUsersRepo() {
  return {
    findById: vi.fn<(id: string) => Promise<User | null>>(),
    findBySteamId: vi.fn<(steamId: string) => Promise<User | null>>(),
    linkSteam: vi.fn<(userId: string, steamId: string) => Promise<User>>(),
    unlinkSteam: vi.fn<(userId: string) => Promise<User>>(),
    setSteamApiKey: vi.fn<(userId: string, key: string) => Promise<User>>(),
    clearSteamApiKey: vi.fn<(userId: string) => Promise<User>>(),
  }
}

function makeCollectionsRepo() {
  return {
    findById: vi.fn(),
    create: vi.fn(),
    addFieldsToSchema: vi.fn().mockResolvedValue(undefined),
  }
}

function makeItemsRepo(): IItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByCollectionId: vi.fn(),
    searchByCollection: vi.fn(),
    findByCollectionAndAppId: vi.fn(),
    findExistingSteamItemsForUser: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as IItemRepository
}

function makeFieldDefRepo(): IFieldDefinitionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findSystemByCollectionType: vi.fn().mockResolvedValue([]),
    isFieldKeyTaken: vi.fn(),
    isInUse: vi.fn(),
    delete: vi.fn(),
    upsertSystem: vi.fn(),
  }
}

function makeSteamApi(): ISteamApiClient {
  return {
    getOwnedGames: vi.fn(),
    getAppDetails: vi.fn(),
    downloadCover: vi.fn(),
  }
}

function makeOpenId(): IOpenIdVerifier {
  return {
    buildAuthUrl: vi.fn().mockReturnValue('https://steam/auth'),
    verifyResponse: vi.fn(),
  }
}

function makeJobs(): IJobsQueue {
  return {
    enqueue: vi.fn().mockResolvedValue('job-id'),
    registerWorker: vi.fn(),
    getBatchStats: vi.fn(),
    hasActiveBatchForUser: vi.fn().mockResolvedValue(false),
    start: vi.fn(),
    stop: vi.fn(),
  }
}

function build() {
  const usersRepo = makeUsersRepo()
  const collectionsRepo = makeCollectionsRepo()
  const itemsRepo = makeItemsRepo()
  const fieldDefRepo = makeFieldDefRepo()
  const steamApi = makeSteamApi()
  const openId = makeOpenId()
  const jobs = makeJobs()
  const service = new SteamService(
    usersRepo as never,
    collectionsRepo as never,
    itemsRepo,
    fieldDefRepo,
    steamApi,
    openId,
    jobs,
  )
  return { service, usersRepo, collectionsRepo, itemsRepo, fieldDefRepo, steamApi, openId, jobs }
}

describe('SteamService.linkAccount', () => {
  it('vincula quando steamId é novo', async () => {
    const { service, usersRepo } = build()
    usersRepo.findBySteamId.mockResolvedValue(null)
    usersRepo.findById.mockResolvedValue(makeUser())
    await service.linkAccount(USER_ID, STEAM_ID)
    expect(usersRepo.linkSteam).toHaveBeenCalledWith(USER_ID, STEAM_ID)
  })

  it('é idempotente quando o mesmo userId já tem o mesmo steamId', async () => {
    const { service, usersRepo } = build()
    usersRepo.findBySteamId.mockResolvedValue(makeUser({ steamId: STEAM_ID }))
    await service.linkAccount(USER_ID, STEAM_ID)
    expect(usersRepo.linkSteam).not.toHaveBeenCalled()
  })

  it('lança STEAM_ALREADY_LINKED_TO_OTHER_USER quando steamId pertence a outro user', async () => {
    const { service, usersRepo } = build()
    usersRepo.findBySteamId.mockResolvedValue(makeUser({ id: OTHER_USER_ID, steamId: STEAM_ID }))
    await expect(service.linkAccount(USER_ID, STEAM_ID))
      .rejects.toMatchObject({ code: 'STEAM_ALREADY_LINKED_TO_OTHER_USER' })
  })

  it('lança STEAM_REPLACE_REQUIRES_UNLINK quando user tenta trocar de conta sem desconectar', async () => {
    const { service, usersRepo } = build()
    usersRepo.findBySteamId.mockResolvedValue(null)
    usersRepo.findById.mockResolvedValue(makeUser({ steamId: '76561198999999999' }))
    await expect(service.linkAccount(USER_ID, STEAM_ID))
      .rejects.toMatchObject({ code: 'STEAM_REPLACE_REQUIRES_UNLINK' })
  })
})

describe('SteamService.unlinkAccount', () => {
  it('chama unlinkSteam', async () => {
    const { service, usersRepo } = build()
    await service.unlinkAccount(USER_ID)
    expect(usersRepo.unlinkSteam).toHaveBeenCalledWith(USER_ID)
  })
})

describe('SteamService.setApiKey', () => {
  it('aceita key 32 hex e persiste em uppercase', async () => {
    const { service, usersRepo } = build()
    await service.setApiKey(USER_ID, 'abcdef0123456789abcdef0123456789')
    expect(usersRepo.setSteamApiKey).toHaveBeenCalledWith(USER_ID, 'ABCDEF0123456789ABCDEF0123456789')
  })

  it('faz trim antes de validar', async () => {
    const { service, usersRepo } = build()
    await service.setApiKey(USER_ID, '  ABCDEF0123456789ABCDEF0123456789  ')
    expect(usersRepo.setSteamApiKey).toHaveBeenCalled()
  })

  it('rejeita formato inválido', async () => {
    const { service } = build()
    await expect(service.setApiKey(USER_ID, 'too-short')).rejects.toMatchObject({ code: 'STEAM_API_KEY_INVALID_FORMAT' })
    await expect(service.setApiKey(USER_ID, 'g'.repeat(32))).rejects.toMatchObject({ code: 'STEAM_API_KEY_INVALID_FORMAT' })
  })
})

describe('SteamService.clearApiKey', () => {
  it('chama clearSteamApiKey', async () => {
    const { service, usersRepo } = build()
    await service.clearApiKey(USER_ID)
    expect(usersRepo.clearSteamApiKey).toHaveBeenCalledWith(USER_ID)
  })
})

describe('SteamService.listOwnedGames', () => {
  it('lança STEAM_NOT_LINKED quando usuário não tem steamId', async () => {
    const { service, usersRepo } = build()
    usersRepo.findById.mockResolvedValue(makeUser())
    await expect(service.listOwnedGames(USER_ID))
      .rejects.toMatchObject({ code: 'STEAM_NOT_LINKED' })
  })

  it('lança STEAM_API_KEY_MISSING quando vinculou Steam mas não setou key', async () => {
    const { service, usersRepo } = build()
    usersRepo.findById.mockResolvedValue(makeUser({ steamId: STEAM_ID }))
    await expect(service.listOwnedGames(USER_ID))
      .rejects.toMatchObject({ code: 'STEAM_API_KEY_MISSING' })
  })

  it('lança STEAM_PROFILE_PRIVATE quando steam api lança SteamProfilePrivateError', async () => {
    const { service, usersRepo, steamApi } = build()
    usersRepo.findById.mockResolvedValue(makeUser({ steamId: STEAM_ID, steamApiKey: VALID_KEY }))
    ;(steamApi.getOwnedGames as ReturnType<typeof vi.fn>).mockRejectedValue(new SteamProfilePrivateError())
    await expect(service.listOwnedGames(USER_ID))
      .rejects.toMatchObject({ code: 'STEAM_PROFILE_PRIVATE' })
  })

  it('passa steamId + key do user pro client', async () => {
    const { service, usersRepo, steamApi } = build()
    usersRepo.findById.mockResolvedValue(makeUser({ steamId: STEAM_ID, steamApiKey: VALID_KEY }))
    ;(steamApi.getOwnedGames as ReturnType<typeof vi.fn>).mockResolvedValue([])
    await service.listOwnedGames(USER_ID)
    expect(steamApi.getOwnedGames).toHaveBeenCalledWith(STEAM_ID, VALID_KEY)
  })

  it('adiciona existingCollectionIds corretamente', async () => {
    const { service, usersRepo, steamApi, itemsRepo } = build()
    usersRepo.findById.mockResolvedValue(makeUser({ steamId: STEAM_ID, steamApiKey: VALID_KEY }))
    ;(steamApi.getOwnedGames as ReturnType<typeof vi.fn>).mockResolvedValue([
      { appId: 100, name: 'Hollow', playtimeForever: 60, imgIconUrl: null },
      { appId: 200, name: 'Stardew', playtimeForever: 0, imgIconUrl: null },
      { appId: 300, name: 'Hades', playtimeForever: 100, imgIconUrl: null },
    ])
    ;(itemsRepo.findExistingSteamItemsForUser as ReturnType<typeof vi.fn>).mockResolvedValue([
      { appId: 100, collectionId: 'col-a' },
      { appId: 200, collectionId: 'col-a' },
      { appId: 200, collectionId: 'col-b' },
    ])
    const games = await service.listOwnedGames(USER_ID)
    expect(games[0].existingCollectionIds).toEqual(['col-a'])
    expect(games[1].existingCollectionIds).toEqual(['col-a', 'col-b'])
    expect(games[2].existingCollectionIds).toEqual([])
  })
})

describe('SteamService.startImport', () => {
  function setup() {
    const ctx = build()
    ctx.usersRepo.findById.mockResolvedValue(makeUser({ steamId: STEAM_ID, steamApiKey: VALID_KEY }))
    return ctx
  }

  it('lança STEAM_NOT_LINKED se sem steamId', async () => {
    const { service, usersRepo } = build()
    usersRepo.findById.mockResolvedValue(makeUser())
    await expect(service.startImport(USER_ID, { collectionId: COL_ID }, [100]))
      .rejects.toMatchObject({ code: 'STEAM_NOT_LINKED' })
  })

  it('lança STEAM_API_KEY_MISSING se vinculou Steam mas sem key', async () => {
    const { service, usersRepo } = build()
    usersRepo.findById.mockResolvedValue(makeUser({ steamId: STEAM_ID }))
    await expect(service.startImport(USER_ID, { collectionId: COL_ID }, [100]))
      .rejects.toMatchObject({ code: 'STEAM_API_KEY_MISSING' })
  })

  it('lança IMPORT_NO_GAMES_SELECTED quando appIds vazio', async () => {
    const { service } = setup()
    await expect(service.startImport(USER_ID, { collectionId: COL_ID }, []))
      .rejects.toMatchObject({ code: 'IMPORT_NO_GAMES_SELECTED' })
  })

  it('lança IMPORT_ALREADY_IN_PROGRESS quando há batch ativo', async () => {
    const { service, jobs } = setup()
    ;(jobs.hasActiveBatchForUser as ReturnType<typeof vi.fn>).mockResolvedValue(true)
    await expect(service.startImport(USER_ID, { collectionId: COL_ID }, [100]))
      .rejects.toMatchObject({ code: 'IMPORT_ALREADY_IN_PROGRESS' })
  })

  it('valida que collectionId pertence ao user e é tipo games', async () => {
    const { service, collectionsRepo } = setup()
    collectionsRepo.findById.mockResolvedValue({
      id: COL_ID, userId: OTHER_USER_ID, type: 'games',
    })
    await expect(service.startImport(USER_ID, { collectionId: COL_ID }, [100]))
      .rejects.toMatchObject({ code: 'IMPORT_COLLECTION_NOT_OWNED' })
  })

  it('rejeita coleção que não é tipo games', async () => {
    const { service, collectionsRepo } = setup()
    collectionsRepo.findById.mockResolvedValue({
      id: COL_ID, userId: USER_ID, type: 'books',
    })
    await expect(service.startImport(USER_ID, { collectionId: COL_ID }, [100]))
      .rejects.toMatchObject({ code: 'IMPORT_COLLECTION_NOT_GAMES_TYPE' })
  })

  it('cria nova coleção e anexa schema padrão de games', async () => {
    const { service, collectionsRepo, fieldDefRepo, jobs } = setup()
    collectionsRepo.create.mockResolvedValue({ id: 'new-col' })
    ;(fieldDefRepo.findSystemByCollectionType as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'fd1' }, { id: 'fd2' },
    ])
    const result = await service.startImport(USER_ID, { newCollectionName: 'Steam' }, [100, 200])
    expect(collectionsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID, name: 'Steam', type: 'games', visibility: 'private',
    }))
    expect(collectionsRepo.addFieldsToSchema).toHaveBeenCalledWith('new-col', [
      { fieldDefinitionId: 'fd1', isRequired: false, displayOrder: 0 },
      { fieldDefinitionId: 'fd2', isRequired: false, displayOrder: 1 },
    ])
    expect(result.collectionId).toBe('new-col')
    expect(result.totalJobs).toBe(2)
    expect(jobs.enqueue).toHaveBeenCalledTimes(2)
  })

  it('rejeita newCollectionName vazio', async () => {
    const { service } = setup()
    await expect(service.startImport(USER_ID, { newCollectionName: '   ' }, [100]))
      .rejects.toMatchObject({ code: 'IMPORT_INVALID_COLLECTION_NAME' })
  })

  it('passa snapshot pra cada job quando fornecido', async () => {
    const { service, collectionsRepo, jobs } = setup()
    collectionsRepo.findById.mockResolvedValue({ id: COL_ID, userId: USER_ID, type: 'games' })
    await service.startImport(
      USER_ID,
      { collectionId: COL_ID },
      [100, 200],
      [
        { appId: 100, name: 'Hollow', playtimeForever: 60 },
        { appId: 200, name: 'Stardew', playtimeForever: 720 },
      ],
    )
    const firstCall = (jobs.enqueue as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(firstCall[0]).toBe('steam.import-game')
    expect(firstCall[1]).toMatchObject({
      userId: USER_ID,
      collectionId: COL_ID,
      appId: 100,
      gameSnapshot: { name: 'Hollow', playtimeForever: 60 },
    })
  })
})
