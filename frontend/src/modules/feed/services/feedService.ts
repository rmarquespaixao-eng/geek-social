// src/modules/feed/services/feedService.ts
import { api } from '@/shared/http/api'
import type { FeedPage } from '../types'

export const feedService = {
  async getFeed(cursor?: string | null, limit = 20): Promise<FeedPage> {
    const params: Record<string, string | number> = { limit }
    if (cursor) params.cursor = cursor
    const { data } = await api.get<FeedPage>('/feed', { params })
    return data
  },
}
