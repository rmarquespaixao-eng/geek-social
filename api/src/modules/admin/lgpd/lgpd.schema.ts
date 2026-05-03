import { z } from 'zod'

export const listLgpdQuerySchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'rejected']).optional(),
  type: z.enum(['export', 'delete', 'rectify', 'portability']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const decideLgpdBodySchema = z.object({
  notes: z.string().max(1000).trim().optional(),
})

export type ListLgpdQuery = z.infer<typeof listLgpdQuerySchema>
export type DecideLgpdBody = z.infer<typeof decideLgpdBodySchema>
