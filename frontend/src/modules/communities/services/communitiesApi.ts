// src/modules/communities/services/communitiesApi.ts
import { api } from '@/shared/http/api'
import type {
  CommunitySummary,
  CommunityDetail,
  CommunityListPage,
  CommunityCategory,
  CommunityVisibility,
  CreateCommunityPayload,
  UpdateCommunityPayload,
  CreateTopicPayload,
  Member,
  MembersPage,
  JoinRequest,
  JoinRequestsPage,
  TopicsPage,
  TopicDetail,
} from '../types'

function buildCommunityFormData(
  payload: CreateCommunityPayload,
  cover: File,
  icon: File,
): FormData {
  const fd = new FormData()
  fd.append('name', payload.name)
  fd.append('description', payload.description)
  fd.append('category', payload.category)
  fd.append('visibility', payload.visibility)
  fd.append('cover', cover)
  fd.append('icon', icon)
  return fd
}

function buildUpdateFormData(payload: UpdateCommunityPayload, cover?: File | null, icon?: File | null): FormData {
  const fd = new FormData()
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue
    fd.append(key, String(value))
  }
  if (cover) fd.append('cover', cover)
  if (icon) fd.append('icon', icon)
  return fd
}

export const communitiesApi = {
  async createCommunity(
    payload: CreateCommunityPayload,
    cover: File,
    icon: File,
  ): Promise<CommunitySummary> {
    const fd = buildCommunityFormData(payload, cover, icon)
    const { data } = await api.post<{ community: CommunitySummary }>('/communities', fd)
    return data.community
  },

  async listCommunities(filters: {
    category?: CommunityCategory | null
    visibility?: CommunityVisibility | null
    search?: string | null
    cursor?: string | null
    limit?: number
  } = {}): Promise<CommunityListPage> {
    const params: Record<string, string | number> = {}
    if (filters.category) params.category = filters.category
    if (filters.visibility) params.visibility = filters.visibility
    if (filters.search) params.search = filters.search
    if (filters.cursor) params.cursor = filters.cursor
    if (filters.limit) params.limit = filters.limit
    const { data } = await api.get<CommunityListPage>('/communities', { params })
    return data
  },

  async listOwned(filters: { cursor?: string | null; limit?: number } = {}): Promise<CommunityListPage> {
    const { data } = await api.get<CommunityListPage>('/communities/me/owned', { params: filters })
    return data
  },

  async listJoined(filters: { cursor?: string | null; limit?: number } = {}): Promise<CommunityListPage> {
    const { data } = await api.get<CommunityListPage>('/communities/me/joined', { params: filters })
    return data
  },

  async getCommunity(idOrSlug: string): Promise<CommunityDetail> {
    const { data } = await api.get<CommunityDetail>(`/communities/${idOrSlug}`)
    return data
  },

  async updateCommunity(
    id: string,
    payload: UpdateCommunityPayload,
    cover?: File | null,
    icon?: File | null,
  ): Promise<CommunitySummary> {
    if (cover || icon) {
      const fd = buildUpdateFormData(payload, cover, icon)
      const { data } = await api.patch<{ community: CommunitySummary }>(`/communities/${id}`, fd)
      return data.community
    }
    const { data } = await api.patch<{ community: CommunitySummary }>(`/communities/${id}`, payload)
    return data.community
  },

  async softDeleteCommunity(id: string): Promise<void> {
    await api.delete(`/communities/${id}`)
  },

  // Members

  async joinCommunity(id: string): Promise<{ status: 'active' | 'pending'; membership?: Member; request?: JoinRequest }> {
    const { data } = await api.post<{ status: 'active' | 'pending'; membership?: Member; request?: JoinRequest }>(
      `/communities/${id}/members`,
    )
    return data
  },

  async leaveCommunity(id: string): Promise<void> {
    await api.delete(`/communities/${id}/members/me`)
  },

  async listMembers(
    id: string,
    filters: { role?: string | null; status?: string | null; cursor?: string | null; limit?: number } = {},
  ): Promise<MembersPage> {
    const { data } = await api.get<MembersPage>(`/communities/${id}/members`, { params: filters })
    return data
  },

  // Join requests

  async listJoinRequests(
    id: string,
    filters: { cursor?: string | null; limit?: number } = {},
  ): Promise<JoinRequestsPage> {
    const { data } = await api.get<JoinRequestsPage>(`/communities/${id}/join-requests`, { params: filters })
    return data
  },

  async approveJoinRequest(communityId: string, userId: string): Promise<{ membership: Member }> {
    const { data } = await api.post<{ membership: Member }>(
      `/communities/${communityId}/join-requests/${userId}/approve`,
    )
    return data
  },

  async rejectJoinRequest(communityId: string, userId: string, reason?: string): Promise<void> {
    await api.post(`/communities/${communityId}/join-requests/${userId}/reject`, reason ? { reason } : undefined)
  },

  // Topics

  async listTopics(
    communityId: string,
    filters: { cursor?: string | null; limit?: number } = {},
  ): Promise<TopicsPage> {
    const { data } = await api.get<TopicsPage>(`/communities/${communityId}/topics`, { params: filters })
    return data
  },

  async createTopic(communityId: string, payload: CreateTopicPayload): Promise<TopicDetail> {
    const { data } = await api.post<{ topic: TopicDetail }>(`/communities/${communityId}/topics`, payload)
    return data.topic
  },

  async getTopic(communityId: string, topicId: string): Promise<{ topic: TopicDetail; meta: TopicDetail['meta'] }> {
    const { data } = await api.get<{ topic: TopicDetail; meta: TopicDetail['meta'] }>(
      `/communities/${communityId}/topics/${topicId}`,
    )
    return data
  },
}
