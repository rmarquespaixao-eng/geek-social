import { and, desc, eq, gte, lte, lt, or, sql, inArray } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import {
  events,
  eventAddresses,
  eventOnlineDetails,
  eventParticipants,
  users,
} from '../../shared/infra/database/schema.js'
import type {
  AddressInput,
  EventStatus,
  EventType,
  EventVisibility,
  ListEventsQuery,
  MyEventsQuery,
  OnlineDetailsInput,
  ParticipantStatus,
} from './events.schema.js'

export type EventRow = {
  id: string
  hostUserId: string
  name: string
  description: string | null
  coverUrl: string
  startsAt: Date
  durationMinutes: number
  endsAt: Date
  type: EventType
  visibility: EventVisibility
  capacity: number | null
  status: EventStatus
  cancellationReason: string | null
  cancelledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type EventAddressRow = AddressInput & { eventId: string }
export type EventOnlineRow = OnlineDetailsInput & { eventId: string }

export type EventDetail = EventRow & {
  address: EventAddressRow | null
  online: EventOnlineRow | null
  host: { id: string; displayName: string; avatarUrl: string | null }
}

export type CreateEventData = {
  hostUserId: string
  name: string
  description: string | null
  coverUrl: string
  startsAt: Date
  durationMinutes: number
  endsAt: Date
  type: EventType
  visibility: EventVisibility
  capacity: number | null
}

export type UpdateEventData = Partial<{
  name: string
  description: string | null
  coverUrl: string
  startsAt: Date
  durationMinutes: number
  endsAt: Date
  type: EventType
  visibility: EventVisibility
  capacity: number | null
}>

type EventCursor = { startsAt: Date; id: string }

function encodeCursor(c: EventCursor): string {
  return Buffer.from(JSON.stringify({ s: c.startsAt.toISOString(), i: c.id })).toString('base64url')
}

function decodeCursor(token: string | undefined): EventCursor | null {
  if (!token) return null
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8')
    const parsed = JSON.parse(raw) as { s: string; i: string }
    return { startsAt: new Date(parsed.s), id: parsed.i }
  } catch (err) {
    console.error({ err }, 'events: invalid cursor token')
    return null
  }
}

export class EventsRepository {
  constructor(private readonly db: DatabaseClient) {}

  /** Inserts the event row only. Address/online detail rows são inseridos por `insertAddress`/`insertOnline`. */
  async create(data: CreateEventData, tx?: DatabaseClient): Promise<EventRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .insert(events)
      .values({
        hostUserId: data.hostUserId,
        name: data.name,
        description: data.description,
        coverUrl: data.coverUrl,
        startsAt: data.startsAt,
        durationMinutes: data.durationMinutes,
        endsAt: data.endsAt,
        type: data.type,
        visibility: data.visibility,
        capacity: data.capacity,
      })
      .returning()
    return row as EventRow
  }

  async insertAddress(eventId: string, address: AddressInput, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec.insert(eventAddresses).values({
      eventId,
      cep: address.cep,
      logradouro: address.logradouro,
      numero: address.numero,
      complemento: address.complemento ?? null,
      bairro: address.bairro,
      cidade: address.cidade,
      estado: address.estado,
    })
  }

  async deleteAddress(eventId: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec.delete(eventAddresses).where(eq(eventAddresses.eventId, eventId))
  }

  async upsertAddress(eventId: string, address: AddressInput, tx?: DatabaseClient): Promise<void> {
    await this.deleteAddress(eventId, tx)
    await this.insertAddress(eventId, address, tx)
  }

  async insertOnline(eventId: string, online: OnlineDetailsInput, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec.insert(eventOnlineDetails).values({
      eventId,
      meetingUrl: online.meetingUrl,
      extraDetails: online.extraDetails ?? null,
    })
  }

  async deleteOnline(eventId: string, tx?: DatabaseClient): Promise<void> {
    const exec = tx ?? this.db
    await exec.delete(eventOnlineDetails).where(eq(eventOnlineDetails.eventId, eventId))
  }

  async upsertOnline(eventId: string, online: OnlineDetailsInput, tx?: DatabaseClient): Promise<void> {
    await this.deleteOnline(eventId, tx)
    await this.insertOnline(eventId, online, tx)
  }

  async findById(id: string, tx?: DatabaseClient): Promise<EventRow | null> {
    const exec = tx ?? this.db
    const [row] = await exec.select().from(events).where(eq(events.id, id)).limit(1)
    return (row as EventRow | undefined) ?? null
  }

  async findAddress(eventId: string): Promise<EventAddressRow | null> {
    const [row] = await this.db
      .select()
      .from(eventAddresses)
      .where(eq(eventAddresses.eventId, eventId))
      .limit(1)
    if (!row) return null
    return {
      eventId: row.eventId,
      cep: row.cep,
      logradouro: row.logradouro,
      numero: row.numero,
      complemento: row.complemento ?? null,
      bairro: row.bairro,
      cidade: row.cidade,
      estado: row.estado,
    }
  }

  async findOnline(eventId: string): Promise<EventOnlineRow | null> {
    const [row] = await this.db
      .select()
      .from(eventOnlineDetails)
      .where(eq(eventOnlineDetails.eventId, eventId))
      .limit(1)
    if (!row) return null
    return {
      eventId: row.eventId,
      meetingUrl: row.meetingUrl,
      extraDetails: row.extraDetails ?? null,
    }
  }

  async findDetail(id: string): Promise<EventDetail | null> {
    const ev = await this.findById(id)
    if (!ev) return null
    const address = ev.type === 'presencial' ? await this.findAddress(id) : null
    const online = ev.type === 'online' ? await this.findOnline(id) : null
    const [hostRow] = await this.db
      .select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, ev.hostUserId))
      .limit(1)

    if (!hostRow) {
      console.warn({ eventId: id, hostUserId: ev.hostUserId }, 'events: host user not found — orphaned FK')
    }
    return {
      ...ev,
      address,
      online,
      host: hostRow ?? { id: ev.hostUserId, displayName: 'Usuário', avatarUrl: null },
    }
  }

  async update(id: string, data: UpdateEventData, tx?: DatabaseClient): Promise<EventRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .update(events)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
        ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
        ...(data.durationMinutes !== undefined && { durationMinutes: data.durationMinutes }),
        ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.visibility !== undefined && { visibility: data.visibility }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning()
    return row as EventRow
  }

  async setCancelled(id: string, reason: string | null): Promise<EventRow> {
    const [row] = await this.db
      .update(events)
      .set({
        status: 'cancelled',
        cancellationReason: reason,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning()
    return row as EventRow
  }

  /**
   * Hard delete do evento. Cascade limpa `event_addresses`, `event_online_details`,
   * `event_participants` e `event_invites` automaticamente (ver schema FKs).
   * Notifications referenciando este event_id ficam órfãs (entityId é varchar
   * sem FK) — frontend deve tolerar evento ausente ao renderizar a notificação.
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(events).where(eq(events.id, id))
  }

  /** Finaliza eventos com `status='scheduled' AND ends_at < now()`. */
  async finalizePastEvents(): Promise<number> {
    const rows = await this.db
      .update(events)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(and(eq(events.status, 'scheduled'), lt(events.endsAt, sql`now()`)))
      .returning({ id: events.id })
    return rows.length
  }

  // ── Listing ───────────────────────────────────────────────────────
  async list(
    viewerId: string,
    friendIds: string[],
    invitedEventIds: string[],
    query: ListEventsQuery,
  ): Promise<{ events: EventRow[]; nextCursor: string | null }> {
    const conditions = []

    // Visibilidade: public + friends_of_friend + invited (matched by id)
    const visibilityClauses = [eq(events.visibility, 'public' as EventVisibility)]
    if (friendIds.length > 0) {
      visibilityClauses.push(
        and(eq(events.visibility, 'friends' as EventVisibility), inArray(events.hostUserId, friendIds))!,
      )
    }
    if (invitedEventIds.length > 0) {
      visibilityClauses.push(
        and(eq(events.visibility, 'invite' as EventVisibility), inArray(events.id, invitedEventIds))!,
      )
    }
    // Sempre permite ver os próprios eventos
    visibilityClauses.push(eq(events.hostUserId, viewerId))

    if (query.visibility) {
      conditions.push(eq(events.visibility, query.visibility))
    } else {
      conditions.push(or(...visibilityClauses)!)
    }

    if (query.from) conditions.push(gte(events.startsAt, query.from))
    if (query.to) conditions.push(lte(events.startsAt, query.to))
    if (query.type) conditions.push(eq(events.type, query.type))

    // Cidade só faz sentido para presencial — INNER JOIN restringe naturalmente
    const cursor = decodeCursor(query.cursor)
    if (cursor) {
      conditions.push(
        or(
          sql`${events.startsAt} > ${cursor.startsAt}`,
          and(eq(events.startsAt, cursor.startsAt), sql`${events.id} > ${cursor.id}`),
        )!,
      )
    }

    let rows: EventRow[]
    if (query.cidade) {
      const result = await this.db
        .select()
        .from(events)
        .innerJoin(eventAddresses, eq(eventAddresses.eventId, events.id))
        .where(and(...conditions, eq(eventAddresses.cidade, query.cidade)))
        .orderBy(events.startsAt, events.id)
        .limit(query.limit + 1)
      rows = result.map(r => r.events as EventRow)
    } else {
      const result = await this.db
        .select()
        .from(events)
        .where(and(...conditions))
        .orderBy(events.startsAt, events.id)
        .limit(query.limit + 1)
      rows = result as EventRow[]
    }

    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor({ startsAt: last.startsAt, id: last.id }) : null
    return { events: page, nextCursor }
  }

  async listHostedBy(
    hostUserId: string,
    query: MyEventsQuery,
  ): Promise<{ events: EventRow[]; nextCursor: string | null }> {
    const conditions = [eq(events.hostUserId, hostUserId)]
    if (query.status) conditions.push(eq(events.status, query.status))
    if (query.from) conditions.push(gte(events.startsAt, query.from))
    const cursor = decodeCursor(query.cursor)
    if (cursor) {
      conditions.push(
        or(
          sql`${events.startsAt} > ${cursor.startsAt}`,
          and(eq(events.startsAt, cursor.startsAt), sql`${events.id} > ${cursor.id}`),
        )!,
      )
    }
    const rows = (await this.db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(events.startsAt, events.id)
      .limit(query.limit + 1)) as EventRow[]

    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor({ startsAt: last.startsAt, id: last.id }) : null
    return { events: page, nextCursor }
  }

  async findUpcomingByUser(
    userId: string,
    query: MyEventsQuery,
  ): Promise<{ events: EventRow[]; nextCursor: string | null }> {
    const conditions = [
      eq(eventParticipants.userId, userId),
      inArray(eventParticipants.status, ['subscribed', 'confirmed'] as ParticipantStatus[]),
    ]
    if (query.status) conditions.push(eq(events.status, query.status))
    if (query.from) conditions.push(gte(events.startsAt, query.from))
    const cursor = decodeCursor(query.cursor)
    if (cursor) {
      conditions.push(
        or(
          sql`${events.startsAt} > ${cursor.startsAt}`,
          and(eq(events.startsAt, cursor.startsAt), sql`${events.id} > ${cursor.id}`),
        )!,
      )
    }

    const result = await this.db
      .select()
      .from(events)
      .innerJoin(eventParticipants, eq(eventParticipants.eventId, events.id))
      .where(and(...conditions))
      .orderBy(events.startsAt, events.id)
      .limit(query.limit + 1)

    const rows = result.map(r => r.events as EventRow)
    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor({ startsAt: last.startsAt, id: last.id }) : null
    return { events: page, nextCursor }
  }

  /** Lista todos os participantes ativos de um evento (para fanout em jobs). */
  async findActiveParticipants(eventId: string): Promise<{ userId: string; status: ParticipantStatus }[]> {
    const rows = await this.db
      .select({
        userId: eventParticipants.userId,
        status: eventParticipants.status,
      })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          inArray(eventParticipants.status, ['subscribed', 'confirmed'] as ParticipantStatus[]),
        ),
      )
    return rows.map(r => ({ userId: r.userId, status: r.status as ParticipantStatus }))
  }

  /** Lista todos os participantes (qualquer status exceto `left`) — usado em cancelamento. */
  async findAllNonLeftParticipants(eventId: string): Promise<{ userId: string }[]> {
    const rows = await this.db
      .select({ userId: eventParticipants.userId })
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.eventId, eventId),
          inArray(eventParticipants.status, ['subscribed', 'confirmed', 'waitlist'] as ParticipantStatus[]),
        ),
      )
    return rows
  }

  /** Eventos cujo intervalo se sobrepõe com [from, to). Útil para detectar conflitos. */
  async findOverlappingForUser(
    userId: string,
    from: Date,
    to: Date,
    excludeEventId?: string,
  ): Promise<{ eventId: string }[]> {
    const conds = [
      eq(eventParticipants.userId, userId),
      inArray(eventParticipants.status, ['subscribed', 'confirmed'] as ParticipantStatus[]),
      eq(events.status, 'scheduled' as EventStatus),
      sql`tstzrange(${events.startsAt}, ${events.endsAt}, '[)') && tstzrange(${from}, ${to}, '[)')`,
    ]
    if (excludeEventId) conds.push(sql`${events.id} <> ${excludeEventId}`)

    const rows = await this.db
      .select({ eventId: events.id })
      .from(eventParticipants)
      .innerJoin(events, eq(events.id, eventParticipants.eventId))
      .where(and(...conds))
    return rows
  }
}

export { decodeCursor as _decodeEventCursor, encodeCursor as _encodeEventCursor }
