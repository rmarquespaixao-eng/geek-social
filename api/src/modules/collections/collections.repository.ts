import { eq, and, or, ilike, asc, desc, inArray, count, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { collections, collectionFieldSchema, collectionTypes, fieldDefinitions, items } from '../../shared/infra/database/schema.js'
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

export type CollectionStats = {
  totalCollections: number
  itemsByType: { typeKey: string; typeName: string; typeIcon: string; count: number }[]
  fieldBreakdownByType: { typeKey: string; typeName: string; typeIcon: string; fieldKey: string; fieldName: string; fieldValue: string; count: number }[]
  itemsByRating: { rating: number | null; count: number }[]
  gamesByCompletionYear: { year: number; count: number }[]
}

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

  private async attachTypeKeys<T extends { collectionTypeId: string | null }>(rows: T[]): Promise<(T & { collectionTypeKey: string | null })[]> {
    const ids = [...new Set(rows.map(r => r.collectionTypeId).filter((id): id is string => id !== null))]
    if (ids.length === 0) return rows.map(r => ({ ...r, collectionTypeKey: null }))
    const typeRows = await this.db.select({ id: collectionTypes.id, key: collectionTypes.key }).from(collectionTypes).where(inArray(collectionTypes.id, ids))
    const keyMap = new Map(typeRows.map(r => [r.id, r.key]))
    return rows.map(r => ({ ...r, collectionTypeKey: r.collectionTypeId ? (keyMap.get(r.collectionTypeId) ?? null) : null }))
  }

  async findCollectionTypeIdByKey(key: string): Promise<string | null> {
    const [row] = await this.db.select({ id: collectionTypes.id }).from(collectionTypes).where(eq(collectionTypes.key, key)).limit(1)
    return row?.id ?? null
  }

  async create(data: CreateCollectionData): Promise<Collection> {
    const result = await this.db.insert(collections).values({
      userId: data.userId,
      name: data.name,
      description: data.description,
      collectionTypeId: data.collectionTypeId ?? null,
      visibility: data.visibility ?? 'public',
      autoShareToFeed: data.autoShareToFeed ?? false,
    }).returning()
    const [withTypeKey] = await this.attachTypeKeys([result[0]])
    return { ...withTypeKey, itemCount: 0 } as Collection
  }

  async findById(id: string): Promise<CollectionWithSchema | null> {
    const rows = await this.db.select().from(collections).where(eq(collections.id, id)).limit(1)
    if (!rows[0]) return null
    const [withCount] = await this.attachCounts([rows[0]])
    const [withTypeKey] = await this.attachTypeKeys([withCount])
    const schema = await this.getFieldSchema(id)
    return { ...withTypeKey, fieldSchema: schema } as CollectionWithSchema
  }

  async findByUserId(userId: string, query?: string): Promise<Collection[]> {
    const condition = query
      ? and(eq(collections.userId, userId), ilike(collections.name, `%${query}%`))
      : eq(collections.userId, userId)
    const rows = await this.db.select().from(collections).where(condition)
    const withCounts = await this.attachCounts(rows)
    return this.attachTypeKeys(withCounts) as Promise<Collection[]>
  }

  async findPublicByUserId(userId: string, visibilities: CollectionVisibility[]): Promise<Collection[]> {
    if (visibilities.length === 0) return []
    const rows = await this.db.select().from(collections)
      .where(and(
        eq(collections.userId, userId),
        inArray(collections.visibility, visibilities),
      ))
    const withCounts = await this.attachCounts(rows)
    return this.attachTypeKeys(withCounts) as Promise<Collection[]>
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
    const [withTypeKey] = await this.attachTypeKeys([withCount])
    return withTypeKey as Collection
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

  async getStats(userId: string): Promise<CollectionStats> {
    const [totalResult, itemsByTypeRows, fieldBreakdownRows, itemsByRatingRows, gamesByYearRows] = await Promise.all([

      this.db.select({ total: count() })
        .from(collections)
        .where(eq(collections.userId, userId)),

      // innerJoin simples — sem COALESCE no SQL (evita bug de GROUP BY no Drizzle)
      this.db.select({
          typeKey: collectionTypes.key,
          typeName: collectionTypes.name,
          typeIcon: collectionTypes.icon,
          count: count(items.id),
        })
        .from(collections)
        .innerJoin(collectionTypes, eq(collections.collectionTypeId, collectionTypes.id))
        .innerJoin(items, eq(items.collectionId, collections.id))
        .where(eq(collections.userId, userId))
        .groupBy(collectionTypes.id, collectionTypes.key, collectionTypes.name, collectionTypes.icon),

      // breakdown dinâmico: todos os campos select de todos os tipos do usuário
      this.db.select({
          typeKey: collectionTypes.key,
          typeName: collectionTypes.name,
          typeIcon: collectionTypes.icon,
          fieldKey: fieldDefinitions.fieldKey,
          fieldName: fieldDefinitions.name,
          fieldValue: sql<string>`${items.fields} ->> ${fieldDefinitions.fieldKey}`,
          count: count(),
        })
        .from(items)
        .innerJoin(collections, eq(items.collectionId, collections.id))
        .innerJoin(collectionTypes, eq(collections.collectionTypeId, collectionTypes.id))
        .innerJoin(fieldDefinitions, and(
          eq(fieldDefinitions.collectionTypeId, collectionTypes.id),
          eq(fieldDefinitions.fieldType, 'select'),
          eq(fieldDefinitions.isHidden, false),
        ))
        .where(and(
          eq(collections.userId, userId),
          sql`${items.fields} ->> ${fieldDefinitions.fieldKey} IS NOT NULL`,
          sql`${items.fields} ->> ${fieldDefinitions.fieldKey} <> ''`,
        ))
        .groupBy(
          collectionTypes.id, collectionTypes.key, collectionTypes.name, collectionTypes.icon,
          fieldDefinitions.id, fieldDefinitions.fieldKey, fieldDefinitions.name,
          sql`${items.fields} ->> ${fieldDefinitions.fieldKey}`,
        )
        .orderBy(collectionTypes.key, fieldDefinitions.fieldKey, desc(count())),

      this.db.select({ rating: items.rating, count: count() })
        .from(items)
        .innerJoin(collections, eq(items.collectionId, collections.id))
        .where(eq(collections.userId, userId))
        .groupBy(items.rating),

      // jogos zerados/platinados por ano de conclusão
      this.db.select({
          year: sql<number>`EXTRACT(YEAR FROM (${items.fields}->>'completion_date')::date)::int`,
          count: count(),
        })
        .from(items)
        .innerJoin(collections, eq(items.collectionId, collections.id))
        .innerJoin(collectionTypes, eq(collections.collectionTypeId, collectionTypes.id))
        .where(and(
          eq(collections.userId, userId),
          eq(collectionTypes.key, 'games'),
          or(
            eq(sql<string>`${items.fields}->>'status'`, 'Zerado'),
            eq(sql<string>`${items.fields}->>'status'`, 'Platinado'),
          ),
          sql`(${items.fields}->>'completion_date') IS NOT NULL`,
          sql`(${items.fields}->>'completion_date') <> ''`,
        ))
        .groupBy(sql`EXTRACT(YEAR FROM (${items.fields}->>'completion_date')::date)`)
        .orderBy(sql`EXTRACT(YEAR FROM (${items.fields}->>'completion_date')::date)`),
    ])

    return {
      totalCollections: Number(totalResult[0]?.total ?? 0),
      itemsByType: itemsByTypeRows.map(r => ({
        typeKey: r.typeKey ?? 'other',
        typeName: r.typeName ?? 'Sem categoria',
        typeIcon: r.typeIcon ?? '',
        count: Number(r.count),
      })),
      fieldBreakdownByType: fieldBreakdownRows.map(r => ({
        typeKey: r.typeKey ?? 'other',
        typeName: r.typeName ?? 'Sem categoria',
        typeIcon: r.typeIcon ?? '',
        fieldKey: r.fieldKey,
        fieldName: r.fieldName,
        fieldValue: r.fieldValue,
        count: Number(r.count),
      })),
      itemsByRating: itemsByRatingRows.map(r => ({ rating: r.rating ?? null, count: Number(r.count) })),
      gamesByCompletionYear: gamesByYearRows.map(r => ({ year: Number(r.year), count: Number(r.count) })),
    }
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
