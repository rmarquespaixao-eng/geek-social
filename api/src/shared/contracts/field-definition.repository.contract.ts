export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'money'
export type CollectionType = 'games' | 'books' | 'cardgames' | 'boardgames' | 'custom'

export type FieldDefinition = {
  id: string
  userId: string | null
  name: string
  fieldKey: string
  fieldType: FieldType
  /** @deprecated Use collectionTypeId — mantido para compatibilidade durante migração */
  collectionType?: CollectionType | null
  collectionTypeId?: string | null
  selectOptions: string[] | null
  isSystem: boolean
  isHidden: boolean
  createdAt: Date
}

export type CreateFieldDefinitionData = {
  userId: string
  name: string
  fieldKey: string
  fieldType: FieldType
  selectOptions?: string[]
}

export interface IFieldDefinitionRepository {
  create(data: CreateFieldDefinitionData): Promise<FieldDefinition>
  findById(id: string): Promise<FieldDefinition | null>
  findByUserId(userId: string): Promise<FieldDefinition[]>
  findSystemByCollectionType(type: CollectionType): Promise<FieldDefinition[]>
  findSystemByCollectionTypeId(collectionTypeId: string): Promise<FieldDefinition[]>
  isFieldKeyTaken(userId: string, fieldKey: string): Promise<boolean>
  isInUse(id: string): Promise<boolean>
  delete(id: string): Promise<void>
  upsertSystem(data: Omit<FieldDefinition, 'id' | 'createdAt' | 'isHidden'> & { isHidden?: boolean }): Promise<void>
}
