import { eq, and, avg, count } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { listingRatings } from '../../shared/infra/database/schema.js'
import type { IListingRatingsRepository, ListingRating, UserReputation } from '../../shared/contracts/listing-rating.repository.contract.js'

export class ListingRatingsRepository implements IListingRatingsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: { offerId: string; raterId: string; rateeId: string; score: number }): Promise<ListingRating> {
    const [row] = await this.db.insert(listingRatings).values(data).returning()
    return row as unknown as ListingRating
  }

  async findByOfferAndRater(offerId: string, raterId: string): Promise<ListingRating | null> {
    const [row] = await this.db
      .select()
      .from(listingRatings)
      .where(and(eq(listingRatings.offerId, offerId), eq(listingRatings.raterId, raterId)))
      .limit(1)
    return (row as unknown as ListingRating) ?? null
  }

  async findById(id: string): Promise<ListingRating | null> {
    const [row] = await this.db.select().from(listingRatings).where(eq(listingRatings.id, id)).limit(1)
    return (row as unknown as ListingRating) ?? null
  }

  async getReputation(rateeId: string): Promise<UserReputation> {
    const [row] = await this.db
      .select({
        score: avg(listingRatings.score),
        count: count(),
      })
      .from(listingRatings)
      .where(eq(listingRatings.rateeId, rateeId))
    return {
      score: row?.score != null ? Number(Number(row.score).toFixed(1)) : 0,
      count: Number(row?.count ?? 0),
    }
  }

  async listByOffer(offerId: string): Promise<ListingRating[]> {
    const rows = await this.db
      .select()
      .from(listingRatings)
      .where(eq(listingRatings.offerId, offerId))
    return rows as unknown as ListingRating[]
  }

  async listByRater(raterId: string): Promise<ListingRating[]> {
    const rows = await this.db
      .select()
      .from(listingRatings)
      .where(eq(listingRatings.raterId, raterId))
    return rows as unknown as ListingRating[]
  }
}
