import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { eventParticipants, events, users } from '../../shared/infra/database/schema.js'
import type { ParticipantStatus } from './events.schema.js'

export type ParticipantRow = {
  id: string
  eventId: string
  userId: string
  status: ParticipantStatus
  waitlistPosition: number | null
  joinedAt: Date
  confirmedAt: Date | null
  leftAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ParticipantWithUser = ParticipantRow & {
  user: { id: string; displayName: string; avatarUrl: string | null; privacy?: string }
}

/**
 * Contagem padronizada de participantes em um evento.
 * Fonte única: ParticipantsRepository.countByEvents.
 */
export type ParticipantCounts = {
  subscribed: number
  confirmed: number
  waitlist: number
}

export function zeroCounts(): ParticipantCounts {
  return { subscribed: 0, confirmed: 0, waitlist: 0 }
}

/** Vagas ocupadas (subscribed + confirmed) — usado em checagem de capacidade. */
export function activeFromCounts(c: ParticipantCounts): number {
  return c.subscribed + c.confirmed
}

export class ParticipantsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findByEventAndUser(
    eventId: string,
    userId: string,
    tx?: DatabaseClient,
  ): Promise<ParticipantRow | null> {
    const exec = tx ?? this.db
    const [row] = await exec
      .select()
      .from(eventParticipants)
      .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)))
      .limit(1)
    return (row as ParticipantRow | undefined) ?? null
  }

  async insert(
    data: {
      eventId: string
      userId: string
      status: ParticipantStatus
      waitlistPosition: number | null
    },
    tx?: DatabaseClient,
  ): Promise<ParticipantRow> {
    const exec = tx ?? this.db
    const [row] = await exec
      .insert(eventParticipants)
      .values({
        eventId: data.eventId,
        userId: data.userId,
        status: data.status,
        waitlistPosition: data.waitlistPosition,
      })
      .returning()
    return row as ParticipantRow
  }

  async setStatus(
    id: string,
    status: ParticipantStatus,
    tx?: DatabaseClient,
  ): Promise<ParticipantRow> {
    const exec = tx ?? this.db
    const patch: Record<string, unknown> = { status, updatedAt: new Date() }
    if (status === 'subscribed') patch.waitlistPosition = null
    if (status === 'confirmed') patch.confirmedAt = new Date()
    if (status === 'left') patch.leftAt = new Date()
    const [row] = await exec
      .update(eventParticipants)
      .set(patch)
      .where(eq(eventParticipants.id, id))
      .returning()
    return row as ParticipantRow
  }

  async setWaitlistPosition(
    id: string,
    position: number | null,
    tx?: DatabaseClient,
  ): Promise<void> {
    const exec = tx ?? this.db
    await exec
      .update(eventParticipants)
      .set({ waitlistPosition: position, updatedAt: new Date() })
      .where(eq(eventParticipants.id, id))
  }

  /** Próximo número de posição na waitlist. */
  async nextWaitlistPosition(eventId: string, tx?: DatabaseClient): Promise<number> {
    const exec = tx ?? this.db
    const rows = await exec
      .select({ m: sql<number | null>`max(${eventParticipants.waitlistPosition})` })
      .from(eventParticipants)
      .where(
        and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.status, 'waitlist')),
      )
    const max = rows[0]?.m ?? 0
    return (max ?? 0) + 1
  }

  /**
   * Encontra primeiro participante na waitlist (ORDER BY waitlist_position ASC).
   * Usa `FOR UPDATE SKIP LOCKED` para evitar dupla promoção em leaves concorrentes.
   */
  async findFirstWaitlist(
    eventId: string,
    tx?: DatabaseClient,
  ): Promise<ParticipantRow | null> {
    const exec = tx ?? this.db
    const result = await exec.execute(sql`
      SELECT id, event_id AS "eventId", user_id AS "userId",
             status, waitlist_position AS "waitlistPosition",
             joined_at AS "joinedAt", confirmed_at AS "confirmedAt",
             left_at AS "leftAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM event_participants
      WHERE event_id = ${eventId}
        AND status = 'waitlist'
      ORDER BY waitlist_position ASC NULLS LAST
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `)
    const rows = (result as unknown as { rows?: ParticipantRow[] }).rows ?? (result as unknown as ParticipantRow[])
    const row = Array.isArray(rows) ? rows[0] : undefined
    return (row as ParticipantRow | undefined) ?? null
  }

  /** Decrementa em 1 a posição de todos com waitlist_position > pivot. */
  async shiftWaitlistPositions(
    eventId: string,
    aboveOrEqual: number,
    tx?: DatabaseClient,
  ): Promise<void> {
    const exec = tx ?? this.db
    await exec.execute(sql`
      UPDATE event_participants
      SET waitlist_position = waitlist_position - 1,
          updated_at = now()
      WHERE event_id = ${eventId}
        AND status = 'waitlist'
        AND waitlist_position > ${aboveOrEqual}
    `)
  }

  /** Lista participantes com dados do usuário (para listagem da view). */
  async listByEvent(
    eventId: string,
    status?: ParticipantStatus,
    limit = 50,
  ): Promise<ParticipantWithUser[]> {
    const conds = [eq(eventParticipants.eventId, eventId)]
    if (status) conds.push(eq(eventParticipants.status, status))
    const rows = await this.db
      .select({
        id: eventParticipants.id,
        eventId: eventParticipants.eventId,
        userId: eventParticipants.userId,
        status: eventParticipants.status,
        waitlistPosition: eventParticipants.waitlistPosition,
        joinedAt: eventParticipants.joinedAt,
        confirmedAt: eventParticipants.confirmedAt,
        leftAt: eventParticipants.leftAt,
        createdAt: eventParticipants.createdAt,
        updatedAt: eventParticipants.updatedAt,
        userName: users.displayName,
        userAvatar: users.avatarUrl,
        userPrivacy: users.privacy,
      })
      .from(eventParticipants)
      .innerJoin(users, eq(users.id, eventParticipants.userId))
      .where(and(...conds))
      .orderBy(asc(eventParticipants.waitlistPosition), desc(eventParticipants.joinedAt))
      .limit(limit)

    return rows.map(r => ({
      id: r.id,
      eventId: r.eventId,
      userId: r.userId,
      status: r.status as ParticipantStatus,
      waitlistPosition: r.waitlistPosition,
      joinedAt: r.joinedAt,
      confirmedAt: r.confirmedAt,
      leftAt: r.leftAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: { id: r.userId, displayName: r.userName, avatarUrl: r.userAvatar ?? null, privacy: r.userPrivacy },
    }))
  }

  /**
   * Fonte única de contagem de participantes por evento. Retorna um Map por
   * eventId com { subscribed, confirmed, waitlist }. Eventos sem registro
   * não aparecem no map — o caller deve fazer fallback para zeros.
   *
   * Aceita tx opcional para uso dentro de transações (ex.: subscribe).
   */
  async countByEvents(
    eventIds: string[],
    tx?: DatabaseClient,
  ): Promise<Map<string, ParticipantCounts>> {
    const exec = tx ?? this.db
    const out = new Map<string, ParticipantCounts>()
    if (eventIds.length === 0) return out
    const rows = await exec
      .select({
        eventId: eventParticipants.eventId,
        status: eventParticipants.status,
        count: sql<number>`count(*)::int`,
      })
      .from(eventParticipants)
      .where(
        and(
          inArray(eventParticipants.eventId, eventIds),
          inArray(
            eventParticipants.status,
            ['subscribed', 'confirmed', 'waitlist'] as ParticipantStatus[],
          ),
        ),
      )
      .groupBy(eventParticipants.eventId, eventParticipants.status)

    for (const r of rows) {
      const entry = out.get(r.eventId) ?? zeroCounts()
      if (r.status === 'subscribed') entry.subscribed = r.count
      else if (r.status === 'confirmed') entry.confirmed = r.count
      else if (r.status === 'waitlist') entry.waitlist = r.count
      out.set(r.eventId, entry)
    }
    return out
  }

  /**
   * Carrega de uma vez a participação do viewer em vários eventos.
   * Retorna apenas registros não-left, mapeados por eventId.
   * Usado pelas listagens para preencher `iAmIn`.
   */
  async findActiveByUserAndEvents(
    userId: string,
    eventIds: string[],
  ): Promise<Map<string, ParticipantRow>> {
    if (eventIds.length === 0) return new Map()
    const rows = await this.db
      .select()
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.userId, userId),
          inArray(eventParticipants.eventId, eventIds),
          inArray(
            eventParticipants.status,
            ['subscribed', 'confirmed', 'waitlist'] as ParticipantStatus[],
          ),
        ),
      )
    const out = new Map<string, ParticipantRow>()
    for (const r of rows as ParticipantRow[]) out.set(r.eventId, r)
    return out
  }

  /** Verifica se o user está participando ativamente de um evento. */
  async findUserActiveEventsInRange(
    userId: string,
    from: Date,
    to: Date,
    excludeEventId?: string,
    tx?: DatabaseClient,
  ): Promise<{ eventId: string }[]> {
    const exec = tx ?? this.db
    const conds = [
      eq(eventParticipants.userId, userId),
      inArray(eventParticipants.status, ['subscribed', 'confirmed'] as ParticipantStatus[]),
      eq(events.status, 'scheduled'),
      sql`tstzrange(${events.startsAt}, ${events.endsAt}, '[)') && tstzrange(${from}, ${to}, '[)')`,
    ]
    if (excludeEventId) conds.push(sql`${events.id} <> ${excludeEventId}`)
    const rows = await exec
      .select({ eventId: events.id })
      .from(eventParticipants)
      .innerJoin(events, eq(events.id, eventParticipants.eventId))
      .where(and(...conds))
    return rows
  }
}
