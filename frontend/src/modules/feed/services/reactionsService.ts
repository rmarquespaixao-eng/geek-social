// src/modules/feed/services/reactionsService.ts
import { api } from '@/shared/http/api'

export interface PostReactions {
  counts: Record<string, number>
  myReaction: string | null
}

export const reactionsService = {
  async react(postId: string, type: string): Promise<void> {
    await api.post(`/posts/${postId}/reactions`, { type })
  },

  async removeReaction(postId: string): Promise<void> {
    await api.delete(`/posts/${postId}/reactions`)
  },

  async getReactions(postId: string): Promise<PostReactions> {
    const { data } = await api.get<PostReactions>(`/posts/${postId}/reactions`)
    return data
  },
}
