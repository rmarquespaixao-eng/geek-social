// src/modules/feed/services/reactionsService.ts
import { api } from '@/shared/http/api'
import type { Reaction } from '../types'

export const reactionsService = {
  async react(postId: string, type: string): Promise<void> {
    await api.post(`/posts/${postId}/reactions`, { type })
  },

  async removeReaction(postId: string): Promise<void> {
    await api.delete(`/posts/${postId}/reactions`)
  },

  async getReactions(postId: string): Promise<Reaction[]> {
    const { data } = await api.get<Reaction[]>(`/posts/${postId}/reactions`)
    return data
  },
}
