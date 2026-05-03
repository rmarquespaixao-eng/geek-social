import { z } from 'zod'

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  // Frontend manda `null` quando o campo é limpo — aceita ambos.
  description: z.string().max(500).nullable().optional(),
  // Aceita a chave string do tipo (compatível com enum antigo) ou UUID direto
  type: z.string().min(1).max(40),
  visibility: z.enum(['public', 'private', 'friends_only']).default('public'),
  autoShareToFeed: z.boolean().optional(),
  fieldDefinitionIds: z.array(z.string().uuid()).optional(),
})

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  visibility: z.enum(['public', 'private', 'friends_only']).optional(),
  autoShareToFeed: z.boolean().optional(),
})

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>

// Tipo do input após normalização no service (type → collectionTypeKey)
export type NormalizedCreateCollectionInput = Omit<CreateCollectionInput, 'type'> & {
  collectionTypeKey: string
}

export const attachSchemaEntrySchema = z.object({
  fieldDefinitionId: z.string().uuid(),
  isRequired: z.boolean().optional(),
})

export const updateSchemaEntrySchema = z.object({
  isRequired: z.boolean(),
})

export type AttachSchemaEntryInput = z.infer<typeof attachSchemaEntrySchema>
export type UpdateSchemaEntryInput = z.infer<typeof updateSchemaEntrySchema>
