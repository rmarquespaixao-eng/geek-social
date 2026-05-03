import { eq, and, count } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { fieldDefinitions, collectionFieldSchema } from '../../shared/infra/database/schema.js'
import type {
  IFieldDefinitionRepository,
  FieldDefinition,
  CreateFieldDefinitionData,
} from '../../shared/contracts/field-definition.repository.contract.js'

export class FieldDefinitionRepository implements IFieldDefinitionRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateFieldDefinitionData): Promise<FieldDefinition> {
    const result = await this.db.insert(fieldDefinitions).values({
      userId: data.userId,
      name: data.name,
      fieldKey: data.fieldKey,
      fieldType: data.fieldType,
      selectOptions: data.selectOptions ?? null,
      isSystem: false,
    }).returning()
    return result[0] as FieldDefinition
  }

  async findById(id: string): Promise<FieldDefinition | null> {
    const result = await this.db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1)
    return (result[0] as FieldDefinition) ?? null
  }

  async findByUserId(userId: string): Promise<FieldDefinition[]> {
    return this.db.select().from(fieldDefinitions)
      .where(eq(fieldDefinitions.userId, userId)) as Promise<FieldDefinition[]>
  }

  async findSystemByCollectionTypeId(collectionTypeId: string): Promise<FieldDefinition[]> {
    return this.db.select().from(fieldDefinitions)
      .where(and(
        eq(fieldDefinitions.isSystem, true),
        eq(fieldDefinitions.collectionTypeId, collectionTypeId),
      )) as Promise<FieldDefinition[]>
  }

  async isFieldKeyTaken(userId: string, fieldKey: string): Promise<boolean> {
    const result = await this.db.select({ count: count() }).from(fieldDefinitions)
      .where(and(eq(fieldDefinitions.userId, userId), eq(fieldDefinitions.fieldKey, fieldKey)))
    return (result[0]?.count ?? 0) > 0
  }

  async isInUse(id: string): Promise<boolean> {
    const result = await this.db.select({ count: count() }).from(collectionFieldSchema)
      .where(eq(collectionFieldSchema.fieldDefinitionId, id))
    return (result[0]?.count ?? 0) > 0
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, id))
  }

  async upsertSystem(data: Omit<FieldDefinition, 'id' | 'createdAt' | 'isHidden'> & { isHidden?: boolean }): Promise<void> {
    const conditions = [
      eq(fieldDefinitions.isSystem, true),
      eq(fieldDefinitions.fieldKey, data.fieldKey),
    ]
    if (data.collectionTypeId) {
      conditions.push(eq(fieldDefinitions.collectionTypeId, data.collectionTypeId))
    }

    const existing = await this.db.select({ id: fieldDefinitions.id })
      .from(fieldDefinitions)
      .where(and(...conditions))
      .limit(1)

    if (existing.length > 0) {
      await this.db.update(fieldDefinitions)
        .set({
          name: data.name,
          fieldType: data.fieldType,
          selectOptions: data.selectOptions ?? null,
          isHidden: data.isHidden ?? false,
          ...(data.collectionTypeId ? { collectionTypeId: data.collectionTypeId } : {}),
        })
        .where(eq(fieldDefinitions.id, existing[0].id))
      return
    }
    await this.db.insert(fieldDefinitions).values({
      userId: null,
      name: data.name,
      fieldKey: data.fieldKey,
      fieldType: data.fieldType,
      collectionTypeId: data.collectionTypeId ?? null,
      selectOptions: data.selectOptions ?? null,
      isSystem: true,
      isHidden: data.isHidden ?? false,
    })
  }
}
