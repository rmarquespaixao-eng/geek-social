import { z } from 'zod'

export const startImportSchema = z.object({
  collectionId: z.string().uuid().optional(),
  newCollectionName: z.string().min(1).max(100).optional(),
  appIds: z.array(z.number().int().positive()).min(1).max(2000),
  gamesSnapshot: z.array(z.object({
    appId: z.number().int().positive(),
    name: z.string(),
    playtimeForever: z.number().int().nonnegative(),
  })).optional(),
}).refine(
  (data) => Boolean(data.collectionId) !== Boolean(data.newCollectionName),
  { message: 'Forneça collectionId OU newCollectionName, não ambos' },
)

export type StartImportInput = z.infer<typeof startImportSchema>
