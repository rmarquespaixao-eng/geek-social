// src/modules/collections/collections.service.ts
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { ICollectionRepository, Collection, CollectionWithSchema, CollectionSchemaEntry } from '../../shared/contracts/collection.repository.contract.js'
import type { IFieldDefinitionRepository } from '../../shared/contracts/field-definition.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { UsersRepository } from '../users/users.repository.js'
import type { CreateCollectionInput, UpdateCollectionInput } from './collections.schema.js'
import { collectionTypes } from '../../shared/infra/database/schema.js'

export class CollectionsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'CollectionsError'
  }
}

export class CollectionsService {
  constructor(
    private readonly collectionsRepo: ICollectionRepository,
    private readonly fieldDefRepo: IFieldDefinitionRepository,
    private readonly storageService?: IStorageService,
    private readonly friendsRepo?: IFriendsRepository,
    private readonly usersRepo?: UsersRepository,
    private readonly db?: DatabaseClient,
  ) {}

  private async resolveCollectionTypeId(typeKey: string): Promise<string | null> {
    if (!this.db) return null
    const [row] = await this.db.select({ id: collectionTypes.id })
      .from(collectionTypes)
      .where(eq(collectionTypes.key, typeKey))
      .limit(1)
    return row?.id ?? null
  }

  async create(userId: string, input: CreateCollectionInput): Promise<CollectionWithSchema> {
    // Normaliza type (chave string) para collectionTypeId (UUID FK)
    const collectionTypeId = await this.resolveCollectionTypeId(input.type)

    const collection = await this.collectionsRepo.create({
      userId,
      name: input.name,
      // O schema permite `null` (vindo do form), mas o repo só aceita undefined.
      // Normaliza aqui pra manter o domínio estável.
      description: input.description ?? undefined,
      type: input.type as 'games' | 'books' | 'cardgames' | 'boardgames' | 'custom' | undefined,
      collectionTypeId: collectionTypeId ?? undefined,
      visibility: input.visibility,
      autoShareToFeed: input.autoShareToFeed,
    })

    // Tenta buscar campos por collectionTypeId primeiro (pós-migração), depois por key (pré-migração)
    const isBuiltIn = ['games', 'books', 'cardgames', 'boardgames'].includes(input.type)
    if (input.type !== 'custom' && isBuiltIn) {
      const systemFields = collectionTypeId
        ? await this.fieldDefRepo.findSystemByCollectionTypeId(collectionTypeId)
        : await this.fieldDefRepo.findSystemByCollectionType(input.type as 'games' | 'books' | 'cardgames' | 'boardgames')
      if (systemFields.length > 0) {
        await this.collectionsRepo.addFieldsToSchema(
          collection.id,
          systemFields.map((f, i) => ({ fieldDefinitionId: f.id, isRequired: false, displayOrder: i })),
        )
      }
    } else if (input.fieldDefinitionIds?.length) {
      const userDefs = await this.fieldDefRepo.findByUserId(userId)
      const allowedIds = new Set(userDefs.map(d => d.id))
      for (const id of input.fieldDefinitionIds) {
        const def = await this.fieldDefRepo.findById(id)
        if (!def || (!def.isSystem && !allowedIds.has(id))) {
          throw new CollectionsError('FIELD_NOT_FOUND')
        }
      }
      await this.collectionsRepo.addFieldsToSchema(
        collection.id,
        input.fieldDefinitionIds.map((id, i) => ({ fieldDefinitionId: id, isRequired: false, displayOrder: i })),
      )
    }

    return (await this.collectionsRepo.findById(collection.id))!
  }

  async list(userId: string, query?: string): Promise<Collection[]> {
    return this.collectionsRepo.findByUserId(userId, query)
  }

  async get(userId: string, id: string): Promise<CollectionWithSchema> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection) throw new CollectionsError('NOT_FOUND')

    const isOwner = collection.userId === userId
    if (isOwner) return collection

    // Bloqueio em qualquer direção esconde o conteúdo
    if (this.friendsRepo) {
      const blocked = await this.friendsRepo.isBlockedBy(collection.userId, userId)
      if (blocked) throw new CollectionsError('NOT_FOUND')
    }

    // Visibilidade da coleção
    if (collection.visibility === 'private') throw new CollectionsError('NOT_FOUND')
    if (collection.visibility === 'friends_only') {
      const isFriend = this.friendsRepo
        ? await this.friendsRepo.areFriends(collection.userId, userId)
        : false
      if (!isFriend) throw new CollectionsError('NOT_FOUND')
    }

    // Privacidade do dono — bloqueia se private/friends_only e não é amigo
    if (this.usersRepo) {
      const owner = await this.usersRepo.findById(collection.userId)
      if (!owner) throw new CollectionsError('NOT_FOUND')
      if (owner.privacy === 'private') throw new CollectionsError('NOT_FOUND')
      if (owner.privacy === 'friends_only') {
        const isFriend = this.friendsRepo
          ? await this.friendsRepo.areFriends(collection.userId, userId)
          : false
        if (!isFriend) throw new CollectionsError('NOT_FOUND')
      }
    }

    return collection
  }

  async update(userId: string, id: string, input: UpdateCollectionInput): Promise<Collection> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) {
      throw new CollectionsError('NOT_FOUND')
    }
    return this.collectionsRepo.update(id, {
      ...input,
      description: input.description ?? undefined,
    })
  }

  async delete(userId: string, id: string): Promise<void> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) {
      throw new CollectionsError('NOT_FOUND')
    }
    await this.collectionsRepo.delete(id)
  }

  async uploadIcon(userId: string, id: string, buffer: Buffer): Promise<Collection> {
    if (!this.storageService) throw new CollectionsError('STORAGE_NOT_CONFIGURED')
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')
    const webpBuffer = await sharp(buffer).resize(200, 200, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const key = `collections/${id}/icon.webp`
    const iconUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.collectionsRepo.update(id, { iconUrl })
  }

  async uploadCover(userId: string, id: string, buffer: Buffer): Promise<Collection> {
    if (!this.storageService) throw new CollectionsError('STORAGE_NOT_CONFIGURED')
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')
    const webpBuffer = await sharp(buffer).resize(1200, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const key = `collections/${id}/cover.webp`
    const coverUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.collectionsRepo.update(id, { coverUrl })
  }

  async attachField(
    userId: string,
    collectionId: string,
    fieldDefinitionId: string,
    options: { isRequired?: boolean } = {},
  ): Promise<CollectionSchemaEntry> {
    const collection = await this.collectionsRepo.findById(collectionId)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')

    const def = await this.fieldDefRepo.findById(fieldDefinitionId)
    if (!def) throw new CollectionsError('FIELD_NOT_FOUND')
    // Permite anexar definições do sistema (qualquer collectionType) ou definições do próprio usuário
    if (!def.isSystem && def.userId !== userId) throw new CollectionsError('FIELD_NOT_FOUND')

    const duplicate = await this.collectionsRepo.hasFieldKeyInCollection(collectionId, def.fieldKey)
    if (duplicate) throw new CollectionsError('FIELD_KEY_DUPLICATE')

    const nextOrder = collection.fieldSchema.length
    return this.collectionsRepo.addOneToSchema(collectionId, {
      fieldDefinitionId,
      isRequired: options.isRequired ?? false,
      displayOrder: nextOrder,
    })
  }

  async detachField(userId: string, collectionId: string, entryId: string): Promise<void> {
    const collection = await this.collectionsRepo.findById(collectionId)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')

    const entry = await this.collectionsRepo.findSchemaEntry(entryId)
    if (!entry || entry.collectionId !== collectionId) throw new CollectionsError('NOT_FOUND')

    if (entry.fieldDefinition.isSystem) throw new CollectionsError('SYSTEM_FIELD_LOCKED')

    const definitionId = entry.fieldDefinition.id
    await this.collectionsRepo.removeFromSchema(entryId)

    // Auto-limpa a definição da biblioteca se não estiver mais em uso em nenhuma coleção.
    // Assim "deletar" da coleção realmente apaga (já que não há UI separada de biblioteca).
    const stillUsed = await this.fieldDefRepo.isInUse(definitionId)
    if (!stillUsed) {
      await this.fieldDefRepo.delete(definitionId)
    }
  }

  async updateSchemaEntry(
    userId: string,
    collectionId: string,
    entryId: string,
    data: { isRequired?: boolean },
  ): Promise<CollectionSchemaEntry> {
    const collection = await this.collectionsRepo.findById(collectionId)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')

    const entry = await this.collectionsRepo.findSchemaEntry(entryId)
    if (!entry || entry.collectionId !== collectionId) throw new CollectionsError('NOT_FOUND')

    return this.collectionsRepo.updateSchemaEntry(entryId, data)
  }

  async getPublicCollections(ownerId: string, viewerId: string | null): Promise<Collection[]> {
    const isOwner = viewerId === ownerId

    if (viewerId && !isOwner && this.friendsRepo) {
      const blocked = await this.friendsRepo.isBlockedBy(ownerId, viewerId)
      if (blocked) throw new CollectionsError('NOT_FOUND')
    }

    if (!isOwner && this.usersRepo) {
      const owner = await this.usersRepo.findById(ownerId)
      if (!owner) return []
      if (owner.privacy === 'private') return []
      if (owner.privacy === 'friends_only') {
        const isFriend = viewerId && this.friendsRepo
          ? await this.friendsRepo.areFriends(ownerId, viewerId)
          : false
        if (!isFriend) return []
      }
    }

    if (viewerId && !isOwner && this.friendsRepo) {
      const isFriend = await this.friendsRepo.areFriends(ownerId, viewerId)
      if (isFriend) {
        return this.collectionsRepo.findPublicByUserId(ownerId, ['public', 'friends_only'])
      }
    }

    if (isOwner) {
      return this.collectionsRepo.findPublicByUserId(ownerId, ['public', 'friends_only', 'private'])
    }

    return this.collectionsRepo.findPublicByUserId(ownerId, ['public'])
  }
}
