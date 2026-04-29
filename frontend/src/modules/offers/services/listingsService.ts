import { api } from '@/shared/http/api'
import type { CollectionSchemaEntry } from '@/modules/collections/types'

export type ListingStatus = 'active' | 'paused' | 'closed'
export type ListingAvailability = 'sale' | 'trade' | 'both'
export type PaymentMethod = 'pix' | 'money' | 'transfer' | 'card' | 'negotiate'

export interface ListingItem {
  id: string
  name: string
  coverUrl: string | null
  fields: Record<string, unknown>
  rating: number | null
  comment: string | null
  collectionId: string
  collectionType: string
  fieldSchema?: CollectionSchemaEntry[]
}

export interface ListingOwner {
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface Listing {
  id: string
  itemId: string
  ownerId: string
  availability: ListingAvailability
  askingPrice: string | null
  paymentMethods: PaymentMethod[]
  status: ListingStatus
  disclaimerAcceptedAt: string
  createdAt: string
  updatedAt: string
}

export interface ListingWithItem extends Listing {
  item: ListingItem
  pendingOffersCount: number
}

export interface MarketplaceListing extends Listing {
  item: ListingItem & { fieldSchema: CollectionSchemaEntry[] }
  owner: ListingOwner
}

export interface CreateListingPayload {
  itemId: string
  availability: ListingAvailability
  askingPrice?: number | null
  paymentMethods?: PaymentMethod[]
  disclaimerAccepted: true
}

export interface UpdateListingPayload {
  availability?: ListingAvailability
  askingPrice?: number | null
  paymentMethods?: PaymentMethod[]
}

export interface MarketplaceQuery {
  type?: ListingAvailability
  collectionType?: string
  minPrice?: number
  maxPrice?: number
  limit?: number
}

export async function listMarketplace(query: MarketplaceQuery = {}): Promise<MarketplaceListing[]> {
  const params: Record<string, string | number> = {}
  if (query.type)             params.type = query.type
  if (query.collectionType)   params.collection_type = query.collectionType
  if (query.minPrice != null) params.min_price = query.minPrice
  if (query.maxPrice != null) params.max_price = query.maxPrice
  if (query.limit != null)    params.limit = query.limit
  const { data } = await api.get<MarketplaceListing[]>('/marketplace', { params })
  return data
}

export async function listMyListings(status?: ListingStatus): Promise<ListingWithItem[]> {
  const params: Record<string, string> = {}
  if (status) params.status = status
  const { data } = await api.get<ListingWithItem[]>('/listings/mine', { params })
  return data
}

export async function createListing(payload: CreateListingPayload): Promise<Listing> {
  const { data } = await api.post<Listing>('/listings', payload)
  return data
}

export async function updateListing(id: string, payload: UpdateListingPayload): Promise<Listing> {
  const { data } = await api.patch<Listing>(`/listings/${id}`, payload)
  return data
}

export async function pauseListing(id: string): Promise<Listing> {
  const { data } = await api.patch<Listing>(`/listings/${id}/pause`)
  return data
}

export async function resumeListing(id: string): Promise<Listing> {
  const { data } = await api.patch<Listing>(`/listings/${id}/resume`)
  return data
}

export async function closeListing(id: string): Promise<Listing> {
  const { data } = await api.delete<Listing>(`/listings/${id}`)
  return data
}

export async function hardDeleteListing(id: string): Promise<void> {
  await api.delete(`/listings/${id}`, { params: { hard: 'true' } })
}
