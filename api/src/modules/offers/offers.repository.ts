import { eq, and, or, desc, ne, lt, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { itemOffers, items, collections, collectionTypes, users, offerProposals } from '../../shared/infra/database/schema.js'
import type { OfferType, OfferStatus } from './offers.schema.js'

export type OfferRow = {
  id: string
  type: OfferType
  itemId: string
  listingId: string | null
  ownerId: string
  offererId: string
  offeredItemId: string | null
  offeredPrice: string | null
  message: string | null
  status: OfferStatus
  offererConfirmedAt: Date | null
  ownerConfirmedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type OfferWithDetails = OfferRow & {
  item: { id: string; name: string; coverUrl: string | null; collectionId: string }
  offeredItem: { id: string; name: string; coverUrl: string | null; collectionId: string } | null
  owner: { id: string; displayName: string; avatarUrl: string | null }
  offerer: { id: string; displayName: string; avatarUrl: string | null }
  /** Resumo da proposta atual (pendente ou rejeitada). null se não houver. */
  latestProposal: { id: string; proposerId: string; status: 'pending' | 'rejected' } | null
}

export type CreateOfferData = {
  type: OfferType
  itemId: string
  listingId: string | null
  ownerId: string
  offererId: string
  offeredItemId: string | null
  offeredPrice: string | null
  message: string | null
}

export class OffersRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateOfferData, exec: DatabaseClient = this.db): Promise<OfferRow> {
    const [row] = await exec.insert(itemOffers).values({
      type: data.type,
      itemId: data.itemId,
      listingId: data.listingId,
      ownerId: data.ownerId,
      offererId: data.offererId,
      offeredItemId: data.offeredItemId,
      offeredPrice: data.offeredPrice,
      message: data.message,
    }).returning()
    return row as OfferRow
  }

  async findById(id: string): Promise<OfferRow | null> {
    const [row] = await this.db.select().from(itemOffers).where(eq(itemOffers.id, id)).limit(1)
    return (row as OfferRow | undefined) ?? null
  }

  /** Detalhes ricos para um único offer (hydration manual evita ambiguity de aliases). */
  async findWithDetails(id: string): Promise<OfferWithDetails | null> {
    const row = await this.findById(id)
    if (!row) return null
    return this.hydrate(row)
  }

  async listByOwner(ownerId: string, status?: OfferStatus): Promise<OfferWithDetails[]> {
    return this.listScoped(eq(itemOffers.ownerId, ownerId), status)
  }

  async listByOfferer(offererId: string, status?: OfferStatus): Promise<OfferWithDetails[]> {
    return this.listScoped(eq(itemOffers.offererId, offererId), status)
  }

  private async listScoped(scope: ReturnType<typeof eq>, status?: OfferStatus): Promise<OfferWithDetails[]> {
    const cond = status ? and(scope, eq(itemOffers.status, status))! : scope
    const rows = await this.db
      .select()
      .from(itemOffers)
      .where(cond)
      .orderBy(desc(itemOffers.createdAt))
    const enriched = await Promise.all((rows as OfferRow[]).map(r => this.hydrate(r)))
    return enriched.filter((x): x is OfferWithDetails => Boolean(x))
  }

  private async hydrate(o: OfferRow): Promise<OfferWithDetails | null> {
    const itemRow = await this.db
      .select({ id: items.id, name: items.name, coverUrl: items.coverUrl, collectionId: items.collectionId })
      .from(items).where(eq(items.id, o.itemId)).limit(1)
    if (!itemRow[0]) return null

    let offeredItem: OfferWithDetails['offeredItem'] = null
    if (o.offeredItemId) {
      const r = await this.db
        .select({ id: items.id, name: items.name, coverUrl: items.coverUrl, collectionId: items.collectionId })
        .from(items).where(eq(items.id, o.offeredItemId)).limit(1)
      offeredItem = r[0] ?? null
    }

    const ownerRow = await this.db
      .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users).where(eq(users.id, o.ownerId)).limit(1)
    const offererRow = await this.db
      .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users).where(eq(users.id, o.offererId)).limit(1)

    if (!ownerRow[0] || !offererRow[0]) return null

    // Última proposta (pendente OU rejeitada — descarta superseded/accepted que já não influenciam)
    const latestRows = await this.db
      .select({ id: offerProposals.id, proposerId: offerProposals.proposerId, status: offerProposals.status })
      .from(offerProposals)
      .where(and(eq(offerProposals.offerId, o.id), or(eq(offerProposals.status, 'pending'), eq(offerProposals.status, 'rejected'))!))
      .orderBy(desc(offerProposals.createdAt))
      .limit(1)
    const latestProposal = latestRows[0]
      ? { id: latestRows[0].id, proposerId: latestRows[0].proposerId, status: latestRows[0].status as 'pending' | 'rejected' }
      : null

    return {
      ...o,
      item: itemRow[0],
      offeredItem,
      owner: ownerRow[0],
      offerer: offererRow[0],
      latestProposal,
    }
  }

  /** Lista ofertas em status `accepted` com updated_at anterior a `olderThanDays` dias atrás. */
  async findExpiredAccepted(olderThanDays: number): Promise<OfferRow[]> {
    const rows = await this.db
      .select()
      .from(itemOffers)
      .where(and(
        eq(itemOffers.status, 'accepted'),
        lt(itemOffers.updatedAt, sql`now() - (${olderThanDays}::int || ' days')::interval`),
      ))
    return rows as OfferRow[]
  }

  async findPendingByItemAndOfferer(itemId: string, offererId: string): Promise<OfferRow | null> {
    const [row] = await this.db
      .select()
      .from(itemOffers)
      .where(and(
        eq(itemOffers.itemId, itemId),
        eq(itemOffers.offererId, offererId),
        eq(itemOffers.status, 'pending'),
      ))
      .limit(1)
    return (row as OfferRow | undefined) ?? null
  }

  async findPendingByItemAndOffererForUpdate(itemId: string, offererId: string, exec: DatabaseClient): Promise<OfferRow | null> {
    const result = await exec.execute(
      sql`SELECT * FROM item_offers WHERE item_id = ${itemId} AND offerer_id = ${offererId} AND status = 'pending' LIMIT 1 FOR UPDATE`,
    )
    const rows = (result as { rows: unknown[] }).rows
    return (rows[0] as OfferRow | undefined) ?? null
  }

  /** Auto-rejeita outras ofertas pendentes do mesmo item. Retorna IDs rejeitados. */
  async autoRejectSiblings(itemId: string, exceptOfferId: string): Promise<string[]> {
    const rows = await this.db
      .update(itemOffers)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(and(
        eq(itemOffers.itemId, itemId),
        eq(itemOffers.status, 'pending'),
        ne(itemOffers.id, exceptOfferId),
      ))
      .returning({ id: itemOffers.id })
    return rows.map(r => r.id)
  }

  /** Auto-rejeita todas as ofertas pendentes vinculadas a um listing. Retorna ofertas afetadas (id + offererId). */
  async autoRejectByListing(listingId: string): Promise<{ id: string; offererId: string }[]> {
    const rows = await this.db
      .update(itemOffers)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(and(
        eq(itemOffers.listingId, listingId),
        eq(itemOffers.status, 'pending'),
      ))
      .returning({ id: itemOffers.id, offererId: itemOffers.offererId })
    return rows
  }

  async setStatus(id: string, status: OfferStatus, tx?: DatabaseClient): Promise<OfferRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .update(itemOffers)
      .set({ status, updatedAt: new Date() })
      .where(eq(itemOffers.id, id))
      .returning()
    return row as OfferRow
  }

  /** Sincroniza item_offers com a proposta atual (preço/item ofertado/mensagem). */
  async applyProposal(
    id: string,
    data: { offeredPrice: string | null; offeredItemId: string | null; message: string | null },
  ): Promise<OfferRow> {
    const [row] = await this.db
      .update(itemOffers)
      .set({
        offeredPrice: data.offeredPrice,
        offeredItemId: data.offeredItemId,
        message: data.message,
        updatedAt: new Date(),
      })
      .where(eq(itemOffers.id, id))
      .returning()
    return row as OfferRow
  }

  async setOffererConfirmed(id: string): Promise<OfferRow> {
    const [row] = await this.db
      .update(itemOffers)
      .set({ offererConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(itemOffers.id, id))
      .returning()
    return row as OfferRow
  }

  async setOwnerConfirmed(id: string): Promise<OfferRow> {
    const [row] = await this.db
      .update(itemOffers)
      .set({ ownerConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(itemOffers.id, id))
      .returning()
    return row as OfferRow
  }

  /** Encontra coleção destino do `userId` que combine com o `type`; cai em qualquer coleção do user. */
  async findDestinationCollection(userId: string, preferType: string): Promise<{ id: string } | null> {
    const matched = await this.db
      .select({ id: collections.id })
      .from(collections)
      .innerJoin(collectionTypes, eq(collectionTypes.id, collections.collectionTypeId))
      .where(and(eq(collections.userId, userId), eq(collectionTypes.key, preferType)))
      .orderBy(desc(collections.createdAt))
      .limit(1)
    if (matched[0]) return matched[0]
    const any = await this.db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.createdAt))
      .limit(1)
    return any[0] ?? null
  }

  /** Move um item para outra coleção (transferência de propriedade). */
  async moveItemToCollection(itemId: string, destCollectionId: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec
      .update(items)
      .set({ collectionId: destCollectionId, updatedAt: new Date() })
      .where(eq(items.id, itemId))
  }

}

