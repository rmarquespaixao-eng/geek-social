// src/modules/events/services/eventsApi.ts
import { api } from '@/shared/http/api'
import type {
  CreateEventPayload,
  EventDetail,
  EventListFilters,
  EventListPage,
  EventSummary,
  ParticipantsPage,
  SubscribeResponse,
  UpdateEventPayload,
} from '../types'

function buildCreateFormData(payload: CreateEventPayload, cover: File): FormData {
  const fd = new FormData()
  fd.append('name', payload.name)
  if (payload.description != null) fd.append('description', payload.description)
  fd.append('startsAt', payload.startsAt)
  fd.append('durationMinutes', String(payload.durationMinutes))
  fd.append('type', payload.type)
  fd.append('visibility', payload.visibility)
  if (payload.capacity != null) fd.append('capacity', String(payload.capacity))
  if (payload.type === 'presencial' && payload.address) {
    fd.append('address', JSON.stringify(payload.address))
  }
  if (payload.type === 'online' && payload.onlineDetails) {
    fd.append('onlineDetails', JSON.stringify(payload.onlineDetails))
  }
  fd.append('cover', cover)
  return fd
}

export const eventsApi = {
  async createEvent(payload: CreateEventPayload, cover: File): Promise<EventSummary> {
    const fd = buildCreateFormData(payload, cover)
    const { data } = await api.post<{ event: EventSummary }>('/events', fd)
    return data.event
  },

  async listEvents(filters: EventListFilters = {}): Promise<EventListPage> {
    const params: Record<string, string | number> = {}
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    if (filters.type) params.type = filters.type
    if (filters.cidade) params.cidade = filters.cidade
    if (filters.cursor) params.cursor = filters.cursor
    if (filters.limit) params.limit = filters.limit
    const { data } = await api.get<EventListPage>('/events', { params })
    return data
  },

  async getEvent(id: string): Promise<EventDetail> {
    const { data } = await api.get<{
      event: EventSummary
      participants: EventDetail['participants']
      iAmIn: EventDetail['iAmIn']
      hostInfo: EventDetail['hostInfo']
      address?: EventDetail['address']
      onlineDetails?: EventDetail['onlineDetails']
    }>(`/events/${id}`)
    return {
      ...data.event,
      participants: data.participants ?? [],
      iAmIn: data.iAmIn ?? null,
      hostInfo: data.hostInfo,
      address: data.address ?? null,
      onlineDetails: data.onlineDetails ?? null,
    }
  },

  async updateEvent(
    id: string,
    payload: UpdateEventPayload,
    cover?: File | null,
  ): Promise<{ event: EventSummary; sensitiveChanged: boolean }> {
    if (cover) {
      const fd = new FormData()
      for (const [key, value] of Object.entries(payload)) {
        if (value == null) continue
        if (typeof value === 'object') fd.append(key, JSON.stringify(value))
        else fd.append(key, String(value))
      }
      fd.append('cover', cover)
      const { data } = await api.patch<{ event: EventSummary; sensitiveChanged: boolean }>(
        `/events/${id}`,
        fd,
      )
      return data
    }
    const { data } = await api.patch<{ event: EventSummary; sensitiveChanged: boolean }>(
      `/events/${id}`,
      payload,
    )
    return data
  },

  /** Cancela o rolê (soft): mantém no banco com `status='cancelled'`. */
  async cancelEvent(id: string, reason?: string): Promise<void> {
    await api.delete(`/events/${id}`, { data: reason ? { reason } : undefined })
  },

  /** Hard delete: remove o rolê do banco. Notifica inscritos se ainda estava `scheduled`. */
  async forceDeleteEvent(id: string): Promise<void> {
    await api.delete(`/events/${id}/permanent`)
  },

  async listMyHosted(filters: { status?: string; cursor?: string | null; limit?: number } = {}): Promise<EventListPage> {
    const { data } = await api.get<EventListPage>('/events/me/hosted', { params: filters })
    return data
  },

  async listMyAttending(
    filters: { status?: string; from?: string; cursor?: string | null; limit?: number } = {},
  ): Promise<EventListPage> {
    const { data } = await api.get<EventListPage>('/events/me/attending', { params: filters })
    return data
  },

  async subscribe(eventId: string): Promise<SubscribeResponse> {
    const { data } = await api.post<SubscribeResponse>(`/events/${eventId}/participants`)
    return data
  },

  async leave(eventId: string): Promise<void> {
    await api.delete(`/events/${eventId}/participants/me`)
  },

  async confirm(eventId: string): Promise<{ status: 'confirmed' }> {
    const { data } = await api.post<{ status: 'confirmed' }>(
      `/events/${eventId}/participants/me/confirm`,
    )
    return data
  },

  async listParticipants(
    eventId: string,
    filters: { status?: string; cursor?: string | null; limit?: number } = {},
  ): Promise<ParticipantsPage> {
    const { data } = await api.get<ParticipantsPage>(`/events/${eventId}/participants`, {
      params: filters,
    })
    return data
  },
}
