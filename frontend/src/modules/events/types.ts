// src/modules/events/types.ts

export type EventType = 'presencial' | 'online'
export type EventVisibility = 'public' | 'friends' | 'invite'
export type EventStatus = 'scheduled' | 'cancelled' | 'ended'
export type ParticipantStatus = 'subscribed' | 'confirmed' | 'waitlist' | 'left'

export interface EventAddress {
  cep: string
  logradouro: string
  numero: string
  complemento?: string | null
  bairro: string
  cidade: string
  estado: string
}

export interface EventOnlineDetails {
  meetingUrl: string
  extraDetails?: string | null
}

export interface EventSummary {
  id: string
  hostUserId: string
  hostName?: string
  hostAvatarUrl?: string | null
  name: string
  description: string | null
  coverUrl: string
  startsAt: string
  durationMinutes: number
  endsAt: string
  type: EventType
  visibility: EventVisibility
  capacity: number | null
  status: EventStatus
  cancellationReason: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  participantCount?: number
  confirmedCount?: number
  waitlistCount?: number
  cidade?: string | null
  iAmIn?: { status: ParticipantStatus; waitlistPosition?: number | null } | null
}

export interface EventParticipant {
  id: string
  userId: string
  userName: string
  userAvatarUrl: string | null
  status: ParticipantStatus
  waitlistPosition: number | null
  joinedAt: string
  confirmedAt: string | null
}

export interface EventDetail extends EventSummary {
  address?: EventAddress | null
  onlineDetails?: EventOnlineDetails | null
  participants: EventParticipant[]
  hostInfo: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

export interface EventListPage {
  events: EventSummary[]
  nextCursor: string | null
}

export interface ParticipantsPage {
  participants: EventParticipant[]
  nextCursor: string | null
}

export interface EventListFilters {
  from?: string | null
  to?: string | null
  type?: EventType | null
  cidade?: string | null
  cursor?: string | null
  limit?: number
}

export interface CreateEventPayload {
  name: string
  description?: string | null
  startsAt: string
  durationMinutes: number
  type: EventType
  visibility: EventVisibility
  capacity: number | null
  address?: EventAddress | null
  onlineDetails?: EventOnlineDetails | null
}

export interface UpdateEventPayload extends Partial<CreateEventPayload> {}

export interface SubscribeResponse {
  status: 'subscribed' | 'waitlist'
  position?: number
}

export type EventNotificationType =
  | 'event_reminder_48h'
  | 'event_reminder_2h'
  | 'event_cancelled'
  | 'event_updated'
  | 'event_conflict_after_edit'
  | 'event_promoted_from_waitlist'
  | 'event_invited'

export interface EventNotificationPayload {
  type: EventNotificationType
  entityId?: string | null
  data?: {
    eventId: string
    eventName?: string
    reason?: string
    changedFields?: string[]
    conflictingEventId?: string
    invitedBy?: string
  }
}

export interface ViaCepResponse {
  cep: string
  logradouro: string
  complemento?: string
  bairro: string
  localidade: string
  uf: string
  erro?: boolean | string
}
