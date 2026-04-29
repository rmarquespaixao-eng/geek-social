import type { OffersRepository, OfferRow, OfferWithDetails } from './offers.repository.js'
import type { ItemsRepository } from '../items/items.repository.js'
import type { CollectionsRepository } from '../collections/collections.repository.js'
import type { CollectionsService } from '../collections/collections.service.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { NotificationsService } from '../notifications/notifications.service.js'
import type { ListingsService } from '../listings/listings.service.js'
import type { CreateOfferInput, OfferStatus } from './offers.schema.js'
import type { IOfferProposalsRepository, OfferProposal } from '../../shared/contracts/offer-proposal.repository.contract.js'

export class OffersError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'OffersError'
  }
}

export type TransferResult = {
  offer: OfferRow
  movedItems: { itemId: string; toCollectionId: string }[]
}

export class OffersService {
  constructor(
    private readonly repo: OffersRepository,
    private readonly itemsRepo: ItemsRepository,
    private readonly collectionsRepo: CollectionsRepository,
    private readonly friendsRepo: IFriendsRepository,
    private readonly notificationsService?: NotificationsService,
    private readonly listingsService?: ListingsService | null,
    private readonly proposalsRepo?: IOfferProposalsRepository | null,
    private readonly collectionsService?: CollectionsService | null,
  ) {}

  /** Garante que `userId` tenha uma coleção compatível (ou qualquer coleção). Cria automaticamente se não houver nenhuma. */
  private async ensureDestinationCollection(userId: string, preferType: string): Promise<{ id: string }> {
    const found = await this.repo.findDestinationCollection(userId, preferType)
    if (found) return found
    if (!this.collectionsService) throw new OffersError('OFFERER_HAS_NO_COLLECTION')
    const labelByType: Record<string, string> = {
      games: 'Jogos recebidos',
      books: 'Livros recebidos',
      cardgames: 'Cards recebidos',
      boardgames: 'Boardgames recebidos',
      custom: 'Itens recebidos',
    }
    const name = labelByType[preferType] ?? 'Itens recebidos'
    const created = await this.collectionsService.create(userId, {
      name,
      description: 'Coleção criada automaticamente para receber itens de transações concluídas.',
      type: preferType as 'games' | 'books' | 'cardgames' | 'boardgames' | 'custom',
      visibility: 'public',
      autoShareToFeed: false,
    })
    return { id: created.id }
  }

  private notifySafe(data: {
    recipientId: string
    actorId: string
    type: 'offer_received' | 'offer_accepted' | 'offer_rejected' | 'offer_completed' | 'offer_cancelled' | 'offer_expired' | 'counter_proposal_received' | 'proposal_rejected'
    entityId?: string
  }): void {
    if (!this.notificationsService) return
    this.notificationsService.notify(data).catch(() => {})
  }

  async create(offererId: string, input: CreateOfferInput): Promise<OfferRow> {
    if (!this.listingsService) throw new OffersError('LISTINGS_SERVICE_NOT_CONFIGURED')
    const listingRecord = await this.listingsService.findById(input.listingId)
    if (!listingRecord) throw new OffersError('LISTING_NOT_FOUND')
    if (listingRecord.status !== 'active') throw new OffersError('LISTING_NOT_ACTIVE')
    if (listingRecord.ownerId === offererId) throw new OffersError('CANNOT_OFFER_OWN_ITEM')

    const item = await this.itemsRepo.findById(listingRecord.itemId)
    if (!item) throw new OffersError('ITEM_NOT_FOUND')

    const itemCollection = await this.collectionsRepo.findById(item.collectionId)
    if (!itemCollection) throw new OffersError('ITEM_NOT_FOUND')

    // Checa visibilidade da coleção do item
    if (itemCollection.visibility === 'private') throw new OffersError('ITEM_NOT_AVAILABLE')
    if (itemCollection.visibility === 'friends_only') {
      const isFriend = await this.friendsRepo.areFriends(listingRecord.ownerId, offererId)
      if (!isFriend) throw new OffersError('ITEM_NOT_AVAILABLE')
    }

    // Bloqueia múltiplas ofertas pendentes do mesmo usuário no mesmo item
    const existingPending = await this.repo.findPendingByItemAndOfferer(listingRecord.itemId, offererId)
    if (existingPending) throw new OffersError('DUPLICATE_PENDING_OFFER')

    if (input.type === 'buy') {
      if (!(listingRecord.availability === 'sale' || listingRecord.availability === 'both')) {
        throw new OffersError('ITEM_NOT_FOR_SALE')
      }
      const created = await this.repo.create({
        type: 'buy',
        itemId: listingRecord.itemId,
        listingId: listingRecord.id,
        ownerId: listingRecord.ownerId,
        offererId,
        offeredItemId: null,
        offeredPrice: String(input.offeredPrice),
        message: input.message?.trim() || null,
      })
      await this.proposalsRepo?.create({
        offerId: created.id,
        proposerId: offererId,
        offeredPrice: created.offeredPrice,
        offeredItemId: null,
        message: created.message,
      })
      this.notifySafe({ recipientId: created.ownerId, actorId: offererId, type: 'offer_received', entityId: created.id })
      return created
    }

    // type === 'trade'
    if (!(listingRecord.availability === 'trade' || listingRecord.availability === 'both')) {
      throw new OffersError('ITEM_NOT_FOR_TRADE')
    }
    const offered = await this.itemsRepo.findById(input.offeredItemId)
    if (!offered) throw new OffersError('OFFERED_ITEM_NOT_FOUND')
    const offeredCollection = await this.collectionsRepo.findById(offered.collectionId)
    if (!offeredCollection || offeredCollection.userId !== offererId) {
      throw new OffersError('OFFERED_ITEM_NOT_OWNED')
    }
    if (offeredCollection.visibility === 'private') {
      throw new OffersError('OFFERED_COLLECTION_PRIVATE')
    }
    if (offeredCollection.visibility === 'friends_only') {
      const isFriend = await this.friendsRepo.areFriends(listingRecord.ownerId, offererId)
      if (!isFriend) throw new OffersError('OFFERED_COLLECTION_REQUIRES_FRIENDSHIP')
    }

    const created = await this.repo.create({
      type: 'trade',
      itemId: listingRecord.itemId,
      listingId: listingRecord.id,
      ownerId: listingRecord.ownerId,
      offererId,
      offeredItemId: offered.id,
      offeredPrice: null,
      message: input.message?.trim() || null,
    })
    await this.proposalsRepo?.create({
      offerId: created.id,
      proposerId: offererId,
      offeredPrice: null,
      offeredItemId: created.offeredItemId,
      message: created.message,
    })
    this.notifySafe({ recipientId: created.ownerId, actorId: offererId, type: 'offer_received', entityId: created.id })
    return created
  }

  /** Aceita a proposta atual da oferta (qualquer parte que não seja o proposer atual). */
  async accept(userId: string, offerId: string): Promise<{ offer: OfferRow; rejectedSiblings: string[] }> {
    const offer = await this.repo.findById(offerId)
    if (!offer) throw new OffersError('OFFER_NOT_FOUND')
    if (offer.ownerId !== userId && offer.offererId !== userId) throw new OffersError('NOT_AUTHORIZED')
    if (offer.status !== 'pending') throw new OffersError('INVALID_TRANSITION')

    if (this.proposalsRepo) {
      const pending = await this.proposalsRepo.findPendingByOffer(offerId)
      if (!pending) throw new OffersError('NO_PENDING_PROPOSAL')
      if (pending.proposerId === userId) throw new OffersError('CANNOT_ACCEPT_OWN_PROPOSAL')
      await this.proposalsRepo.setStatus(pending.id, 'accepted')
      // Sincroniza item_offers com o estado final da proposta aceita
      await this.repo.applyProposal(offerId, {
        offeredPrice: pending.offeredPrice,
        offeredItemId: pending.offeredItemId,
        message: pending.message,
      })
    }

    const updated = await this.repo.setStatus(offerId, 'accepted')
    const rejected = await this.repo.autoRejectSiblings(offer.itemId, offerId)
    this.notifySafe({ recipientId: updated.offererId, actorId: userId, type: 'offer_accepted', entityId: updated.id })
    for (const rejId of rejected) {
      const sib = await this.repo.findById(rejId)
      if (sib) this.notifySafe({ recipientId: sib.offererId, actorId: userId, type: 'offer_rejected', entityId: sib.id })
    }
    return { offer: updated, rejectedSiblings: rejected }
  }

  /** Rejeita apenas a proposta atual. A oferta continua pendente — o outro lado pode propor de novo. */
  async reject(userId: string, offerId: string): Promise<OfferRow> {
    const offer = await this.repo.findById(offerId)
    if (!offer) throw new OffersError('OFFER_NOT_FOUND')
    if (offer.ownerId !== userId && offer.offererId !== userId) throw new OffersError('NOT_AUTHORIZED')
    if (offer.status !== 'pending') throw new OffersError('INVALID_TRANSITION')

    if (!this.proposalsRepo) throw new OffersError('PROPOSALS_NOT_CONFIGURED')
    const pending = await this.proposalsRepo.findPendingByOffer(offerId)
    if (!pending) throw new OffersError('NO_PENDING_PROPOSAL')
    if (pending.proposerId === userId) throw new OffersError('CANNOT_REJECT_OWN_PROPOSAL')

    await this.proposalsRepo.setStatus(pending.id, 'rejected')
    this.notifySafe({ recipientId: pending.proposerId, actorId: userId, type: 'proposal_rejected', entityId: offerId })
    return offer
  }

  /** Cria nova proposta (contra-proposta ou nova rodada após rejeição). */
  async propose(
    userId: string,
    offerId: string,
    input: { offeredPrice?: number | null; offeredItemId?: string | null; message?: string | null },
  ): Promise<OfferProposal> {
    if (!this.proposalsRepo) throw new OffersError('PROPOSALS_NOT_CONFIGURED')
    const offer = await this.repo.findById(offerId)
    if (!offer) throw new OffersError('OFFER_NOT_FOUND')
    if (offer.ownerId !== userId && offer.offererId !== userId) throw new OffersError('NOT_AUTHORIZED')
    if (offer.status !== 'pending') throw new OffersError('INVALID_TRANSITION')

    const latest = await this.proposalsRepo.findLatestByOffer(offerId)
    if (!latest) throw new OffersError('NO_PROPOSAL_HISTORY')

    if (latest.status === 'pending') {
      if (latest.proposerId === userId) throw new OffersError('ALREADY_PROPOSED')
      // Contra-proposta: supersede a anterior
      await this.proposalsRepo.setStatus(latest.id, 'superseded')
    } else if (latest.status !== 'rejected') {
      throw new OffersError('OFFER_NOT_NEGOTIABLE')
    }

    // Validações conforme tipo da oferta
    if (offer.type === 'buy') {
      if (input.offeredPrice == null || input.offeredPrice <= 0) {
        throw new OffersError('INVALID_PROPOSAL')
      }
    } else {
      if (!input.offeredItemId) throw new OffersError('INVALID_PROPOSAL')
      const offered = await this.itemsRepo.findById(input.offeredItemId)
      if (!offered) throw new OffersError('OFFERED_ITEM_NOT_FOUND')
      const offeredCollection = await this.collectionsRepo.findById(offered.collectionId)
      if (!offeredCollection || offeredCollection.userId !== userId) {
        throw new OffersError('OFFERED_ITEM_NOT_OWNED')
      }
      if (offeredCollection.visibility === 'private') {
        throw new OffersError('OFFERED_COLLECTION_PRIVATE')
      }
      if (offeredCollection.visibility === 'friends_only') {
        const otherId = userId === offer.ownerId ? offer.offererId : offer.ownerId
        const isFriend = await this.friendsRepo.areFriends(otherId, userId)
        if (!isFriend) throw new OffersError('OFFERED_COLLECTION_REQUIRES_FRIENDSHIP')
      }
    }

    const proposal = await this.proposalsRepo.create({
      offerId,
      proposerId: userId,
      offeredPrice: offer.type === 'buy' ? String(input.offeredPrice) : null,
      offeredItemId: offer.type === 'trade' ? input.offeredItemId ?? null : null,
      message: input.message?.trim() || null,
    })

    // Mantém item_offers refletindo a proposta atual (para queries simples)
    await this.repo.applyProposal(offerId, {
      offeredPrice: proposal.offeredPrice,
      offeredItemId: proposal.offeredItemId,
      message: proposal.message,
    })

    const otherPartyId = userId === offer.ownerId ? offer.offererId : offer.ownerId
    this.notifySafe({ recipientId: otherPartyId, actorId: userId, type: 'counter_proposal_received', entityId: offerId })
    return proposal
  }

  async getHistory(userId: string, offerId: string): Promise<OfferProposal[]> {
    if (!this.proposalsRepo) return []
    const offer = await this.repo.findById(offerId)
    if (!offer) throw new OffersError('OFFER_NOT_FOUND')
    if (offer.ownerId !== userId && offer.offererId !== userId) throw new OffersError('NOT_AUTHORIZED')
    return this.proposalsRepo.listByOffer(offerId)
  }

  async cancel(userId: string, offerId: string): Promise<OfferRow> {
    const offer = await this.repo.findById(offerId)
    if (!offer) throw new OffersError('OFFER_NOT_FOUND')
    if (offer.offererId !== userId && offer.ownerId !== userId) throw new OffersError('NOT_AUTHORIZED')
    if (offer.status !== 'pending' && offer.status !== 'accepted') throw new OffersError('INVALID_TRANSITION')
    const wasAccepted = offer.status === 'accepted'
    const updated = await this.repo.setStatus(offerId, 'cancelled')
    if (wasAccepted) {
      const otherParty = userId === offer.ownerId ? offer.offererId : offer.ownerId
      this.notifySafe({ recipientId: otherParty, actorId: userId, type: 'offer_cancelled', entityId: offer.id })
    }
    return updated
  }

  async expireOldAccepted(olderThanDays: number): Promise<{ expired: number }> {
    const offers = await this.repo.findExpiredAccepted(olderThanDays)
    for (const o of offers) {
      await this.repo.setStatus(o.id, 'cancelled')
      this.notifySafe({ recipientId: o.ownerId,   actorId: o.ownerId, type: 'offer_expired', entityId: o.id })
      this.notifySafe({ recipientId: o.offererId, actorId: o.ownerId, type: 'offer_expired', entityId: o.id })
    }
    return { expired: offers.length }
  }

  async confirm(userId: string, offerId: string): Promise<TransferResult> {
    const offer = await this.repo.findById(offerId)
    if (!offer) throw new OffersError('OFFER_NOT_FOUND')
    if (offer.status !== 'accepted') throw new OffersError('INVALID_TRANSITION')
    if (userId !== offer.ownerId && userId !== offer.offererId) throw new OffersError('NOT_AUTHORIZED')

    // Caso especial: ambos já confirmaram mas a transferência falhou (ex: faltava coleção destino).
    // Permite re-tentar executeTransfer sem disparar ALREADY_CONFIRMED.
    if (offer.offererConfirmedAt && offer.ownerConfirmedAt) {
      return this.executeTransfer(offer)
    }

    let updated = offer
    if (userId === offer.offererId) {
      if (offer.offererConfirmedAt) throw new OffersError('ALREADY_CONFIRMED')
      updated = await this.repo.setOffererConfirmed(offerId)
    } else {
      if (offer.ownerConfirmedAt) throw new OffersError('ALREADY_CONFIRMED')
      updated = await this.repo.setOwnerConfirmed(offerId)
    }

    if (!updated.offererConfirmedAt || !updated.ownerConfirmedAt) {
      return { offer: updated, movedItems: [] }
    }

    return this.executeTransfer(updated)
  }

  private async executeTransfer(offer: OfferRow): Promise<TransferResult> {
    const item = await this.itemsRepo.findById(offer.itemId)
    if (!item) throw new OffersError('ITEM_GONE')
    const itemCollection = await this.collectionsRepo.findById(item.collectionId)
    if (!itemCollection || itemCollection.userId !== offer.ownerId) {
      throw new OffersError('ITEM_GONE')
    }

    let offered: { id: string; collectionId: string; type: string } | null = null
    if (offer.type === 'trade') {
      if (!offer.offeredItemId) throw new OffersError('OFFERED_ITEM_GONE')
      const offeredItem = await this.itemsRepo.findById(offer.offeredItemId)
      if (!offeredItem) throw new OffersError('OFFERED_ITEM_GONE')
      const offeredColl = await this.collectionsRepo.findById(offeredItem.collectionId)
      if (!offeredColl || offeredColl.userId !== offer.offererId) {
        throw new OffersError('OFFERED_ITEM_GONE')
      }
      offered = { id: offeredItem.id, collectionId: offeredItem.collectionId, type: offeredColl.type }
    }

    const moved: { itemId: string; toCollectionId: string }[] = []

    const offererDest = await this.ensureDestinationCollection(offer.offererId, itemCollection.type)
    await this.repo.moveItemToCollection(offer.itemId, offererDest.id)
    moved.push({ itemId: offer.itemId, toCollectionId: offererDest.id })

    if (offer.type === 'trade' && offered) {
      const ownerDest = await this.ensureDestinationCollection(offer.ownerId, offered.type)
      await this.repo.moveItemToCollection(offered.id, ownerDest.id)
      moved.push({ itemId: offered.id, toCollectionId: ownerDest.id })
    }

    const completed = await this.repo.setStatus(offer.id, 'completed')

    // Close the listing associated with this offer so it no longer appears in Vitrine
    if (offer.listingId && this.listingsService) {
      this.listingsService.close(null, offer.listingId).catch(() => {})
    }

    this.notifySafe({ recipientId: offer.ownerId,   actorId: offer.offererId, type: 'offer_completed', entityId: offer.id })
    this.notifySafe({ recipientId: offer.offererId, actorId: offer.ownerId,   type: 'offer_completed', entityId: offer.id })
    return { offer: completed, movedItems: moved }
  }

  async listReceived(userId: string, status?: OfferStatus): Promise<OfferWithDetails[]> {
    return this.repo.listByOwner(userId, status)
  }

  async listSent(userId: string, status?: OfferStatus): Promise<OfferWithDetails[]> {
    return this.repo.listByOfferer(userId, status)
  }

  async getOne(userId: string, offerId: string): Promise<OfferWithDetails> {
    const offer = await this.repo.findWithDetails(offerId)
    if (!offer) throw new OffersError('OFFER_NOT_FOUND')
    if (offer.ownerId !== userId && offer.offererId !== userId) {
      throw new OffersError('NOT_AUTHORIZED')
    }
    return offer
  }
}
