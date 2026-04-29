// src/modules/feed/services/postsService.ts
import { api } from '@/shared/http/api'
import type { Post } from '../types'

export interface CreatePostData {
  content: string
  visibility?: 'public' | 'friends_only' | 'private'
}

export interface UpdatePostData {
  content?: string
}

export const postsService = {
  async createPost(data: CreatePostData): Promise<Post> {
    const { data: post } = await api.post<Post>('/posts', data)
    return post
  },

  async getPost(id: string): Promise<Post> {
    const { data } = await api.get<Post>(`/posts/${id}`)
    return data
  },

  async updatePost(id: string, data: UpdatePostData): Promise<Post> {
    const { data: post } = await api.patch<Post>(`/posts/${id}`, data)
    return post
  },

  async deletePost(id: string): Promise<void> {
    await api.delete(`/posts/${id}`)
  },

  async addMedia(id: string, files: File[], onProgress?: (pct: number) => void): Promise<Post> {
    const form = new FormData()
    for (const file of files) form.append('file', file)
    const { data } = await api.post<Post>(`/posts/${id}/media`, form, {
      onUploadProgress: onProgress
        ? (e) => { if (e.total) onProgress(Math.round((e.loaded / e.total) * 100)) }
        : undefined,
    })
    return data
  },

  async removeMedia(id: string, mediaId: string): Promise<void> {
    await api.delete(`/posts/${id}/media/${mediaId}`)
  },

  async getUserPosts(userId: string, cursor?: string | null, limit = 20): Promise<{ posts: Post[]; nextCursor: string | null }> {
    const params: Record<string, string | number> = { limit }
    if (cursor) params.cursor = cursor
    const { data } = await api.get<{ posts: Post[]; nextCursor: string | null }>(`/users/${userId}/posts`, { params })
    return data
  },
}
