import type { CollectionSchemaEntry } from './collection.repository.contract.js'

export type ListingStatus = 'active' | 'paused' | 'closed'
export type PaymentMethod = 'pix' | 'money' | 'transfer' | 'card' | 'negotiate'
export type ListingAvailability = 'sale' | 'trade' | 'both'

export type Listing = {
  id: string
  itemId: string
  ownerId: string
  availability: ListingAvailability
  askingPrice: string | null
  paymentMethods: PaymentMethod[]
  status: ListingStatus
  disclaimerAcceptedAt: Date
  createdAt: Date
  updatedAt: Date
}

export type CreateListingData = {
  itemId: string
  ownerId: string
  availability: ListingAvailability
  askingPrice?: number | null
  paymentMethods: PaymentMethod[]
  disclaimerAcceptedAt: Date
}

export type UpdateListingData = {
  availability?: ListingAvailability
  askingPrice?: number | null
  paymentMethods?: PaymentMethod[]
  status?: ListingStatus
}

export type ListingItemSnapshot = {
  id: string
  name: string
  coverUrl: string | null
  fields: Record<string, unknown>
  rating: number | null
  comment: string | null
  collectionId: string
  collectionType: string
}

export type ListingWithItem = Listing & {
  item: ListingItemSnapshot
  pendingOffersCount: number
}

export type MarketplaceListing = Listing & {
  item: ListingItemSnapshot & { fieldSchema: CollectionSchemaEntry[] }
  owner: { id: string; displayName: string; avatarUrl: string | null }
}

export type SearchMarketplaceParams = {
  viewerId: string
  type?: ListingAvailability
  collectionType?: string
  minPrice?: number
  maxPrice?: number
  limit: number
}

export interface IListingsRepository {
  create(data: CreateListingData): Promise<Listing>
  findById(id: string): Promise<Listing | null>
  findActiveByItemId(itemId: string): Promise<Listing | null>
  findByOwnerId(ownerId: string, status?: ListingStatus): Promise<ListingWithItem[]>
  update(id: string, data: UpdateListingData): Promise<Listing>
  searchMarketplace(params: SearchMarketplaceParams): Promise<MarketplaceListing[]>
}
