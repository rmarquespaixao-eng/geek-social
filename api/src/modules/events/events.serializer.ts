import type { EventDetail as RepoEventDetail, EventRow } from './events.repository.js'
import {
  zeroCounts,
  type ParticipantCounts,
  type ParticipantRow,
  type ParticipantWithUser,
} from './participants.repository.js'

export type ApiEventSummary = {
  id: string
  hostUserId: string
  hostName: string
  hostAvatarUrl: string | null
  name: string
  description: string | null
  coverUrl: string
  startsAt: string
  durationMinutes: number
  endsAt: string
  type: 'presencial' | 'online'
  visibility: 'public' | 'friends' | 'invite'
  capacity: number | null
  status: 'scheduled' | 'cancelled' | 'ended'
  cancellationReason: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
  participantCount: number
  confirmedCount: number
  waitlistCount: number
  cidade: string | null
  iAmIn: ApiViewerParticipation | null
}

export type ApiEventParticipant = {
  id: string
  userId: string
  userName: string
  userAvatarUrl: string | null
  status: 'subscribed' | 'confirmed' | 'waitlist' | 'left'
  waitlistPosition: number | null
  joinedAt: string
  confirmedAt: string | null
}

export type ApiViewerParticipation = {
  status: 'subscribed' | 'confirmed' | 'waitlist' | 'left'
  waitlistPosition: number | null
}

export type ApiEventDetailEnvelope = {
  event: ApiEventSummary
  participants: ApiEventParticipant[]
  iAmIn: ApiViewerParticipation | null
  hostInfo: { id: string; name: string; avatarUrl: string | null }
  address: {
    cep: string
    logradouro: string
    numero: string
    complemento: string | null
    bairro: string
    cidade: string
    estado: string
  } | null
  onlineDetails: { meetingUrl: string; extraDetails: string | null } | null
}

function toViewerParticipation(p: ParticipantRow | null): ApiViewerParticipation | null {
  if (!p) return null
  if (p.status === 'left') return null
  return { status: p.status, waitlistPosition: p.waitlistPosition }
}

export function serializeEventSummary(
  detail: RepoEventDetail,
  counts: ParticipantCounts,
  viewerParticipation: ParticipantRow | null = null,
): ApiEventSummary {
  return {
    id: detail.id,
    hostUserId: detail.hostUserId,
    hostName: detail.host.displayName,
    hostAvatarUrl: detail.host.avatarUrl,
    name: detail.name,
    description: detail.description,
    coverUrl: detail.coverUrl,
    startsAt: detail.startsAt.toISOString(),
    durationMinutes: detail.durationMinutes,
    endsAt: detail.endsAt.toISOString(),
    type: detail.type,
    visibility: detail.visibility,
    capacity: detail.capacity,
    status: detail.status,
    cancellationReason: detail.cancellationReason,
    cancelledAt: detail.cancelledAt ? detail.cancelledAt.toISOString() : null,
    createdAt: detail.createdAt.toISOString(),
    updatedAt: detail.updatedAt.toISOString(),
    participantCount: counts.subscribed + counts.confirmed,
    confirmedCount: counts.confirmed,
    waitlistCount: counts.waitlist,
    cidade: detail.address?.cidade ?? null,
    iAmIn: toViewerParticipation(viewerParticipation),
  }
}

export function serializeEventParticipant(p: ParticipantWithUser): ApiEventParticipant {
  return {
    id: p.id,
    userId: p.userId,
    userName: p.user.displayName,
    userAvatarUrl: p.user.avatarUrl,
    status: p.status,
    waitlistPosition: p.waitlistPosition,
    joinedAt: p.joinedAt.toISOString(),
    confirmedAt: p.confirmedAt ? p.confirmedAt.toISOString() : null,
  }
}

export function serializeEventDetail(
  detail: RepoEventDetail,
  counts: ParticipantCounts,
  participants: ParticipantWithUser[],
  viewerParticipation: ParticipantRow | null,
): ApiEventDetailEnvelope {
  return {
    event: serializeEventSummary(detail, counts, viewerParticipation),
    participants: participants.map(serializeEventParticipant),
    iAmIn: toViewerParticipation(viewerParticipation),
    hostInfo: {
      id: detail.host.id,
      name: detail.host.displayName,
      avatarUrl: detail.host.avatarUrl,
    },
    address: detail.address
      ? {
          cep: detail.address.cep,
          logradouro: detail.address.logradouro,
          numero: detail.address.numero,
          complemento: detail.address.complemento ?? null,
          bairro: detail.address.bairro,
          cidade: detail.address.cidade,
          estado: detail.address.estado,
        }
      : null,
    onlineDetails: detail.online
      ? {
          meetingUrl: detail.online.meetingUrl,
          extraDetails: detail.online.extraDetails ?? null,
        }
      : null,
  }
}

/**
 * Para listagens (`GET /events`, `/me/hosted`, `/me/attending`) o repo entrega
 * apenas EventRow (sem joins de host/address). O controller carrega em batch a
 * participação do viewer e os contadores agregados (via
 * ParticipantsRepository.countByEvents) e os passa aqui para que cada card já
 * chegue ao frontend com `iAmIn` e contagens corretas.
 */
export function serializeEventRowAsSummary(
  row: EventRow,
  counts: ParticipantCounts = zeroCounts(),
  viewerParticipation: ParticipantRow | null = null,
): ApiEventSummary {
  return {
    id: row.id,
    hostUserId: row.hostUserId,
    hostName: '',
    hostAvatarUrl: null,
    name: row.name,
    description: row.description,
    coverUrl: row.coverUrl,
    startsAt: row.startsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    endsAt: row.endsAt.toISOString(),
    type: row.type,
    visibility: row.visibility,
    capacity: row.capacity,
    status: row.status,
    cancellationReason: row.cancellationReason,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    participantCount: counts.subscribed + counts.confirmed,
    confirmedCount: counts.confirmed,
    waitlistCount: counts.waitlist,
    cidade: null,
    iAmIn: toViewerParticipation(viewerParticipation),
  }
}
