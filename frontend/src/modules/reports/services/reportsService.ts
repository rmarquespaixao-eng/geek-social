import { api } from '@/shared/http/api'

export type ReportTargetType = 'user' | 'message' | 'post' | 'collection' | 'conversation'
export type ReportReason = 'spam' | 'harassment' | 'nsfw' | 'hate' | 'other'

export interface CreateReportPayload {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  description?: string | null
}

export interface ReportCreated {
  id: string
  status: 'pending' | 'reviewed' | 'dismissed'
  createdAt: string
}

export async function createReport(payload: CreateReportPayload): Promise<ReportCreated> {
  const { data } = await api.post<ReportCreated>('/reports', payload)
  return data
}
