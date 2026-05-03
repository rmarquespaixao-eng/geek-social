import { eq, and, or, ilike, sql, type SQL } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { items, collections, collectionTypes } from '../../shared/infra/database/schema.js'
import type {
  IItemRepository, Item, CreateItemData, UpdateItemData, ExistingSteamItem,
  SearchItemsParams, ItemsPage, FieldFilter,
} from '../../shared/contracts/item.repository.contract.js'

type CursorPayload = { k: string | number | null; id: string }

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
    if (typeof parsed?.id !== 'string') return null
    return parsed as CursorPayload
  } catch { return null }
}

function fieldExpr(key: string): SQL<string> {
  return sql<string>`${items.fields}->>${key}`
}

export class ItemsRepository implements IItemRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateItemData): Promise<Item> {
    const result = await this.db.insert(items).values({
      collectionId: data.collectionId,
      name: data.name,
      fields: data.fields ?? {},
      rating: data.rating,
      comment: data.comment,
    }).returning()
    return result[0] as Item
  }

  async findById(id: string): Promise<Item | null> {
    const result = await this.db.select().from(items).where(eq(items.id, id)).limit(1)
    return (result[0] as Item) ?? null
  }

  async findByCollectionId(collectionId: string, query?: string): Promise<Item[]> {
    const condition = query
      ? and(
          eq(items.collectionId, collectionId),
          or(
            ilike(items.name, `%${query}%`),
            sql`${items.fields}::text ILIKE ${`%${query}%`}`,
          ),
        )
      : eq(items.collectionId, collectionId)
    return this.db.select().from(items).where(condition) as Promise<Item[]>
  }

  async searchByCollection(params: SearchItemsParams): Promise<ItemsPage> {
    const conditions: SQL[] = [eq(items.collectionId, params.collectionId)]

    if (params.q) {
      const like = `%${params.q}%`
      conditions.push(or(
        ilike(items.name, like),
        sql`${items.fields}::text ILIKE ${like}`,
      )!)
    }

    if (params.ratingMin !== undefined) {
      conditions.push(sql`${items.rating} >= ${params.ratingMin}`)
    }

    if (params.hasCover === true) {
      conditions.push(sql`${items.coverUrl} IS NOT NULL`)
    } else if (params.hasCover === false) {
      conditions.push(sql`${items.coverUrl} IS NULL`)
    }

    for (const f of params.fieldFilters ?? []) {
      const expr = fieldExpr(f.fieldKey)
      if (f.fieldType === 'text') {
        if (f.contains) conditions.push(sql`${expr} ILIKE ${`%${f.contains}%`}`)
      } else if (f.fieldType === 'select') {
        if (f.equalsAny && f.equalsAny.length > 0) {
          conditions.push(sql`${expr} = ANY(${f.equalsAny}::text[])`)
        }
      } else if (f.fieldType === 'boolean') {
        if (f.boolValue !== undefined) {
          conditions.push(sql`${expr} = ${f.boolValue ? 'true' : 'false'}`)
        }
      } else if (f.fieldType === 'number' || f.fieldType === 'money') {
        if (f.gte !== undefined) conditions.push(sql`(${expr})::numeric >= ${f.gte}`)
        if (f.lte !== undefined) conditions.push(sql`(${expr})::numeric <= ${f.lte}`)
      } else if (f.fieldType === 'date') {
        if (f.gte !== undefined) conditions.push(sql`(${expr})::timestamptz >= ${f.gte}`)
        if (f.lte !== undefined) conditions.push(sql`(${expr})::timestamptz <= ${f.lte}`)
      }
    }

    const cursor = params.cursor ? decodeCursor(params.cursor) : null
    const orderClauses = this.buildOrder(params.sort)
    const cursorCondition = cursor ? this.buildCursorCondition(params.sort, cursor) : null
    if (cursorCondition) conditions.push(cursorCondition)

    const rows = await this.db.select().from(items)
      .where(and(...conditions))
      .orderBy(...orderClauses)
      .limit(params.limit + 1)

    let nextCursor: string | null = null
    let result = rows as Item[]
    if (rows.length > params.limit) {
      result = rows.slice(0, params.limit) as Item[]
      const last = result[result.length - 1]
      nextCursor = encodeCursor({ k: this.cursorKey(params.sort, last), id: last.id })
    }

    return { items: result, nextCursor }
  }

  private buildOrder(sort: SearchItemsParams['sort']): SQL[] {
    switch (sort) {
      case 'recent':
        return [sql`${items.createdAt} DESC`, sql`${items.id} DESC`]
      case 'oldest':
        return [sql`${items.createdAt} ASC`, sql`${items.id} ASC`]
      case 'name':
        return [sql`LOWER(${items.name}) ASC`, sql`${items.id} ASC`]
      case 'name_desc':
        return [sql`LOWER(${items.name}) DESC`, sql`${items.id} DESC`]
      case 'rating':
        return [sql`COALESCE(${items.rating}, 0) DESC`, sql`${items.id} DESC`]
    }
  }

  private cursorKey(sort: SearchItemsParams['sort'], item: Item): string | number | null {
    switch (sort) {
      case 'recent':
      case 'oldest':
        return item.createdAt.toISOString()
      case 'name':
      case 'name_desc':
        return item.name.toLowerCase()
      case 'rating':
        return item.rating ?? 0
    }
  }

  private buildCursorCondition(sort: SearchItemsParams['sort'], cursor: CursorPayload): SQL | null {
    const id = cursor.id
    const k = cursor.k
    switch (sort) {
      case 'recent':
        return sql`(${items.createdAt} < ${k} OR (${items.createdAt} = ${k} AND ${items.id} < ${id}))`
      case 'oldest':
        return sql`(${items.createdAt} > ${k} OR (${items.createdAt} = ${k} AND ${items.id} > ${id}))`
      case 'name':
        return sql`(LOWER(${items.name}) > ${k} OR (LOWER(${items.name}) = ${k} AND ${items.id} > ${id}))`
      case 'name_desc':
        return sql`(LOWER(${items.name}) < ${k} OR (LOWER(${items.name}) = ${k} AND ${items.id} < ${id}))`
      case 'rating':
        return sql`(COALESCE(${items.rating}, 0) < ${k} OR (COALESCE(${items.rating}, 0) = ${k} AND ${items.id} < ${id}))`
    }
  }

  async findByCollectionAndAppId(collectionId: string, steamAppId: number): Promise<Item | null> {
    const result = await this.db.select().from(items)
      .where(and(
        eq(items.collectionId, collectionId),
        sql`(${items.fields}->>'steam_appid')::int = ${steamAppId}`,
      ))
      .limit(1)
    return (result[0] as Item) ?? null
  }

  async findExistingSteamItemsForUser(userId: string): Promise<ExistingSteamItem[]> {
    const rows = await this.db
      .select({
        appId: sql<number>`(${items.fields}->>'steam_appid')::int`,
        collectionId: items.collectionId,
      })
      .from(items)
      .innerJoin(collections, eq(items.collectionId, collections.id))
      .innerJoin(collectionTypes, eq(collectionTypes.id, collections.collectionTypeId))
      .where(and(
        eq(collections.userId, userId),
        eq(collectionTypes.key, 'games'),
        sql`${items.fields} ? 'steam_appid'`,
      ))
    return rows.map(r => ({ appId: Number(r.appId), collectionId: r.collectionId }))
  }

  async update(id: string, data: UpdateItemData): Promise<Item> {
    const set: Record<string, unknown> = { ...data, updatedAt: new Date() }
    const result = await this.db.update(items)
      .set(set)
      .where(eq(items.id, id))
      .returning()
    return result[0] as Item
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(items).where(eq(items.id, id))
  }
}
