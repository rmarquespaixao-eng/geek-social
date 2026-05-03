import { z } from 'zod'

export const collectionTypeInputSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/, 'Apenas letras minúsculas, números, hífens e underscores'),
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  icon: z.string().max(20).optional(),
  active: z.boolean().optional(),
})

export const collectionTypeUpdateSchema = collectionTypeInputSchema.partial().omit({ key: true })

export const collectionTypeResponseSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  isSystem: z.boolean(),
  active: z.boolean(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const listCollectionTypesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  active: z.enum(['true', 'false']).optional().transform(v => v === undefined ? undefined : v === 'true'),
})

export const listCollectionTypesResponseSchema = z.object({
  data: z.array(collectionTypeResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})

export type CollectionTypeInput = z.infer<typeof collectionTypeInputSchema>
export type CollectionTypeUpdate = z.infer<typeof collectionTypeUpdateSchema>
export type ListCollectionTypesQuery = z.infer<typeof listCollectionTypesQuerySchema>
