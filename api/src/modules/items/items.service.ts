import sharp from 'sharp'
import type {
  IItemRepository, Item, FieldFilter, ItemSort, ItemsPage,
} from '../../shared/contracts/item.repository.contract.js'
import type { ICollectionRepository, CollectionSchemaEntry } from '../../shared/contracts/collection.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { IPostsService } from '../../shared/contracts/posts.service.contract.js'
import type { CreateItemInput, UpdateItemInput } from './items.schema.js'

export type ListItemsQuery = {
  q?: string
  cursor?: string
  limit: number
  sort: ItemSort
  ratingMin?: number
  hasCover?: boolean
  rawFieldParams?: Record<string, string>
}

export class ItemsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ItemsError'
  }
}

export class ItemsService {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly collectionRepo: ICollectionRepository,
    private readonly storageService?: IStorageService,
    private readonly friendsRepo?: IFriendsRepository,
    private readonly postsService?: IPostsService,
  ) {}

  private validateFields(fields: Record<string, unknown>, schema: CollectionSchemaEntry[]): void {
    for (const entry of schema) {
      const { fieldDefinition, isRequired } = entry
      const value = fields[fieldDefinition.fieldKey]

      if (isRequired && (value === undefined || value === null)) {
        throw new ItemsError('REQUIRED_FIELD_MISSING')
      }

      if (value === undefined || value === null) continue

      switch (fieldDefinition.fieldType) {
        case 'number':
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new ItemsError('INVALID_FIELD_TYPE')
          break
        case 'date':
          if (typeof value !== 'string' || isNaN(Date.parse(value as string))) throw new ItemsError('INVALID_FIELD_TYPE')
          break
        case 'boolean':
          if (typeof value !== 'boolean') throw new ItemsError('INVALID_FIELD_TYPE')
          break
        case 'select':
          if (!fieldDefinition.selectOptions?.includes(value as string)) throw new ItemsError('INVALID_FIELD_VALUE')
          break
        case 'text':
          if (typeof value !== 'string') throw new ItemsError('INVALID_FIELD_TYPE')
          break
        case 'money':
          if (typeof value !== 'number' || !isFinite(value)) throw new ItemsError('INVALID_FIELD_TYPE')
          break
      }
    }
  }

  private async assertCollectionOwnership(userId: string, collectionId: string) {
    const collection = await this.collectionRepo.findById(collectionId)
    if (!collection || collection.userId !== userId) throw new ItemsError('NOT_FOUND')
    return collection
  }

  /**
   * Resolve a coleção para leitura — owner ou viewer com permissão (visibility/friendship).
   * Usado nos endpoints de leitura (list/listPage) para suportar visualização cross-user.
   */
  private async assertCollectionReadable(viewerId: string, collectionId: string) {
    const collection = await this.collectionRepo.findById(collectionId)
    if (!collection) throw new ItemsError('NOT_FOUND')
    if (collection.userId === viewerId) return collection

    if (this.friendsRepo) {
      const blocked = await this.friendsRepo.isBlockedBy(collection.userId, viewerId)
      if (blocked) throw new ItemsError('NOT_FOUND')
    }
    if (collection.visibility === 'private') throw new ItemsError('NOT_FOUND')
    if (collection.visibility === 'friends_only') {
      const isFriend = this.friendsRepo
        ? await this.friendsRepo.areFriends(collection.userId, viewerId)
        : false
      if (!isFriend) throw new ItemsError('NOT_FOUND')
    }
    return collection
  }

  async create(userId: string, collectionId: string, input: CreateItemInput): Promise<Item> {
    const collection = await this.assertCollectionOwnership(userId, collectionId)

    if (input.rating != null && (input.rating < 1 || input.rating > 5)) {
      throw new ItemsError('INVALID_RATING')
    }

    this.validateFields(input.fields ?? {}, collection.fieldSchema)

    const item = await this.itemRepo.create({
      collectionId,
      name: input.name,
      fields: input.fields ?? {},
      // Schema permite `null` (form clearing); repo aceita undefined.
      rating: input.rating ?? undefined,
      comment: input.comment ?? undefined,
    })

    // Compartilha no feed se o item explicitamente pediu (input.shareToFeed),
    // ou se a coleção está configurada para auto-compartilhar.
    const shouldShare = input.shareToFeed || collection.autoShareToFeed
    if (shouldShare && this.postsService) {
      await this.postsService.createItemShare({
        userId,
        itemId: item.id,
        collectionId,
        collectionVisibility: collection.visibility,
      })
    }

    return item
  }

  async list(userId: string, collectionId: string, query?: string): Promise<Item[]> {
    await this.assertCollectionReadable(userId, collectionId)
    return this.itemRepo.findByCollectionId(collectionId, query)
  }

  async listPage(userId: string, collectionId: string, query: ListItemsQuery): Promise<ItemsPage> {
    const collection = await this.assertCollectionReadable(userId, collectionId)
    const fieldFilters = this.parseFieldFilters(query.rawFieldParams ?? {}, collection.fieldSchema)
    return this.itemRepo.searchByCollection({
      collectionId,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
      ratingMin: query.ratingMin,
      hasCover: query.hasCover,
      fieldFilters,
    })
  }

  private parseFieldFilters(
    raw: Record<string, string>,
    schema: CollectionSchemaEntry[],
  ): FieldFilter[] {
    const byKey = new Map(schema.map(e => [e.fieldDefinition.fieldKey, e.fieldDefinition]))
    const filters: FieldFilter[] = []

    for (const [paramName, value] of Object.entries(raw)) {
      if (!paramName.startsWith('field_')) continue
      const rest = paramName.slice('field_'.length)
      const m = rest.match(/^(.+?)(_gte|_lte)?$/)
      if (!m) continue
      const fieldKey = m[1]
      const op = m[2] as '_gte' | '_lte' | undefined
      const def = byKey.get(fieldKey)
      if (!def) continue
      const fieldType = def.fieldType

      let existing = filters.find(f => f.fieldKey === fieldKey)
      if (!existing) {
        existing = { fieldKey, fieldType }
        filters.push(existing)
      }

      if (fieldType === 'text') {
        if (value) existing.contains = value
      } else if (fieldType === 'select') {
        if (value) existing.equalsAny = value.split(',').map(v => v.trim()).filter(Boolean)
      } else if (fieldType === 'boolean') {
        if (value === 'true') existing.boolValue = true
        else if (value === 'false') existing.boolValue = false
      } else if (fieldType === 'number' || fieldType === 'money') {
        const num = Number(value)
        if (!Number.isFinite(num)) continue
        if (op === '_gte') existing.gte = num
        else if (op === '_lte') existing.lte = num
        else existing.gte = existing.lte = num
      } else if (fieldType === 'date') {
        const t = Date.parse(value)
        if (Number.isNaN(t)) continue
        const iso = new Date(t).toISOString()
        if (op === '_gte') existing.gte = iso
        else if (op === '_lte') existing.lte = iso
      }
    }

    return filters
  }

  async get(userId: string, collectionId: string, itemId: string): Promise<Item> {
    await this.assertCollectionReadable(userId, collectionId)
    const item = await this.itemRepo.findById(itemId)
    if (!item || item.collectionId !== collectionId) throw new ItemsError('NOT_FOUND')
    return item
  }

  async update(userId: string, collectionId: string, itemId: string, input: UpdateItemInput): Promise<Item> {
    const collection = await this.assertCollectionOwnership(userId, collectionId)
    const item = await this.itemRepo.findById(itemId)
    if (!item || item.collectionId !== collectionId) throw new ItemsError('NOT_FOUND')

    if (input.rating !== undefined && input.rating !== null && (input.rating < 1 || input.rating > 5)) {
      throw new ItemsError('INVALID_RATING')
    }

    // PUT é PATCH semântico em `fields`: merge com os fields existentes do
    // item antes de validar e persistir. Sem isso (a) hidden/system fields
    // como steam_appid sumiriam ao salvar; (b) qualquer required field não
    // re-enviado pelo form dispara REQUIRED_FIELD_MISSING (422) mesmo com o
    // valor já gravado.
    let mergedFields: Record<string, unknown> | undefined
    if (input.fields !== undefined) {
      mergedFields = { ...item.fields, ...input.fields }
      this.validateFields(mergedFields, collection.fieldSchema)
    }

    const allowlistedUpdate: Record<string, unknown> = {}
    if (input.name !== undefined) allowlistedUpdate.name = input.name
    if (input.rating !== undefined) allowlistedUpdate.rating = input.rating
    if (input.comment !== undefined) allowlistedUpdate.comment = input.comment
    if (mergedFields !== undefined) allowlistedUpdate.fields = mergedFields

    return this.itemRepo.update(itemId, allowlistedUpdate)
  }

  async delete(userId: string, collectionId: string, itemId: string): Promise<void> {
    await this.assertCollectionOwnership(userId, collectionId)
    const item = await this.itemRepo.findById(itemId)
    if (!item || item.collectionId !== collectionId) throw new ItemsError('NOT_FOUND')
    await this.itemRepo.delete(itemId)
  }

  async uploadCover(userId: string, collectionId: string, itemId: string, buffer: Buffer): Promise<Item> {
    if (!this.storageService) throw new ItemsError('STORAGE_NOT_CONFIGURED')
    await this.assertCollectionOwnership(userId, collectionId)
    const item = await this.itemRepo.findById(itemId)
    if (!item || item.collectionId !== collectionId) throw new ItemsError('NOT_FOUND')
    const webpBuffer = await sharp(buffer)
      .resize(800, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    const key = `items/${itemId}/cover.webp`
    const coverUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.itemRepo.update(itemId, { coverUrl })
  }

  async listPublicItems(collectionId: string, ownerId: string, viewerId: string | null): Promise<Item[]> {
    const collection = await this.collectionRepo.findById(collectionId)
    if (!collection || collection.userId !== ownerId) throw new ItemsError('NOT_FOUND')

    if (viewerId && this.friendsRepo) {
      const blocked = await this.friendsRepo.isBlockedBy(ownerId, viewerId)
      if (blocked) throw new ItemsError('NOT_FOUND')
    }

    if (collection.visibility === 'private') throw new ItemsError('NOT_FOUND')

    if (collection.visibility === 'friends_only') {
      const isFriend = (viewerId && this.friendsRepo)
        ? await this.friendsRepo.areFriends(ownerId, viewerId)
        : false
      if (!isFriend) throw new ItemsError('NOT_FOUND')
    }

    return this.itemRepo.findByCollectionId(collectionId)
  }
}
