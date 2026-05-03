import { z } from 'zod'

export const listReportsQuerySchema = z.object({
  status: z.enum(['pending', 'reviewing', 'resolved', 'dismissed']).optional(),
  targetType: z.enum(['user', 'message', 'post', 'collection', 'conversation', 'community_topic', 'community_comment']).optional(),
  reason: z.enum(['spam', 'harassment', 'nsfw', 'hate', 'other']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const updateReportStatusBodySchema = z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed']),
  currentStatus: z.enum(['pending', 'reviewing', 'resolved', 'dismissed']).optional(),
})

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>
export type UpdateReportStatusBody = z.infer<typeof updateReportStatusBodySchema>
