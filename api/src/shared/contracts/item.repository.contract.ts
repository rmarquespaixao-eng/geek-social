export type Item = {
  id: string
  collectionId: string
  name: string
  coverUrl: string | null
  fields: Record<string, unknown>
  rating: number | null
  comment: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateItemData = {
  collectionId: string
  name: string
  fields?: Record<string, unknown>
  rating?: number
  comment?: string
}

export type UpdateItemData = {
  name?: string
  fields?: Record<string, unknown>
  rating?: number | null
  comment?: string | null
  coverUrl?: string | null
  collectionId?: string
}

export type ExistingSteamItem = {
  appId: number
  collectionId: string
}

export type ItemSort = 'recent' | 'oldest' | 'name' | 'name_desc' | 'rating'

/**
 * Filtro genérico por campo dinâmico do schema.
 * - `text`: contém substring (ILIKE)
 * - `select`: igualdade (multi: lista de valores aceitáveis)
 * - `boolean`: 'true' / 'false'
 * - `number` / `money` / `date`: gte / lte (range)
 */
export type FieldFilter = {
  fieldKey: string
  fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'money'
  contains?: string
  equalsAny?: string[]
  boolValue?: boolean
  gte?: number | string
  lte?: number | string
}

export type SearchItemsParams = {
  collectionId: string
  q?: string
  sort: ItemSort
  limit: number
  cursor?: string
  ratingMin?: number
  hasCover?: boolean
  fieldFilters?: FieldFilter[]
}

export type ItemsPage = {
  items: Item[]
  nextCursor: string | null
}

export interface IItemRepository {
  create(data: CreateItemData): Promise<Item>
  findById(id: string): Promise<Item | null>
  findByCollectionId(collectionId: string, query?: string): Promise<Item[]>
  searchByCollection(params: SearchItemsParams): Promise<ItemsPage>
  findByCollectionAndAppId(collectionId: string, steamAppId: number): Promise<Item | null>
  findExistingSteamItemsForUser(userId: string): Promise<ExistingSteamItem[]>
  update(id: string, data: UpdateItemData): Promise<Item>
  delete(id: string): Promise<void>
}
