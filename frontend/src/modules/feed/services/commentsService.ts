// src/modules/feed/services/commentsService.ts
import { api } from '@/shared/http/api'
import type { CommentsPage, Comment } from '../types'

export const commentsService = {
  async addComment(postId: string, content: string): Promise<Comment> {
    const { data } = await api.post<Comment>(`/posts/${postId}/comments`, { content })
    return data
  },

  async listComments(postId: string, cursor?: string | null, limit = 20): Promise<CommentsPage> {
    const params: Record<string, string | number> = { limit }
    if (cursor) params.cursor = cursor
    const { data } = await api.get<CommentsPage>(`/posts/${postId}/comments`, { params })
    return data
  },

  async updateComment(postId: string, id: string, content: string): Promise<Comment> {
    const { data } = await api.patch<Comment>(`/posts/${postId}/comments/${id}`, { content })
    return data
  },

  async deleteComment(postId: string, id: string): Promise<void> {
    await api.delete(`/posts/${postId}/comments/${id}`)
  },
}
