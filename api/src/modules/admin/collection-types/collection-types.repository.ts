import { eq, and, count, asc, type SQL } from 'drizzle-orm'
import type { DatabaseClient } from '../../../shared/infra/database/postgres.client.js'
import { collectionTypes } from '../../../shared/infra/database/schema.js'

export type CollectionTypeRow = typeof collectionTypes.$inferSelect
type CollectionTypeInsert = typeof collectionTypes.$inferInsert

export class CollectionTypesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findAll(opts: { page: number; limit: number; active?: boolean }): Promise<{ rows: CollectionTypeRow[]; total: number }> {
    const conditions: SQL[] = []
    if (opts.active !== undefined) conditions.push(eq(collectionTypes.active, opts.active))

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(collectionTypes)
      .where(where)

    const rows = await this.db
      .select()
      .from(collectionTypes)
      .where(where)
      .orderBy(asc(collectionTypes.key))
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit)

    return { rows, total }
  }

  async findById(id: string): Promise<CollectionTypeRow | null> {
    const [row] = await this.db.select().from(collectionTypes).where(eq(collectionTypes.id, id))
    return row ?? null
  }

  async findByKey(key: string): Promise<CollectionTypeRow | null> {
    const [row] = await this.db.select().from(collectionTypes).where(eq(collectionTypes.key, key))
    return row ?? null
  }

  async create(data: Omit<CollectionTypeInsert, 'id' | 'createdAt' | 'updatedAt'>): Promise<CollectionTypeRow> {
    const [row] = await this.db.insert(collectionTypes).values(data).returning()
    return row
  }

  async update(id: string, data: Partial<Omit<CollectionTypeInsert, 'id' | 'key' | 'createdAt'>>): Promise<CollectionTypeRow | null> {
    const [row] = await this.db
      .update(collectionTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(collectionTypes.id, id))
      .returning()
    return row ?? null
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(collectionTypes)
      .where(eq(collectionTypes.id, id))
      .returning({ id: collectionTypes.id })
    return result.length > 0
  }
}
