import { z } from 'zod'

export const statsResponseSchema = z.object({
  totalUsers: z.number().int(),
  activeUsers24h: z.number().int(),
  totalCommunities: z.number().int(),
  activeCommunities: z.number().int(),
  pendingReports: z.number().int(),
  upcomingEvents: z.number().int(),
  messages24h: z.number().int(),
  messages7d: z.number().int(),
  staleAfterSeconds: z.number().int(),
})

export type StatsResponse = z.infer<typeof statsResponseSchema>
