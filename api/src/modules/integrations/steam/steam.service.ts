import { randomUUID } from 'node:crypto'
import type { UsersRepository } from '../../users/users.repository.js'
import type { CollectionsRepository } from '../../collections/collections.repository.js'
import type { IItemRepository } from '../../../shared/contracts/item.repository.contract.js'
import type { IFieldDefinitionRepository } from '../../../shared/contracts/field-definition.repository.contract.js'
import type { ISteamApiClient, SteamOwnedGame } from '../../../shared/contracts/steam-api.client.contract.js'
import { SteamProfilePrivateError } from '../../../shared/contracts/steam-api.client.contract.js'
import type { IOpenIdVerifier } from '../../../shared/contracts/openid-verifier.contract.js'
import type { IJobsQueue } from '../../../shared/contracts/jobs-queue.contract.js'

export class SteamError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'SteamError'
  }
}

export type ListedSteamGame = SteamOwnedGame & {
  existingCollectionIds: string[]
}

export type ImportDestination =
  | { collectionId: string }
  | { newCollectionName: string }

export type ImportResult = {
  batchId: string
  collectionId: string
  totalJobs: number
}

export type ImportGameJobPayload = {
  userId: string
  collectionId: string
  appId: number
  importBatchId: string
  expectedTotal: number
  gameSnapshot?: { name: string; playtimeForever: number }
}

export class SteamService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly collectionsRepo: CollectionsRepository,
    private readonly itemsRepo: IItemRepository,
    private readonly fieldDefRepo: IFieldDefinitionRepository,
    private readonly steamApi: ISteamApiClient,
    private readonly openId: IOpenIdVerifier,
    private readonly jobs: IJobsQueue,
  ) {}

  async getLinkStatus(userId: string): Promise<{ linked: boolean; steamId: string | null; linkedAt: Date | null }> {
    const user = await this.usersRepo.findById(userId)
    if (!user) throw new SteamError('USER_NOT_FOUND')
    return {
      linked: !!user.steamId,
      steamId: user.steamId,
      linkedAt: user.steamLinkedAt,
    }
  }

  async linkAccount(userId: string, steamId: string): Promise<void> {
    const existing = await this.usersRepo.findBySteamId(steamId)
    if (existing && existing.id !== userId) {
      throw new SteamError('STEAM_ALREADY_LINKED_TO_OTHER_USER')
    }
    if (existing && existing.id === userId) {
      // idempotente
      return
    }
    const current = await this.usersRepo.findById(userId)
    if (!current) throw new SteamError('USER_NOT_FOUND')
    if (current.steamId && current.steamId !== steamId) {
      // tentando trocar conta sem desconectar primeiro
      throw new SteamError('STEAM_REPLACE_REQUIRES_UNLINK')
    }
    await this.usersRepo.linkSteam(userId, steamId)
  }

  async unlinkAccount(userId: string): Promise<void> {
    await this.usersRepo.unlinkSteam(userId)
  }

  async setApiKey(userId: string, apiKey: string): Promise<void> {
    const trimmed = apiKey.trim()
    if (!/^[0-9a-fA-F]{32}$/.test(trimmed)) {
      throw new SteamError('STEAM_API_KEY_INVALID_FORMAT')
    }
    await this.usersRepo.setSteamApiKey(userId, trimmed.toUpperCase())
  }

  async clearApiKey(userId: string): Promise<void> {
    await this.usersRepo.clearSteamApiKey(userId)
  }

  async listOwnedGames(userId: string): Promise<ListedSteamGame[]> {
    const user = await this.usersRepo.findById(userId)
    if (!user) throw new SteamError('USER_NOT_FOUND')
    if (!user.steamId) throw new SteamError('STEAM_NOT_LINKED')
    if (!user.steamApiKey) throw new SteamError('STEAM_API_KEY_MISSING')

    let games: SteamOwnedGame[]
    try {
      games = await this.steamApi.getOwnedGames(user.steamId, user.steamApiKey)
    } catch (err) {
      if (err instanceof SteamProfilePrivateError) throw new SteamError('STEAM_PROFILE_PRIVATE')
      throw err
    }

    const existing = await this.itemsRepo.findExistingSteamItemsForUser(userId)
    const map = new Map<number, string[]>()
    for (const e of existing) {
      const arr = map.get(e.appId) ?? []
      arr.push(e.collectionId)
      map.set(e.appId, arr)
    }

    return games.map(g => ({
      ...g,
      existingCollectionIds: map.get(g.appId) ?? [],
    }))
  }

  async startImport(
    userId: string,
    destination: ImportDestination,
    appIds: number[],
    snapshot?: Array<{ appId: number; name: string; playtimeForever: number }>,
  ): Promise<ImportResult> {
    const user = await this.usersRepo.findById(userId)
    if (!user) throw new SteamError('USER_NOT_FOUND')
    if (!user.steamId) throw new SteamError('STEAM_NOT_LINKED')
    if (!user.steamApiKey) throw new SteamError('STEAM_API_KEY_MISSING')
    if (appIds.length === 0) throw new SteamError('IMPORT_NO_GAMES_SELECTED')

    if (await this.jobs.hasActiveBatchForUser(userId)) {
      throw new SteamError('IMPORT_ALREADY_IN_PROGRESS')
    }

    let collectionId: string
    if ('collectionId' in destination) {
      const col = await this.collectionsRepo.findById(destination.collectionId)
      if (!col) throw new SteamError('IMPORT_COLLECTION_NOT_FOUND')
      if (col.userId !== userId) throw new SteamError('IMPORT_COLLECTION_NOT_OWNED')
      if (col.collectionTypeKey !== 'games') throw new SteamError('IMPORT_COLLECTION_NOT_GAMES_TYPE')
      collectionId = col.id
    } else {
      const name = destination.newCollectionName.trim()
      if (!name) throw new SteamError('IMPORT_INVALID_COLLECTION_NAME')
      const gamesTypeId = await this.collectionsRepo.findCollectionTypeIdByKey('games')
      const created = await this.collectionsRepo.create({
        userId,
        name,
        collectionTypeId: gamesTypeId ?? undefined,
        visibility: 'private',
      })
      collectionId = created.id
      // Anexa schema padrão de games ao collection_field_schema
      const sysFields = gamesTypeId ? await this.fieldDefRepo.findSystemByCollectionTypeId(gamesTypeId) : []
      await this.collectionsRepo.addFieldsToSchema(
        collectionId,
        sysFields.map((f, idx) => ({
          fieldDefinitionId: f.id,
          isRequired: false,
          displayOrder: idx,
        })),
      )
    }

    const batchId = randomUUID()
    const snapshotMap = new Map<number, { name: string; playtimeForever: number }>()
    if (snapshot) {
      for (const s of snapshot) snapshotMap.set(s.appId, { name: s.name, playtimeForever: s.playtimeForever })
    }

    let enqueued = 0
    for (const appId of appIds) {
      const payload: ImportGameJobPayload = {
        userId,
        collectionId,
        appId,
        importBatchId: batchId,
        expectedTotal: appIds.length,
        gameSnapshot: snapshotMap.get(appId),
      }
      const id = await this.jobs.enqueue('steam.import-game', payload, {
        retryLimit: 3,
        retryDelay: 30,
      })
      if (id) enqueued++
    }

    return { batchId, collectionId, totalJobs: enqueued }
  }
}
