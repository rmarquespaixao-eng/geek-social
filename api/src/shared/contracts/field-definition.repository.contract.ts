export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'money'
export type CollectionType = 'games' | 'books' | 'cardgames' | 'boardgames' | 'custom'

export type FieldDefinition = {
  id: string
  userId: string | null
  name: string
  fieldKey: string
  fieldType: FieldType
  collectionType: CollectionType | null
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
  isFieldKeyTaken(userId: string, fieldKey: string): Promise<boolean>
  isInUse(id: string): Promise<boolean>
  delete(id: string): Promise<void>
  upsertSystem(data: Omit<FieldDefinition, 'id' | 'createdAt' | 'isHidden'> & { isHidden?: boolean }): Promise<void>
}
