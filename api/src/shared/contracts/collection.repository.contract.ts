import type { CollectionType, FieldDefinition } from './field-definition.repository.contract.js'

export type CollectionVisibility = 'public' | 'private' | 'friends_only'

export type Collection = {
  id: string
  userId: string
  name: string
  description: string | null
  iconUrl: string | null
  coverUrl: string | null
  /** @deprecated Use collectionTypeId — mantido para compatibilidade durante migração */
  type?: CollectionType | null
  collectionTypeId: string | null
  visibility: CollectionVisibility
  autoShareToFeed: boolean
  itemCount: number
  createdAt: Date
  updatedAt: Date
}

export type CollectionSchemaEntry = {
  id: string
  fieldDefinition: FieldDefinition
  isRequired: boolean
  displayOrder: number
}

export type CollectionWithSchema = Collection & {
  fieldSchema: CollectionSchemaEntry[]
}

export type CreateCollectionData = {
  userId: string
  name: string
  description?: string
  type?: CollectionType
  collectionTypeId?: string
  visibility?: CollectionVisibility
  autoShareToFeed?: boolean
}

export type UpdateCollectionData = {
  name?: string
  description?: string
  visibility?: CollectionVisibility
  autoShareToFeed?: boolean
  iconUrl?: string | null
  coverUrl?: string | null
}

export type SchemaEntryData = {
  fieldDefinitionId: string
  isRequired: boolean
  displayOrder: number
}

export interface ICollectionRepository {
  create(data: CreateCollectionData): Promise<Collection>
  findById(id: string): Promise<CollectionWithSchema | null>
  findByUserId(userId: string, query?: string): Promise<Collection[]>
  findPublicByUserId(userId: string, visibilities: CollectionVisibility[]): Promise<Collection[]>
  update(id: string, data: UpdateCollectionData): Promise<Collection>
  delete(id: string): Promise<void>
  addFieldsToSchema(collectionId: string, fields: SchemaEntryData[]): Promise<void>
  getFieldSchema(collectionId: string): Promise<CollectionSchemaEntry[]>
  /** Batch: retorna mapa collectionId → schema, para evitar N+1 ao listar itens de várias coleções. */
  getFieldSchemasForCollections(collectionIds: string[]): Promise<Record<string, CollectionSchemaEntry[]>>
  /** Adiciona uma única definição ao schema. Retorna a entry recém-criada com o fieldDefinition populado. */
  addOneToSchema(collectionId: string, data: SchemaEntryData): Promise<CollectionSchemaEntry>
  findSchemaEntry(entryId: string): Promise<(CollectionSchemaEntry & { collectionId: string }) | null>
  updateSchemaEntry(entryId: string, data: { isRequired?: boolean; displayOrder?: number }): Promise<CollectionSchemaEntry>
  removeFromSchema(entryId: string): Promise<void>
  /** Verifica se já existe uma entry no schema com o mesmo fieldKey (para evitar duplicidade) */
  hasFieldKeyInCollection(collectionId: string, fieldKey: string): Promise<boolean>
}
