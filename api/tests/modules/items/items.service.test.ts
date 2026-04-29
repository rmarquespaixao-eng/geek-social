import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ItemsService } from '../../../src/modules/items/items.service.js'
import type { IItemRepository, Item } from '../../../src/shared/contracts/item.repository.contract.js'
import type { ICollectionRepository, CollectionWithSchema, CollectionSchemaEntry } from '../../../src/shared/contracts/collection.repository.contract.js'
import type { FieldDefinition } from '../../../src/shared/contracts/field-definition.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'
import type { IPostsService } from '../../../src/shared/contracts/posts.service.contract.js'

function createMockPostsService(): IPostsService {
  return {
    createItemShare: vi.fn(),
  }
}

function createMockItemRepository(): IItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByCollectionId: vi.fn(),
    searchByCollection: vi.fn(),
    findByCollectionAndAppId: vi.fn(),
    findExistingSteamItemsForUser: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as IItemRepository
}

function createMockCollectionRepository(): ICollectionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findPublicByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addFieldsToSchema: vi.fn(),
    getFieldSchema: vi.fn(),
    getFieldSchemasForCollections: vi.fn().mockResolvedValue({}),
    addOneToSchema: vi.fn(),
    findSchemaEntry: vi.fn(),
    updateSchemaEntry: vi.fn(),
    removeFromSchema: vi.fn(),
    hasFieldKeyInCollection: vi.fn(),
  }
}

function createMockFieldDef(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'fd-1',
    userId: null,
    name: 'Plataforma',
    fieldKey: 'platform',
    fieldType: 'select',
    collectionType: 'games',
    selectOptions: ['PS2', 'PC'],
    isSystem: true,
    createdAt: new Date(),
    ...overrides,
  }
}

function createMockSchemaEntry(overrides: Partial<CollectionSchemaEntry> = {}): CollectionSchemaEntry {
  return {
    id: 'cfs-1',
    fieldDefinition: createMockFieldDef(),
    isRequired: false,
    displayOrder: 0,
    ...overrides,
  }
}

function createMockCollection(userId = 'user-1', schema: CollectionSchemaEntry[] = []): CollectionWithSchema {
  return {
    id: 'col-1',
    userId,
    name: 'Games',
    description: null,
    iconUrl: null,
    coverUrl: null,
    type: 'games',
    visibility: 'public',
    createdAt: new Date(),
    updatedAt: new Date(),
    fieldSchema: schema,
  }
}

function createMockFriendsRepository(): IFriendsRepository {
  return {
    createRequest: vi.fn(),
    findRequestById: vi.fn(),
    findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(),
    findSentRequests: vi.fn(),
    updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(),
    areFriends: vi.fn(),
    removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(),
    deleteBlock: vi.fn(),
    isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(),
    findBlocksByBlocker: vi.fn(),
    findAllBlockRelationUserIds: vi.fn(),
  }
}

function createMockItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    collectionId: 'col-1',
    name: 'God of War',
    coverUrl: null,
    fields: {},
    rating: null,
    comment: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('ItemsService', () => {
  let itemRepo: ReturnType<typeof createMockItemRepository>
  let collRepo: ReturnType<typeof createMockCollectionRepository>
  let friendsRepo: ReturnType<typeof createMockFriendsRepository>
  let service: ItemsService

  beforeEach(() => {
    itemRepo = createMockItemRepository()
    collRepo = createMockCollectionRepository()
    friendsRepo = createMockFriendsRepository()
    service = new ItemsService(itemRepo, collRepo, undefined, friendsRepo)
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('deve criar item com campos válidos', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(
        createMockCollection('user-1', [createMockSchemaEntry()]),
      )
      vi.mocked(itemRepo.create).mockResolvedValue(createMockItem({ fields: { platform: 'PS2' } }))

      const result = await service.create('user-1', 'col-1', {
        name: 'God of War',
        fields: { platform: 'PS2' },
      })

      expect(result.name).toBe('God of War')
      expect(itemRepo.create).toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND se coleção pertence a outro usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('outro-user'))

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: {} }))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar REQUIRED_FIELD_MISSING se campo obrigatório ausente', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(
        createMockCollection('user-1', [createMockSchemaEntry({ isRequired: true })]),
      )

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: {} }))
        .rejects.toThrow('REQUIRED_FIELD_MISSING')
    })

    it('deve lançar INVALID_FIELD_TYPE para valor não-número em campo number', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(
        createMockCollection('user-1', [
          createMockSchemaEntry({ fieldDefinition: createMockFieldDef({ fieldType: 'number', fieldKey: 'year' }) }),
        ]),
      )

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: { year: 'não é número' } }))
        .rejects.toThrow('INVALID_FIELD_TYPE')
    })

    it('deve lançar INVALID_FIELD_VALUE para valor fora do select', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(
        createMockCollection('user-1', [createMockSchemaEntry()]), // platform: select ['PS2', 'PC']
      )

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: { platform: 'Atari' } }))
        .rejects.toThrow('INVALID_FIELD_VALUE')
    })

    it('deve lançar INVALID_RATING para rating fora do range', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('user-1'))

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: {}, rating: 6 }))
        .rejects.toThrow('INVALID_RATING')
    })
  })

  describe('get', () => {
    it('deve retornar item se pertence à coleção do usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('user-1'))
      vi.mocked(itemRepo.findById).mockResolvedValue(createMockItem())

      const result = await service.get('user-1', 'col-1', 'item-1')

      expect(result).toBeDefined()
    })

    it('deve lançar NOT_FOUND se item é de outra coleção', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('user-1'))
      vi.mocked(itemRepo.findById).mockResolvedValue(createMockItem({ collectionId: 'outra-col' }))

      await expect(service.get('user-1', 'col-1', 'item-1'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('delete', () => {
    it('deve excluir item da coleção do usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('user-1'))
      vi.mocked(itemRepo.findById).mockResolvedValue(createMockItem())

      await service.delete('user-1', 'col-1', 'item-1')

      expect(itemRepo.delete).toHaveBeenCalledWith('item-1')
    })
  })

  describe('listPublicItems — friends_only', () => {
    it('deve retornar itens de coleção friends_only para viewer que é amigo', async () => {
      const collection = createMockCollection('owner-id')
      vi.mocked(collRepo.findById).mockResolvedValue({ ...collection, visibility: 'friends_only', fieldSchema: [] })
      vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)
      vi.mocked(itemRepo.findByCollectionId).mockResolvedValue([])

      await service.listPublicItems('col-uuid-1', 'owner-id', 'friend-id')

      expect(itemRepo.findByCollectionId).toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND para coleção friends_only quando viewer não é amigo', async () => {
      const collection = createMockCollection('owner-id')
      vi.mocked(collRepo.findById).mockResolvedValue({ ...collection, visibility: 'friends_only', fieldSchema: [] })
      vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)

      await expect(service.listPublicItems('col-uuid-1', 'owner-id', 'viewer-id'))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND para coleção friends_only quando viewer é anônimo', async () => {
      const collection = createMockCollection('owner-id')
      vi.mocked(collRepo.findById).mockResolvedValue({ ...collection, visibility: 'friends_only', fieldSchema: [] })

      await expect(service.listPublicItems('col-uuid-1', 'owner-id', null))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND se viewer foi bloqueado pelo dono', async () => {
      const collection = createMockCollection('owner-id')
      vi.mocked(collRepo.findById).mockResolvedValue({ ...collection, visibility: 'public', fieldSchema: [] })
      vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(true)

      await expect(service.listPublicItems('col-uuid-1', 'owner-id', 'viewer-id'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('create com shareToFeed', () => {
    let postsService: IPostsService

    beforeEach(() => {
      postsService = createMockPostsService()
      service = new ItemsService(itemRepo, collRepo, undefined, friendsRepo, postsService)
    })

    it('deve chamar createItemShare quando shareToFeed=true e coleção é public', async () => {
      const col = createMockCollection('user-1', [])
      vi.mocked(collRepo.findById).mockResolvedValue(col)
      vi.mocked(itemRepo.create).mockResolvedValue(createMockItem())
      vi.mocked(postsService.createItemShare).mockResolvedValue()

      await service.create('user-1', col.id, { name: 'Item', fields: {}, shareToFeed: true })

      expect(postsService.createItemShare).toHaveBeenCalledWith({
        userId: 'user-1',
        itemId: expect.any(String),
        collectionId: col.id,
        collectionVisibility: 'public',
      })
    })

    it('não deve chamar createItemShare quando shareToFeed=false', async () => {
      const col = createMockCollection('user-1', [])
      vi.mocked(collRepo.findById).mockResolvedValue(col)
      vi.mocked(itemRepo.create).mockResolvedValue(createMockItem())

      await service.create('user-1', col.id, { name: 'Item', fields: {}, shareToFeed: false })

      expect(postsService.createItemShare).not.toHaveBeenCalled()
    })
  })
})
