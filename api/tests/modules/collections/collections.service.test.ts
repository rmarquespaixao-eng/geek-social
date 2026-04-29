import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionsService } from '../../../src/modules/collections/collections.service.js'
import type { ICollectionRepository, Collection, CollectionWithSchema } from '../../../src/shared/contracts/collection.repository.contract.js'
import type { IFieldDefinitionRepository, FieldDefinition } from '../../../src/shared/contracts/field-definition.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

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

function createMockFieldDefRepository(): IFieldDefinitionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findSystemByCollectionType: vi.fn(),
    isFieldKeyTaken: vi.fn(),
    isInUse: vi.fn(),
    delete: vi.fn(),
    upsertSystem: vi.fn(),
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

function createMockCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-uuid-1',
    userId: 'user-uuid-1',
    name: 'Minha Coleção',
    description: null,
    iconUrl: null,
    coverUrl: null,
    type: 'games',
    visibility: 'public',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function createMockFieldDef(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'fd-uuid-1',
    userId: null,
    name: 'Plataforma',
    fieldKey: 'platform',
    fieldType: 'select',
    collectionType: 'games',
    selectOptions: ['PS2', 'PC'],
    isSystem: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('CollectionsService', () => {
  let collRepo: ReturnType<typeof createMockCollectionRepository>
  let fdRepo: ReturnType<typeof createMockFieldDefRepository>
  let friendsRepo: ReturnType<typeof createMockFriendsRepository>
  let service: CollectionsService

  beforeEach(() => {
    collRepo = createMockCollectionRepository()
    fdRepo = createMockFieldDefRepository()
    friendsRepo = createMockFriendsRepository()
    service = new CollectionsService(collRepo, fdRepo, undefined, friendsRepo)
    vi.clearAllMocks()
  })

  describe('create — tipo padrão', () => {
    it('deve criar coleção de jogos e popular schema com campos de sistema', async () => {
      const col = createMockCollection()
      const systemFields = [createMockFieldDef(), createMockFieldDef({ id: 'fd-2', fieldKey: 'genre' })]
      vi.mocked(collRepo.create).mockResolvedValue(col)
      vi.mocked(fdRepo.findSystemByCollectionType).mockResolvedValue(systemFields)
      vi.mocked(collRepo.addFieldsToSchema).mockResolvedValue()
      vi.mocked(collRepo.findById).mockResolvedValue({ ...col, fieldSchema: [] })

      await service.create('user-uuid-1', { name: 'PS2', type: 'games', visibility: 'public' })

      expect(fdRepo.findSystemByCollectionType).toHaveBeenCalledWith('games')
      expect(collRepo.addFieldsToSchema).toHaveBeenCalledWith(
        col.id,
        expect.arrayContaining([
          expect.objectContaining({ fieldDefinitionId: 'fd-uuid-1' }),
          expect.objectContaining({ fieldDefinitionId: 'fd-2' }),
        ]),
      )
    })
  })

  describe('create — tipo custom', () => {
    it('deve criar coleção custom sem popular schema quando sem fieldDefinitionIds', async () => {
      const col = createMockCollection({ type: 'custom' })
      vi.mocked(collRepo.create).mockResolvedValue(col)
      vi.mocked(collRepo.findById).mockResolvedValue({ ...col, fieldSchema: [] })

      await service.create('user-uuid-1', { name: 'Custom', type: 'custom', visibility: 'public' })

      expect(fdRepo.findSystemByCollectionType).not.toHaveBeenCalled()
      expect(collRepo.addFieldsToSchema).not.toHaveBeenCalled()
    })

    it('deve popular schema com fieldDefinitionIds fornecidos', async () => {
      const col = createMockCollection({ type: 'custom' })
      const fd1 = createMockFieldDef({ id: 'fd-uuid-1', userId: 'user-uuid-1', isSystem: false, collectionType: null })
      const fd2 = createMockFieldDef({ id: 'fd-uuid-2', userId: 'user-uuid-1', isSystem: false, collectionType: null })
      vi.mocked(collRepo.create).mockResolvedValue(col)
      vi.mocked(collRepo.findById).mockResolvedValue({ ...col, fieldSchema: [] })
      vi.mocked(collRepo.addFieldsToSchema).mockResolvedValue()
      vi.mocked(fdRepo.findByUserId).mockResolvedValue([fd1, fd2])
      vi.mocked(fdRepo.findById).mockImplementation(async (id) => {
        if (id === 'fd-uuid-1') return fd1
        if (id === 'fd-uuid-2') return fd2
        return null
      })

      await service.create('user-uuid-1', {
        name: 'Custom',
        type: 'custom',
        visibility: 'public',
        fieldDefinitionIds: ['fd-uuid-1', 'fd-uuid-2'],
      })

      expect(collRepo.addFieldsToSchema).toHaveBeenCalledWith(
        col.id,
        expect.arrayContaining([
          expect.objectContaining({ fieldDefinitionId: 'fd-uuid-1' }),
          expect.objectContaining({ fieldDefinitionId: 'fd-uuid-2' }),
        ]),
      )
    })
  })

  describe('get', () => {
    it('deve retornar coleção com schema para o dono', async () => {
      const col: CollectionWithSchema = { ...createMockCollection(), fieldSchema: [] }
      vi.mocked(collRepo.findById).mockResolvedValue(col)

      const result = await service.get('user-uuid-1', 'col-uuid-1')

      expect(result).toBeDefined()
    })

    it('deve lançar NOT_FOUND se coleção pertence a outro usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue({
        ...createMockCollection({ userId: 'outro-user' }),
        fieldSchema: [],
      })

      await expect(service.get('user-uuid-1', 'col-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND se coleção não existe', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(null)

      await expect(service.get('user-uuid-1', 'col-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('delete', () => {
    it('deve excluir coleção do dono', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue({ ...createMockCollection(), fieldSchema: [] })

      await service.delete('user-uuid-1', 'col-uuid-1')

      expect(collRepo.delete).toHaveBeenCalledWith('col-uuid-1')
    })

    it('deve lançar NOT_FOUND se tentar excluir coleção de outro usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue({
        ...createMockCollection({ userId: 'outro-user' }),
        fieldSchema: [],
      })

      await expect(service.delete('user-uuid-1', 'col-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('getPublicCollections', () => {
    it('deve retornar apenas coleções públicas para viewer anônimo', async () => {
      const publicCol = createMockCollection({ visibility: 'public' })
      vi.mocked(collRepo.findPublicByUserId).mockResolvedValue([publicCol])

      const result = await service.getPublicCollections('owner-id', null)

      expect(collRepo.findPublicByUserId).toHaveBeenCalledWith('owner-id', ['public'])
      expect(result).toHaveLength(1)
    })

    it('deve retornar coleções públicas e friends_only para viewer que é amigo', async () => {
      const publicCol = createMockCollection({ visibility: 'public' })
      const friendsCol = createMockCollection({ id: 'col-uuid-2', visibility: 'friends_only' })
      vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)
      vi.mocked(collRepo.findPublicByUserId).mockResolvedValue([publicCol, friendsCol])

      const result = await service.getPublicCollections('owner-id', 'viewer-id')

      expect(collRepo.findPublicByUserId).toHaveBeenCalledWith('owner-id', ['public', 'friends_only'])
      expect(result).toHaveLength(2)
    })

    it('deve retornar apenas coleções públicas para viewer que não é amigo', async () => {
      const publicCol = createMockCollection({ visibility: 'public' })
      vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)
      vi.mocked(collRepo.findPublicByUserId).mockResolvedValue([publicCol])

      const result = await service.getPublicCollections('owner-id', 'viewer-id')

      expect(collRepo.findPublicByUserId).toHaveBeenCalledWith('owner-id', ['public'])
      expect(result).toHaveLength(1)
    })

    it('deve lançar NOT_FOUND se o viewer foi bloqueado pelo dono', async () => {
      vi.mocked(friendsRepo.isBlockedBy).mockResolvedValue(true)

      await expect(service.getPublicCollections('owner-id', 'viewer-id'))
        .rejects.toThrow('NOT_FOUND')
      expect(collRepo.findPublicByUserId).not.toHaveBeenCalled()
    })
  })
})
