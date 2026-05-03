export type CollectionType = string

export interface CollectionTypeDefinition {
  id: string
  key: string
  name: string | null
  description: string | null
  icon: string | null
  isSystem: boolean
}

export type CollectionVisibility = 'public' | 'private' | 'friends_only'

export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'money'

export interface FieldDefinition {
  id: string
  name: string
  fieldKey: string
  fieldType: FieldType
  selectOptions?: string[] | null
  collectionType?: CollectionType | null
  isSystem: boolean
  isHidden?: boolean
}

export interface CollectionSchemaEntry {
  id: string
  fieldDefinition: FieldDefinition
  isRequired: boolean
  displayOrder: number
}

export interface Collection {
  id: string
  userId: string
  name: string
  description?: string
  type: CollectionType
  coverUrl?: string
  iconUrl?: string
  visibility: CollectionVisibility
  autoShareToFeed: boolean
  itemCount: number
  createdAt: string
  updatedAt?: string
  fieldSchema?: CollectionSchemaEntry[]
}

export type ItemAvailability = 'none' | 'sale' | 'trade' | 'both'

export interface Item {
  id: string
  collectionId: string
  name: string
  coverUrl?: string
  rating?: number          // 1–5, inteiro ou null
  comment?: string         // antes era "notes" — backend usa comment
  fields: Record<string, unknown>
  availability?: ItemAvailability
  askingPrice?: string | null
  createdAt: string
  updatedAt?: string
}

export interface CreateCollectionPayload {
  name: string
  description?: string
  type: CollectionType
  visibility?: CollectionVisibility
  autoShareToFeed?: boolean
}

export interface UpdateCollectionPayload {
  name?: string
  description?: string
  visibility?: CollectionVisibility
  autoShareToFeed?: boolean
}

export interface CreateItemPayload {
  name: string
  rating?: number
  comment?: string
  fields?: Record<string, unknown>
  shareToFeed?: boolean
}

export interface UpdateItemPayload {
  name?: string
  rating?: number | null
  comment?: string | null
  fields?: Record<string, unknown>
}

export interface CreateFieldDefinitionPayload {
  name: string
  fieldType: FieldType
  selectOptions?: string[]
}

export type ItemSort = 'recent' | 'oldest' | 'name' | 'name_desc' | 'rating'

/**
 * Filtro do usuário aplicado a um campo dinâmico (do schema).
 * - text: contains
 * - select: lista de valores aceitáveis
 * - boolean: true/false (undefined = qualquer)
 * - number/money/date: range gte/lte
 */
export interface FieldFilterValue {
  contains?: string
  equalsAny?: string[]
  boolValue?: boolean | null
  gte?: number | string | null
  lte?: number | string | null
}

export interface ItemListQuery {
  q?: string
  cursor?: string | null
  limit?: number
  sort?: ItemSort
  ratingMin?: number | null
  hasCover?: boolean | null
  fieldFilters?: Record<string, FieldFilterValue>
}

export interface ItemsPage {
  items: Item[]
  nextCursor: string | null
}

export interface ItemWithCollection extends Item {
  collectionName: string
  collectionTypeKey: string
  collectionTypeIcon: string | null
}

export interface AllItemsPage {
  items: ItemWithCollection[]
  nextCursor: string | null
}

export interface CollectionStats {
  totalCollections: number
  itemsByType: { typeKey: string; typeName: string; typeIcon: string; count: number }[]
  gamesByStatus: { status: string | null; count: number }[]
  itemsByRating: { rating: number | null; count: number }[]
}
