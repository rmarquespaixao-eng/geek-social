import { api } from '@/shared/http/api'

export type OfferType = 'buy' | 'trade'
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'completed'

export interface OfferUserSummary {
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface OfferItemSummary {
  id: string
  name: string
  coverUrl: string | null
  collectionId: string
}

export interface Offer {
  id: string
  type: OfferType
  itemId: string
  ownerId: string
  offererId: string
  offeredItemId: string | null
  offeredPrice: string | null
  message: string | null
  status: OfferStatus
  offererConfirmedAt: string | null
  ownerConfirmedAt: string | null
  createdAt: string
  updatedAt: string
  item: OfferItemSummary
  offeredItem: OfferItemSummary | null
  owner: OfferUserSummary
  offerer: OfferUserSummary
  /** Última proposta pendente OU rejeitada na oferta. Determina quem tem o turno. */
  latestProposal: { id: string; proposerId: string; status: 'pending' | 'rejected' } | null
}

export type CreateOfferPayload =
  | { type: 'buy'; listingId: string; offeredPrice: number | string; message?: string | null }
  | { type: 'trade'; listingId: string; offeredItemId: string; message?: string | null }

export async function createOffer(payload: CreateOfferPayload): Promise<Offer> {
  const { data } = await api.post<Offer>('/offers', payload)
  return data
}

export async function listReceived(status?: OfferStatus): Promise<Offer[]> {
  const { data } = await api.get<Offer[]>('/offers/received', { params: status ? { status } : {} })
  return data
}

export async function listSent(status?: OfferStatus): Promise<Offer[]> {
  const { data } = await api.get<Offer[]>('/offers/sent', { params: status ? { status } : {} })
  return data
}

export async function getOffer(id: string): Promise<Offer> {
  const { data } = await api.get<Offer>(`/offers/${id}`)
  return data
}

export async function acceptOffer(id: string): Promise<{ offer: Offer; rejectedSiblings: string[] }> {
  const { data } = await api.post<{ offer: Offer; rejectedSiblings: string[] }>(`/offers/${id}/accept`)
  return data
}

export async function rejectOffer(id: string): Promise<Offer> {
  const { data } = await api.post<Offer>(`/offers/${id}/reject`)
  return data
}

export async function cancelOffer(id: string): Promise<Offer> {
  const { data } = await api.post<Offer>(`/offers/${id}/cancel`)
  return data
}

export async function confirmOffer(id: string): Promise<{ offer: Offer; movedItems: { itemId: string; toCollectionId: string }[] }> {
  const { data } = await api.post<{ offer: Offer; movedItems: { itemId: string; toCollectionId: string }[] }>(`/offers/${id}/confirm`)
  return data
}

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded'

export interface OfferProposal {
  id: string
  offerId: string
  proposerId: string
  offeredPrice: string | null
  offeredItemId: string | null
  message: string | null
  status: ProposalStatus
  createdAt: string
  updatedAt: string
}

export interface ProposeInput {
  offeredPrice?: number | null
  offeredItemId?: string | null
  message?: string | null
}

export async function proposeOffer(offerId: string, input: ProposeInput): Promise<OfferProposal> {
  const { data } = await api.post<OfferProposal>(`/offers/${offerId}/propose`, input)
  return data
}

export async function getOfferHistory(offerId: string): Promise<OfferProposal[]> {
  const { data } = await api.get<OfferProposal[]>(`/offers/${offerId}/history`)
  return data
}
