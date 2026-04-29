import { eq, and, desc } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { offerProposals } from '../../shared/infra/database/schema.js'
import type {
  IOfferProposalsRepository, OfferProposal, CreateProposalData, ProposalStatus,
} from '../../shared/contracts/offer-proposal.repository.contract.js'

export class OfferProposalsRepository implements IOfferProposalsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateProposalData): Promise<OfferProposal> {
    const [row] = await this.db.insert(offerProposals).values({
      offerId: data.offerId,
      proposerId: data.proposerId,
      offeredPrice: data.offeredPrice ?? null,
      offeredItemId: data.offeredItemId ?? null,
      message: data.message ?? null,
    }).returning()
    return row as unknown as OfferProposal
  }

  async findById(id: string): Promise<OfferProposal | null> {
    const [row] = await this.db.select().from(offerProposals).where(eq(offerProposals.id, id)).limit(1)
    return (row as unknown as OfferProposal) ?? null
  }

  async findLatestByOffer(offerId: string): Promise<OfferProposal | null> {
    const [row] = await this.db
      .select()
      .from(offerProposals)
      .where(eq(offerProposals.offerId, offerId))
      .orderBy(desc(offerProposals.createdAt))
      .limit(1)
    return (row as unknown as OfferProposal) ?? null
  }

  async findPendingByOffer(offerId: string): Promise<OfferProposal | null> {
    const [row] = await this.db
      .select()
      .from(offerProposals)
      .where(and(eq(offerProposals.offerId, offerId), eq(offerProposals.status, 'pending')))
      .limit(1)
    return (row as unknown as OfferProposal) ?? null
  }

  async listByOffer(offerId: string): Promise<OfferProposal[]> {
    const rows = await this.db
      .select()
      .from(offerProposals)
      .where(eq(offerProposals.offerId, offerId))
      .orderBy(offerProposals.createdAt)
    return rows as unknown as OfferProposal[]
  }

  async setStatus(id: string, status: ProposalStatus): Promise<OfferProposal> {
    const [row] = await this.db
      .update(offerProposals)
      .set({ status, updatedAt: new Date() })
      .where(eq(offerProposals.id, id))
      .returning()
    return row as unknown as OfferProposal
  }
}
