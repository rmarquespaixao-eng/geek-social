import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FieldDefinitionsService } from '../../../src/modules/field-definitions/field-definitions.service.js'
import type { IFieldDefinitionRepository, FieldDefinition } from '../../../src/shared/contracts/field-definition.repository.contract.js'

function createMockFieldDefinitionRepository(): IFieldDefinitionRepository {
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

function createMockFieldDef(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'fd-uuid-1',
    userId: 'user-uuid-1',
    name: 'Plataforma',
    fieldKey: 'plataforma',
    fieldType: 'text',
    collectionType: null,
    selectOptions: null,
    isSystem: false,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('FieldDefinitionsService', () => {
  let repo: ReturnType<typeof createMockFieldDefinitionRepository>
  let service: FieldDefinitionsService

  beforeEach(() => {
    repo = createMockFieldDefinitionRepository()
    service = new FieldDefinitionsService(repo)
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('deve criar campo com field_key gerado automaticamente', async () => {
      vi.mocked(repo.isFieldKeyTaken).mockResolvedValue(false)
      vi.mocked(repo.create).mockResolvedValue(createMockFieldDef({ name: 'Número de Série', fieldKey: 'numero_de_serie' }))

      const result = await service.create('user-uuid-1', { name: 'Número de Série', fieldType: 'text' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ fieldKey: 'numero_de_serie' }))
      expect(result.fieldKey).toBe('numero_de_serie')
    })

    it('deve lançar erro se field_key já existe para o usuário', async () => {
      vi.mocked(repo.isFieldKeyTaken).mockResolvedValue(true)

      await expect(service.create('user-uuid-1', { name: 'Plataforma', fieldType: 'text' }))
        .rejects.toThrow('FIELD_KEY_ALREADY_EXISTS')
    })

    it('deve aceitar campo do tipo select com opções', async () => {
      vi.mocked(repo.isFieldKeyTaken).mockResolvedValue(false)
      vi.mocked(repo.create).mockResolvedValue(createMockFieldDef({
        fieldType: 'select',
        selectOptions: ['A', 'B'],
      }))

      const result = await service.create('user-uuid-1', {
        name: 'Tamanho',
        fieldType: 'select',
        selectOptions: ['A', 'B'],
      })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ selectOptions: ['A', 'B'] }))
      expect(result.fieldType).toBe('select')
    })
  })

  describe('listByUser', () => {
    it('deve retornar definições do usuário', async () => {
      const defs = [createMockFieldDef(), createMockFieldDef({ id: 'fd-2' })]
      vi.mocked(repo.findByUserId).mockResolvedValue(defs)

      const result = await service.listByUser('user-uuid-1')

      expect(repo.findByUserId).toHaveBeenCalledWith('user-uuid-1')
      expect(result).toHaveLength(2)
    })
  })

  describe('delete', () => {
    it('deve excluir definição que não está em uso', async () => {
      vi.mocked(repo.findById).mockResolvedValue(createMockFieldDef())
      vi.mocked(repo.isInUse).mockResolvedValue(false)

      await service.delete('user-uuid-1', 'fd-uuid-1')

      expect(repo.delete).toHaveBeenCalledWith('fd-uuid-1')
    })

    it('deve lançar erro se definição está em uso', async () => {
      vi.mocked(repo.findById).mockResolvedValue(createMockFieldDef())
      vi.mocked(repo.isInUse).mockResolvedValue(true)

      await expect(service.delete('user-uuid-1', 'fd-uuid-1'))
        .rejects.toThrow('FIELD_IN_USE')
    })

    it('deve lançar erro se definição não pertence ao usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(createMockFieldDef({ userId: 'outro-user' }))

      await expect(service.delete('user-uuid-1', 'fd-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar erro se definição é de sistema', async () => {
      vi.mocked(repo.findById).mockResolvedValue(createMockFieldDef({ userId: null, isSystem: true }))

      await expect(service.delete('user-uuid-1', 'fd-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })
  })
})
