import type { IFieldDefinitionRepository, FieldDefinition } from '../../shared/contracts/field-definition.repository.contract.js'
import type { CreateFieldDefinitionInput } from './field-definitions.schema.js'

export class FieldDefinitionsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'FieldDefinitionsError'
  }
}

function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export class FieldDefinitionsService {
  constructor(private readonly repo: IFieldDefinitionRepository) {}

  async create(userId: string, input: CreateFieldDefinitionInput): Promise<FieldDefinition> {
    const fieldKey = toSlug(input.name)
    if (!fieldKey) throw new FieldDefinitionsError('INVALID_NAME')
    const taken = await this.repo.isFieldKeyTaken(userId, fieldKey)
    if (taken) throw new FieldDefinitionsError('FIELD_KEY_ALREADY_EXISTS')

    return this.repo.create({
      userId,
      name: input.name,
      fieldKey,
      fieldType: input.fieldType,
      selectOptions: input.selectOptions,
    })
  }

  async listByUser(userId: string): Promise<FieldDefinition[]> {
    return this.repo.findByUserId(userId)
  }

  async delete(userId: string, id: string): Promise<void> {
    const def = await this.repo.findById(id)
    if (!def || def.userId !== userId || def.isSystem) {
      throw new FieldDefinitionsError('NOT_FOUND')
    }
    const inUse = await this.repo.isInUse(id)
    if (inUse) throw new FieldDefinitionsError('FIELD_IN_USE')
    await this.repo.delete(id)
  }
}
