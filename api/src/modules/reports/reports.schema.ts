import { z } from 'zod'

export const reportTargetTypes = ['user', 'message', 'post', 'collection', 'conversation', 'community_topic', 'community_comment'] as const
export const reportReasons = ['spam', 'harassment', 'nsfw', 'hate', 'other'] as const

export const createReportSchema = z.object({
  targetType: z.enum(reportTargetTypes),
  targetId: z.string().uuid(),
  reason: z.enum(reportReasons),
  description: z.string().trim().max(2000).optional().nullable(),
})

export type CreateReportInput = z.infer<typeof createReportSchema>
export type ReportTargetType = (typeof reportTargetTypes)[number]
export type ReportReason = (typeof reportReasons)[number]
