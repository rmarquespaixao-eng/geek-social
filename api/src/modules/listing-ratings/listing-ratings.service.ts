import type { IListingRatingsRepository, ListingRating, UserReputation } from '../../shared/contracts/listing-rating.repository.contract.js'
import type { OffersRepository } from '../offers/offers.repository.js'
import type { NotificationsService } from '../notifications/notifications.service.js'

const EDIT_WINDOW_DAYS = 30

export class ListingRatingsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ListingRatingsError'
  }
}

function daysDiff(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

export class ListingRatingsService {
  constructor(
    private readonly repo: IListingRatingsRepository,
    private readonly offersRepo: OffersRepository,
    private readonly notificationsService?: NotificationsService,
  ) {}

  async rate(raterId: string, offerId: string, score: number): Promise<ListingRating> {
    const offer = await this.offersRepo.findById(offerId)
    if (!offer) throw new ListingRatingsError('OFFER_NOT_FOUND')
    if (offer.status !== 'completed') throw new ListingRatingsError('OFFER_NOT_COMPLETED')

    const isParty = offer.ownerId === raterId || offer.offererId === raterId
    if (!isParty) throw new ListingRatingsError('NOT_AUTHORIZED')

    if (daysDiff(offer.updatedAt, new Date()) > EDIT_WINDOW_DAYS) {
      throw new ListingRatingsError('WINDOW_EXPIRED')
    }

    const existing = await this.repo.findByOfferAndRater(offerId, raterId)
    if (existing) throw new ListingRatingsError('ALREADY_RATED')

    const rateeId = offer.ownerId === raterId ? offer.offererId : offer.ownerId
    const rating = await this.repo.create({ offerId, raterId, rateeId, score })

    this.notificationsService?.notify({
      recipientId: rateeId,
      actorId: raterId,
      type: 'rating_received',
      entityId: offerId,
    }).catch(() => {})

    return rating
  }

  async getReputation(userId: string): Promise<UserReputation> {
    return this.repo.getReputation(userId)
  }

  async getMyRatingForOffer(raterId: string, offerId: string): Promise<ListingRating | null> {
    return this.repo.findByOfferAndRater(offerId, raterId)
  }

  async getRatingsForOffer(offerId: string): Promise<ListingRating[]> {
    return this.repo.listByOffer(offerId)
  }

  async listMyRatings(raterId: string): Promise<ListingRating[]> {
    return this.repo.listByRater(raterId)
  }
}
