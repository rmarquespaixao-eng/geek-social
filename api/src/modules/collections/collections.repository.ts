import { eq, and, ilike, asc, inArray, count } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { collections, collectionFieldSchema, fieldDefinitions, items } from '../../shared/infra/database/schema.js'
import type {
  ICollectionRepository,
  Collection,
  CollectionWithSchema,
  CollectionSchemaEntry,
  CreateCollectionData,
  UpdateCollectionData,
  SchemaEntryData,
  CollectionVisibility,
} from '../../shared/contracts/collection.repository.contract.js'

export class CollectionsRepository implements ICollectionRepository {
  constructor(private readonly db: DatabaseClient) {}

  /** Conta items de uma lista de coleções via single query agrupado. */
  private async countItemsBy(collectionIds: string[]): Promise<Record<string, number>> {
    if (collectionIds.length === 0) return {}
    const rows = await this.db
      .select({ collectionId: items.collectionId, count: count() })
      .from(items)
      .where(inArray(items.collectionId, collectionIds))
      .groupBy(items.collectionId)
    const map: Record<string, number> = {}
    for (const row of rows) map[row.collectionId] = Number(row.count)
    return map
  }

  private async attachCounts<T extends { id: string }>(rows: T[]): Promise<(T & { itemCount: number })[]> {
    const counts = await this.countItemsBy(rows.map(r => r.id))
    return rows.map(r => ({ ...r, itemCount: counts[r.id] ?? 0 }))
  }

  async create(data: CreateCollectionData): Promise<Collection> {
    const result = await this.db.insert(collections).values({
      userId: data.userId,
      name: data.name,
      description: data.description,
      type: data.type,
      visibility: data.visibility ?? 'public',
      autoShareToFeed: data.autoShareToFeed ?? false,
    }).returning()
    return { ...result[0], itemCount: 0 } as Collection
  }

  async findById(id: string): Promise<CollectionWithSchema | null> {
    const rows = await this.db.select().from(collections).where(eq(collections.id, id)).limit(1)
    if (!rows[0]) return null
    const [withCount] = await this.attachCounts([rows[0]])
    const schema = await this.getFieldSchema(id)
    return { ...withCount, fieldSchema: schema } as CollectionWithSchema
  }

  async findByUserId(userId: string, query?: string): Promise<Collection[]> {
    const condition = query
      ? and(eq(collections.userId, userId), ilike(collections.name, `%${query}%`))
      : eq(collections.userId, userId)
    const rows = await this.db.select().from(collections).where(condition)
    return this.attachCounts(rows) as Promise<Collection[]>
  }

  async findPublicByUserId(userId: string, visibilities: CollectionVisibility[]): Promise<Collection[]> {
    if (visibilities.length === 0) return []
    const rows = await this.db.select().from(collections)
      .where(and(
        eq(collections.userId, userId),
        inArray(collections.visibility, visibilities),
      ))
    return this.attachCounts(rows) as Promise<Collection[]>
  }

  async update(id: string, data: UpdateCollectionData): Promise<Collection> {
    const result = await this.db.update(collections)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.visibility !== undefined && { visibility: data.visibility }),
        ...(data.autoShareToFeed !== undefined && { autoShareToFeed: data.autoShareToFeed }),
        ...(data.iconUrl !== undefined && { iconUrl: data.iconUrl }),
        ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
        updatedAt: new Date(),
      })
      .where(eq(collections.id, id))
      .returning()
    const [withCount] = await this.attachCounts([result[0]])
    return withCount as Collection
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(collections).where(eq(collections.id, id))
  }

  async addFieldsToSchema(collectionId: string, fields: SchemaEntryData[]): Promise<void> {
    if (fields.length === 0) return
    await this.db.insert(collectionFieldSchema).values(
      fields.map(f => ({
        collectionId,
        fieldDefinitionId: f.fieldDefinitionId,
        isRequired: f.isRequired,
        displayOrder: f.displayOrder,
      })),
    )
  }

  async addOneToSchema(collectionId: string, data: SchemaEntryData): Promise<CollectionSchemaEntry> {
    const inserted = await this.db.insert(collectionFieldSchema).values({
      collectionId,
      fieldDefinitionId: data.fieldDefinitionId,
      isRequired: data.isRequired,
      displayOrder: data.displayOrder,
    }).returning()
    const entryId = inserted[0].id
    const entry = await this.db
      .select({
        id: collectionFieldSchema.id,
        isRequired: collectionFieldSchema.isRequired,
        displayOrder: collectionFieldSchema.displayOrder,
        fieldDefinition: fieldDefinitions,
      })
      .from(collectionFieldSchema)
      .innerJoin(fieldDefinitions, eq(collectionFieldSchema.fieldDefinitionId, fieldDefinitions.id))
      .where(eq(collectionFieldSchema.id, entryId))
      .limit(1)
    return entry[0] as unknown as CollectionSchemaEntry
  }

  async findSchemaEntry(entryId: string): Promise<(CollectionSchemaEntry & { collectionId: string }) | null> {
    const result = await this.db
      .select({
        id: collectionFieldSchema.id,
        collectionId: collectionFieldSchema.collectionId,
        isRequired: collectionFieldSchema.isRequired,
        displayOrder: collectionFieldSchema.displayOrder,
        fieldDefinition: fieldDefinitions,
      })
      .from(collectionFieldSchema)
      .innerJoin(fieldDefinitions, eq(collectionFieldSchema.fieldDefinitionId, fieldDefinitions.id))
      .where(eq(collectionFieldSchema.id, entryId))
      .limit(1)
    return (result[0] as unknown as (CollectionSchemaEntry & { collectionId: string })) ?? null
  }

  async updateSchemaEntry(entryId: string, data: { isRequired?: boolean; displayOrder?: number }): Promise<CollectionSchemaEntry> {
    await this.db.update(collectionFieldSchema)
      .set(data)
      .where(eq(collectionFieldSchema.id, entryId))
    const result = await this.db
      .select({
        id: collectionFieldSchema.id,
        isRequired: collectionFieldSchema.isRequired,
        displayOrder: collectionFieldSchema.displayOrder,
        fieldDefinition: fieldDefinitions,
      })
      .from(collectionFieldSchema)
      .innerJoin(fieldDefinitions, eq(collectionFieldSchema.fieldDefinitionId, fieldDefinitions.id))
      .where(eq(collectionFieldSchema.id, entryId))
      .limit(1)
    return result[0] as unknown as CollectionSchemaEntry
  }

  async removeFromSchema(entryId: string): Promise<void> {
    await this.db.delete(collectionFieldSchema).where(eq(collectionFieldSchema.id, entryId))
  }

  async hasFieldKeyInCollection(collectionId: string, fieldKey: string): Promise<boolean> {
    const result = await this.db
      .select({ id: collectionFieldSchema.id })
      .from(collectionFieldSchema)
      .innerJoin(fieldDefinitions, eq(collectionFieldSchema.fieldDefinitionId, fieldDefinitions.id))
      .where(and(
        eq(collectionFieldSchema.collectionId, collectionId),
        eq(fieldDefinitions.fieldKey, fieldKey),
      ))
      .limit(1)
    return result.length > 0
  }

  async getFieldSchema(collectionId: string): Promise<CollectionSchemaEntry[]> {
    const rows = await this.db
      .select({
        id: collectionFieldSchema.id,
        isRequired: collectionFieldSchema.isRequired,
        displayOrder: collectionFieldSchema.displayOrder,
        fieldDefinition: fieldDefinitions,
      })
      .from(collectionFieldSchema)
      .innerJoin(fieldDefinitions, eq(collectionFieldSchema.fieldDefinitionId, fieldDefinitions.id))
      .where(eq(collectionFieldSchema.collectionId, collectionId))
      .orderBy(asc(collectionFieldSchema.displayOrder))
    return rows as unknown as CollectionSchemaEntry[]
  }

  async getFieldSchemasForCollections(collectionIds: string[]): Promise<Record<string, CollectionSchemaEntry[]>> {
    const result: Record<string, CollectionSchemaEntry[]> = {}
    if (collectionIds.length === 0) return result
    const rows = await this.db
      .select({
        collectionId: collectionFieldSchema.collectionId,
        id: collectionFieldSchema.id,
        isRequired: collectionFieldSchema.isRequired,
        displayOrder: collectionFieldSchema.displayOrder,
        fieldDefinition: fieldDefinitions,
      })
      .from(collectionFieldSchema)
      .innerJoin(fieldDefinitions, eq(collectionFieldSchema.fieldDefinitionId, fieldDefinitions.id))
      .where(inArray(collectionFieldSchema.collectionId, collectionIds))
      .orderBy(asc(collectionFieldSchema.displayOrder))
    for (const row of rows) {
      const { collectionId, ...entry } = row
      if (!result[collectionId]) result[collectionId] = []
      result[collectionId].push(entry as unknown as CollectionSchemaEntry)
    }
    return result
  }
}
