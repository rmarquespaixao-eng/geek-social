import { eq, and, sql, inArray } from 'drizzle-orm'
import { asc } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { listings, items, collections, itemOffers, collectionFieldSchema, fieldDefinitions } from '../../shared/infra/database/schema.js'
import type {
  IListingsRepository, Listing, CreateListingData, UpdateListingData,
  ListingWithItem, MarketplaceListing, SearchMarketplaceParams, ListingStatus,
} from '../../shared/contracts/listing.repository.contract.js'
import type { CollectionSchemaEntry } from '../../shared/contracts/collection.repository.contract.js'

export class ListingsRepository implements IListingsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateListingData): Promise<Listing> {
    const result = await this.db.insert(listings).values({
      itemId: data.itemId,
      ownerId: data.ownerId,
      availability: data.availability,
      askingPrice: data.askingPrice != null ? String(data.askingPrice) : null,
      paymentMethods: data.paymentMethods,
      disclaimerAcceptedAt: data.disclaimerAcceptedAt,
    }).returning()
    return result[0] as unknown as Listing
  }

  async findById(id: string): Promise<Listing | null> {
    const result = await this.db.select().from(listings).where(eq(listings.id, id)).limit(1)
    return (result[0] as unknown as Listing) ?? null
  }

  async findActiveByItemId(itemId: string): Promise<Listing | null> {
    const result = await this.db.select().from(listings).where(
      and(eq(listings.itemId, itemId), eq(listings.status, 'active')),
    ).limit(1)
    return (result[0] as unknown as Listing) ?? null
  }

  async findByOwnerId(ownerId: string, status?: ListingStatus): Promise<ListingWithItem[]> {
    const cond = status
      ? and(eq(listings.ownerId, ownerId), eq(listings.status, status))
      : eq(listings.ownerId, ownerId)

    const rows = await this.db
      .select({
        id: listings.id,
        itemId: listings.itemId,
        ownerId: listings.ownerId,
        availability: listings.availability,
        askingPrice: listings.askingPrice,
        paymentMethods: listings.paymentMethods,
        status: listings.status,
        disclaimerAcceptedAt: listings.disclaimerAcceptedAt,
        createdAt: listings.createdAt,
        updatedAt: listings.updatedAt,
        itemName: items.name,
        itemCoverUrl: items.coverUrl,
        itemFields: items.fields,
        itemRating: items.rating,
        itemComment: items.comment,
        itemCollectionId: items.collectionId,
        collectionType: collections.type,
        pendingOffersCount: sql<number>`(
          SELECT COUNT(*) FROM item_offers io
          WHERE io.listing_id = ${listings.id} AND io.status = 'pending'
        )`,
      })
      .from(listings)
      .innerJoin(items, eq(items.id, listings.itemId))
      .innerJoin(collections, eq(collections.id, items.collectionId))
      .where(cond)
      .orderBy(sql`${listings.createdAt} DESC`)

    return rows.map(r => ({
      id: r.id,
      itemId: r.itemId,
      ownerId: r.ownerId,
      availability: r.availability as ListingWithItem['availability'],
      askingPrice: r.askingPrice,
      paymentMethods: r.paymentMethods as ListingWithItem['paymentMethods'],
      status: r.status as ListingStatus,
      disclaimerAcceptedAt: r.disclaimerAcceptedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      item: {
        id: r.itemId,
        name: r.itemName,
        coverUrl: r.itemCoverUrl,
        fields: r.itemFields as Record<string, unknown>,
        rating: r.itemRating,
        comment: r.itemComment,
        collectionId: r.itemCollectionId,
        collectionType: r.collectionType,
      },
      pendingOffersCount: Number(r.pendingOffersCount),
    }))
  }

  async update(id: string, data: UpdateListingData): Promise<Listing> {
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (data.availability !== undefined) set.availability = data.availability
    if ('askingPrice' in data) set.askingPrice = data.askingPrice != null ? String(data.askingPrice) : null
    if (data.paymentMethods !== undefined) set.paymentMethods = data.paymentMethods
    if (data.status !== undefined) set.status = data.status
    const result = await this.db.update(listings).set(set).where(eq(listings.id, id)).returning()
    return result[0] as unknown as Listing
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(listings).where(eq(listings.id, id))
  }

  async searchMarketplace(params: SearchMarketplaceParams): Promise<MarketplaceListing[]> {
    const { viewerId, type, collectionType, minPrice, maxPrice, limit } = params
    const conds = [
      sql`${listings.status} = 'active'`,
      sql`${listings.ownerId} <> ${viewerId}`,
    ]
    if (type) conds.push(sql`${listings.availability} = ${type}`)
    if (collectionType) conds.push(sql`${collections.type} = ${collectionType}`)
    if (minPrice != null) conds.push(sql`${listings.askingPrice} >= ${minPrice}`)
    if (maxPrice != null) conds.push(sql`${listings.askingPrice} <= ${maxPrice}`)
    conds.push(sql`(
      ${collections.visibility} = 'public'
      OR (${collections.visibility} = 'friends_only' AND EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = ${viewerId} AND f.receiver_id = ${listings.ownerId})
            OR (f.requester_id = ${listings.ownerId} AND f.receiver_id = ${viewerId}))
      ))
    )`)
    conds.push(sql`NOT EXISTS (
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ${listings.ownerId} AND ub.blocked_id = ${viewerId})
        OR (ub.blocker_id = ${viewerId} AND ub.blocked_id = ${listings.ownerId})
    )`)

    const rows = await this.db
      .select({
        id: listings.id,
        itemId: listings.itemId,
        ownerId: listings.ownerId,
        availability: listings.availability,
        askingPrice: listings.askingPrice,
        paymentMethods: listings.paymentMethods,
        status: listings.status,
        disclaimerAcceptedAt: listings.disclaimerAcceptedAt,
        createdAt: listings.createdAt,
        updatedAt: listings.updatedAt,
        itemName: items.name,
        itemCoverUrl: items.coverUrl,
        itemFields: items.fields,
        itemRating: items.rating,
        itemComment: items.comment,
        itemCollectionId: items.collectionId,
        collectionType: collections.type,
        ownerDisplayName: sql<string>`(SELECT display_name FROM users WHERE id = ${listings.ownerId})`,
        ownerAvatarUrl: sql<string | null>`(SELECT avatar_url FROM users WHERE id = ${listings.ownerId})`,
      })
      .from(listings)
      .innerJoin(items, eq(items.id, listings.itemId))
      .innerJoin(collections, eq(collections.id, items.collectionId))
      .where(and(...conds))
      .orderBy(sql`${listings.updatedAt} DESC`)
      .limit(limit)

    if (rows.length === 0) return []

    // Batch fetch schemas
    const collectionIds = Array.from(new Set(rows.map(r => r.itemCollectionId)))
    const schemaRows = await this.db
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

    const schemasByCollection: Record<string, CollectionSchemaEntry[]> = {}
    for (const sr of schemaRows) {
      const { collectionId, ...entry } = sr
      if (!schemasByCollection[collectionId]) schemasByCollection[collectionId] = []
      schemasByCollection[collectionId].push(entry as unknown as CollectionSchemaEntry)
    }

    return rows.map(r => ({
      id: r.id,
      itemId: r.itemId,
      ownerId: r.ownerId,
      availability: r.availability as MarketplaceListing['availability'],
      askingPrice: r.askingPrice,
      paymentMethods: r.paymentMethods as MarketplaceListing['paymentMethods'],
      status: r.status as ListingStatus,
      disclaimerAcceptedAt: r.disclaimerAcceptedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      item: {
        id: r.itemId,
        name: r.itemName,
        coverUrl: r.itemCoverUrl,
        fields: r.itemFields as Record<string, unknown>,
        rating: r.itemRating,
        comment: r.itemComment,
        collectionId: r.itemCollectionId,
        collectionType: r.collectionType,
        fieldSchema: schemasByCollection[r.itemCollectionId] ?? [],
      },
      owner: {
        id: r.ownerId,
        displayName: r.ownerDisplayName,
        avatarUrl: r.ownerAvatarUrl,
      },
    }))
  }
}
