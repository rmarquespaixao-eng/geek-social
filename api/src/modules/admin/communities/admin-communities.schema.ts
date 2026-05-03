import { z } from 'zod'

export const listCommunitiesQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const updateCommunityStatusBodySchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().max(500).trim().optional(),
})

export type ListCommunitiesQuery = z.infer<typeof listCommunitiesQuerySchema>
export type UpdateCommunityStatusBody = z.infer<typeof updateCommunityStatusBodySchema>
