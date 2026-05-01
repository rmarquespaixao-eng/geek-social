import { eq, and } from 'drizzle-orm'
import { listings } from '../../shared/infra/database/schema.js'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { ListingsRepository } from './listings.repository.js'
import type { ItemsRepository } from '../items/items.repository.js'
import type { CollectionsRepository } from '../collections/collections.repository.js'
import type { OffersRepository } from '../offers/offers.repository.js'
import type { NotificationsService } from '../notifications/notifications.service.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type {
  Listing, ListingWithItem, MarketplaceListing, ListingStatus, SearchMarketplaceParams,
} from '../../shared/contracts/listing.repository.contract.js'
import type { CreateListingInput, UpdateListingInput } from './listings.schema.js'

export class ListingsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ListingsError'
  }
}

export class ListingsService {
  private offersRepo?: OffersRepository
  private notificationsService?: NotificationsService
  private collectionsRepo?: CollectionsRepository

  constructor(
    private readonly db: DatabaseClient,
    private readonly repo: ListingsRepository,
    private readonly itemsRepo: ItemsRepository,
    private readonly friendsRepo?: IFriendsRepository,
    collectionsRepo?: CollectionsRepository,
  ) {
    this.collectionsRepo = collectionsRepo
  }

  /** Setter para evitar dependência circular com OffersService/Repository. Chamado no app.ts. */
  setOffersIntegration(offersRepo: OffersRepository, notificationsService?: NotificationsService) {
    this.offersRepo = offersRepo
    this.notificationsService = notificationsService
  }

  /** Auto-rejeita ofertas pendentes vinculadas ao listing e notifica os ofertantes. */
  private async cancelPendingOffersForListing(listingId: string, actorId: string | null): Promise<void> {
    if (!this.offersRepo) return
    const rejected = await this.offersRepo.autoRejectByListing(listingId)
    if (!this.notificationsService || rejected.length === 0) return
    for (const offer of rejected) {
      this.notificationsService.notify({
        recipientId: offer.offererId,
        actorId: actorId ?? offer.offererId,
        type: 'offer_rejected',
        entityId: offer.id,
      }).catch(() => {})
    }
  }

  async create(userId: string, input: CreateListingInput): Promise<Listing> {
    const item = await this.itemsRepo.findById(input.itemId)
    if (!item) throw new ListingsError('ITEM_NOT_FOUND')

    if (this.collectionsRepo && item.collectionId) {
      const collection = await this.collectionsRepo.findById(item.collectionId)
      if (!collection || collection.userId !== userId) throw new ListingsError('NOT_AUTHORIZED')
    }

    try {
      return await this.db.transaction(async (tx) => {
        const existing = await tx.select().from(listings).where(
          and(eq(listings.itemId, input.itemId), eq(listings.status, 'active')),
        ).limit(1)
        if (existing[0]) throw new ListingsError('ALREADY_LISTED')

        const [row] = await tx.insert(listings).values({
          itemId: input.itemId,
          ownerId: userId,
          availability: input.availability,
          askingPrice: input.askingPrice != null ? String(input.askingPrice) : null,
          paymentMethods: input.paymentMethods,
          disclaimerAcceptedAt: new Date(),
        }).returning()
        return row as unknown as Listing
      })
    } catch (e) {
      if (e instanceof ListingsError) throw e
      if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === '23505') {
        throw new ListingsError('ALREADY_LISTED')
      }
      throw e
    }
  }

  async pause(userId: string, listingId: string): Promise<Listing> {
    const listing = await this.repo.findById(listingId)
    if (!listing) throw new ListingsError('NOT_FOUND')
    if (listing.ownerId !== userId) throw new ListingsError('NOT_AUTHORIZED')
    if (listing.status !== 'active') throw new ListingsError('INVALID_TRANSITION')
    return this.repo.update(listingId, { status: 'paused' })
  }

  async resume(userId: string, listingId: string): Promise<Listing> {
    const listing = await this.repo.findById(listingId)
    if (!listing) throw new ListingsError('NOT_FOUND')
    if (listing.ownerId !== userId) throw new ListingsError('NOT_AUTHORIZED')
    if (listing.status !== 'paused') throw new ListingsError('INVALID_TRANSITION')

    try {
      return await this.db.transaction(async (tx) => {
        // Garante que não existe outro ativo para o mesmo item (pode ter sido recriado)
        const existingActive = await tx.select().from(listings).where(
          and(eq(listings.itemId, listing.itemId), eq(listings.status, 'active')),
        ).limit(1)
        if (existingActive[0] && existingActive[0].id !== listingId) throw new ListingsError('ALREADY_LISTED')

        const [row] = await tx.update(listings)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(listings.id, listingId))
          .returning()
        return row as unknown as Listing
      })
    } catch (e) {
      if (e instanceof ListingsError) throw e
      if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === '23505') {
        throw new ListingsError('ALREADY_LISTED')
      }
      throw e
    }
  }

  async close(userId: string | null, listingId: string): Promise<Listing> {
    const listing = await this.repo.findById(listingId)
    if (!listing) throw new ListingsError('NOT_FOUND')
    if (userId !== null && listing.ownerId !== userId) throw new ListingsError('NOT_AUTHORIZED')
    if (listing.status === 'closed') return listing
    const updated = await this.repo.update(listingId, { status: 'closed' })
    await this.cancelPendingOffersForListing(listingId, userId)
    return updated
  }

  /** Apaga permanentemente o anúncio. Só permitido quando já está closed. */
  async hardDelete(userId: string, listingId: string): Promise<void> {
    const listing = await this.repo.findById(listingId)
    if (!listing) throw new ListingsError('NOT_FOUND')
    if (listing.ownerId !== userId) throw new ListingsError('NOT_AUTHORIZED')
    if (listing.status !== 'closed') throw new ListingsError('LISTING_NOT_CLOSED')
    // Defesa em profundidade — quando vira 'closed' já cancelamos, mas garante caso veio de outro fluxo.
    await this.cancelPendingOffersForListing(listingId, userId)
    await this.repo.deleteById(listingId)
  }

  async update(userId: string, listingId: string, input: UpdateListingInput): Promise<Listing> {
    const listing = await this.repo.findById(listingId)
    if (!listing) throw new ListingsError('NOT_FOUND')
    if (listing.ownerId !== userId) throw new ListingsError('NOT_AUTHORIZED')
    if (listing.status === 'closed') throw new ListingsError('LISTING_CLOSED')
    return this.repo.update(listingId, input)
  }

  async listOwn(userId: string, status?: ListingStatus): Promise<ListingWithItem[]> {
    return this.repo.findByOwnerId(userId, status)
  }

  async listMarketplace(viewerId: string, params: Omit<SearchMarketplaceParams, 'viewerId'>): Promise<MarketplaceListing[]> {
    return this.repo.searchMarketplace({
      viewerId,
      ...params,
      limit: Math.min(params.limit ?? 60, 100),
    })
  }

  async findById(listingId: string): Promise<Listing | null> {
    return this.repo.findById(listingId)
  }

  async getActiveListing(itemId: string): Promise<Listing | null> {
    return this.repo.findActiveByItemId(itemId)
  }
}
