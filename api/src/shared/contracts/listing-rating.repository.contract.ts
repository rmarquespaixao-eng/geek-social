export type ListingRating = {
  id: string
  offerId: string
  raterId: string
  rateeId: string
  score: number
  createdAt: Date
  updatedAt: Date
}

export type UserReputation = {
  score: number
  count: number
}

export interface IListingRatingsRepository {
  create(data: { offerId: string; raterId: string; rateeId: string; score: number }): Promise<ListingRating>
  findByOfferAndRater(offerId: string, raterId: string): Promise<ListingRating | null>
  findById(id: string): Promise<ListingRating | null>
  getReputation(rateeId: string): Promise<UserReputation>
  listByOffer(offerId: string): Promise<ListingRating[]>
  listByRater(raterId: string): Promise<ListingRating[]>
}
