export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded'

export type OfferProposal = {
  id: string
  offerId: string
  proposerId: string
  offeredPrice: string | null
  offeredItemId: string | null
  message: string | null
  status: ProposalStatus
  createdAt: Date
  updatedAt: Date
}

export type CreateProposalData = {
  offerId: string
  proposerId: string
  offeredPrice?: string | null
  offeredItemId?: string | null
  message?: string | null
}

export interface IOfferProposalsRepository {
  create(data: CreateProposalData): Promise<OfferProposal>
  findById(id: string): Promise<OfferProposal | null>
  findLatestByOffer(offerId: string): Promise<OfferProposal | null>
  findPendingByOffer(offerId: string): Promise<OfferProposal | null>
  listByOffer(offerId: string): Promise<OfferProposal[]>
  setStatus(id: string, status: ProposalStatus): Promise<OfferProposal>
}
