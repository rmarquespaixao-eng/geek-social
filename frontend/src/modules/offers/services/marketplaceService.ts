import { api } from '@/shared/http/api'
import type { ItemAvailability, CollectionSchemaEntry } from '@/modules/collections/types'

export interface MarketplaceItem {
  id: string
  collectionId: string
  name: string
  coverUrl: string | null
  fields: Record<string, unknown>
  rating: number | null
  comment: string | null
  availability: ItemAvailability
  askingPrice: string | null
  ownerId: string
  ownerDisplayName: string
  ownerAvatarUrl: string | null
  collectionType: string
  collectionVisibility: string
  /** Schema da coleção do dono — usado para renderizar campos custom com labels corretos no modal de detalhes. */
  fieldSchema: CollectionSchemaEntry[]
  createdAt: string
  updatedAt: string
}

export interface MarketplaceQuery {
  type?: 'sale' | 'trade' | 'both'
  collectionType?: string
  minPrice?: number
  maxPrice?: number
  limit?: number
}

export async function listMarketplace(query: MarketplaceQuery = {}): Promise<MarketplaceItem[]> {
  const params: Record<string, string | number> = {}
  if (query.type)           params.type = query.type
  if (query.collectionType) params.collection_type = query.collectionType
  if (query.minPrice != null) params.min_price = query.minPrice
  if (query.maxPrice != null) params.max_price = query.maxPrice
  if (query.limit != null)    params.limit = query.limit
  const { data } = await api.get<MarketplaceItem[]>('/marketplace', { params })
  return data
}
