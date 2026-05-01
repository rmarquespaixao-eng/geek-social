import { sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { EventsRepository, EventRow } from './events.repository.js'
import {
  activeFromCounts,
  zeroCounts,
  type ParticipantsRepository,
  type ParticipantRow,
  type ParticipantWithUser,
} from './participants.repository.js'
import type { InvitesRepository } from './invites.repository.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { NotificationsService } from '../notifications/notifications.service.js'
import { EventsError } from './events.errors.js'
import type { ListParticipantsQuery, ParticipantStatus } from './events.schema.js'

export type SubscribeResult = {
  status: 'subscribed' | 'waitlist'
  position?: number
  participation: ParticipantRow
}

const REMINDER_48H_THRESHOLD_MS = 48 * 60 * 60 * 1000

export class ParticipantsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly eventsRepo: EventsRepository,
    private readonly repo: ParticipantsRepository,
    private readonly invitesRepo: InvitesRepository,
    private readonly friendsRepo: IFriendsRepository,
    private readonly notificationsService: NotificationsService | null,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Visibility / pre-checks
  // ─────────────────────────────────────────────────────────────
  private async assertCanSubscribe(userId: string, ev: EventRow): Promise<void> {
    if (ev.status === 'cancelled') throw new EventsError('EVENT_CANCELLED')
    if (ev.status === 'ended') throw new EventsError('EVENT_ALREADY_STARTED')
    if (ev.startsAt.getTime() <= Date.now()) throw new EventsError('EVENT_ALREADY_STARTED')

    if (ev.hostUserId === userId) {
      // Host não pode se inscrever no próprio rolê
      throw new EventsError('ALREADY_SUBSCRIBED')
    }
    if (ev.visibility === 'public') return
    if (ev.visibility === 'friends') {
      const isFriend = await this.friendsRepo.areFriends(userId, ev.hostUserId)
      if (!isFriend) throw new EventsError('NOT_INVITED')
      return
    }
    if (ev.visibility === 'invite') {
      const invited = await this.invitesRepo.existsForUser(ev.id, userId)
      if (!invited) throw new EventsError('NOT_INVITED')
      return
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Subscribe
  // ─────────────────────────────────────────────────────────────
  async subscribe(userId: string, eventId: string): Promise<SubscribeResult> {
    const ev = await this.eventsRepo.findById(eventId)
    if (!ev) throw new EventsError('EVENT_NOT_FOUND')
    await this.assertCanSubscribe(userId, ev)
    const isBlocked = await this.friendsRepo.isBlockedEitherDirection(userId, ev.hostUserId)
    if (isBlocked) throw new EventsError('NOT_INVITED')

    return this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient

      const lockedRows = await exec.execute(sql`
        SELECT capacity FROM events WHERE id = ${eventId} FOR UPDATE
      `)
      const lockedRowsArr = (lockedRows as unknown as { rows?: { capacity: number | null }[] }).rows
        ?? (lockedRows as unknown as { capacity: number | null }[])
      const lockedEvent = Array.isArray(lockedRowsArr) ? lockedRowsArr[0] : undefined
      if (!lockedEvent) throw new EventsError('EVENT_NOT_FOUND')
      const capacity: number | null = lockedEvent.capacity ?? null

      // Conflito de horário verificado DENTRO da transação, após SELECT FOR UPDATE,
      // garantindo consistência com os dados bloqueados (Fix G2-04 / NA3-03).
      const overlaps = await this.repo.findUserActiveEventsInRange(
        userId,
        ev.startsAt,
        ev.endsAt,
        eventId,
        exec,
      )
      if (overlaps.length > 0) throw new EventsError('TIME_CONFLICT')

      const existing = await this.repo.findByEventAndUser(eventId, userId, exec)
      if (existing && existing.status !== 'left') {
        throw new EventsError('ALREADY_SUBSCRIBED')
      }

      const counts =
        (await this.repo.countByEvents([eventId], exec)).get(eventId) ?? zeroCounts()
      const hasCapacity = capacity == null || activeFromCounts(counts) < capacity

      let participation: ParticipantRow
      if (existing && existing.status === 'left') {
        // Reativa registro
        if (hasCapacity) {
          participation = await this.repo.setStatus(existing.id, 'subscribed', exec)
          await this.repo.setWaitlistPosition(existing.id, null, exec)
          return { status: 'subscribed' as const, participation }
        } else {
          const position = await this.repo.nextWaitlistPosition(eventId, exec)
          participation = await this.repo.setStatus(existing.id, 'waitlist', exec)
          await this.repo.setWaitlistPosition(existing.id, position, exec)
          return { status: 'waitlist' as const, position, participation: { ...participation, waitlistPosition: position } }
        }
      }

      try {
        if (hasCapacity) {
          participation = await this.repo.insert(
            { eventId, userId, status: 'subscribed', waitlistPosition: null },
            exec,
          )
          return { status: 'subscribed' as const, participation }
        } else {
          const position = await this.repo.nextWaitlistPosition(eventId, exec)
          participation = await this.repo.insert(
            { eventId, userId, status: 'waitlist', waitlistPosition: position },
            exec,
          )
          return { status: 'waitlist' as const, position, participation }
        }
      } catch (err: unknown) {
        // Fix G2-03: unique_violation do Postgres — race condition absorvida como erro de domínio
        if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
          throw new EventsError('ALREADY_SUBSCRIBED')
        }
        throw err
      }
    })
  }

  // ─────────────────────────────────────────────────────────────
  // Leave (com promoção de waitlist)
  // ─────────────────────────────────────────────────────────────
  async leave(userId: string, eventId: string): Promise<{ promoted: ParticipantRow | null }> {
    const ev = await this.eventsRepo.findById(eventId)
    if (!ev) throw new EventsError('EVENT_NOT_FOUND')

    const promoted = await this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient
      const part = await this.repo.findByEventAndUser(eventId, userId, exec)
      if (!part || part.status === 'left') {
        throw new EventsError('PARTICIPATION_NOT_FOUND')
      }

      const wasActive = part.status === 'subscribed' || part.status === 'confirmed'
      const wasWaitlist = part.status === 'waitlist'
      const previousPosition = part.waitlistPosition

      await this.repo.setStatus(part.id, 'left', exec)

      // Se era waitlist, decrementa posições subsequentes
      if (wasWaitlist && previousPosition != null) {
        await this.repo.shiftWaitlistPositions(eventId, previousPosition, exec)
        return null
      }

      // Se tinha vaga ativa E o evento tem capacidade, promove o primeiro waitlist
      if (wasActive && ev.capacity != null) {
        const next = await this.repo.findFirstWaitlist(eventId, exec)
        if (next) {
          const promotedRow = await this.repo.setStatus(next.id, 'subscribed', exec)
          if (next.waitlistPosition != null) {
            await this.repo.shiftWaitlistPositions(eventId, next.waitlistPosition, exec)
          }
          return promotedRow
        }
      }
      return null
    })

    // Notifica fora da transação
    if (promoted && this.notificationsService) {
      await this.notificationsService
        .notifySelf({
          userId: promoted.userId,
          type: 'event_promoted_from_waitlist',
          entityId: eventId,
        })
        .catch(() => {})

      // Se evento está dentro da janela T-48h, manda lembrete imediato
      const msUntil = ev.startsAt.getTime() - Date.now()
      if (msUntil > 0 && msUntil <= REMINDER_48H_THRESHOLD_MS) {
        await this.notificationsService
          .notifySelf({
            userId: promoted.userId,
            type: 'event_reminder_48h',
            entityId: eventId,
          })
          .catch(() => {})
      }
    }

    return { promoted }
  }

  // ─────────────────────────────────────────────────────────────
  // Confirm
  // ─────────────────────────────────────────────────────────────
  async confirm(userId: string, eventId: string): Promise<ParticipantRow> {
    const [part, ev] = await Promise.all([
      this.repo.findByEventAndUser(eventId, userId),
      this.eventsRepo.findById(eventId),
    ])
    if (!part) throw new EventsError('PARTICIPATION_NOT_FOUND')
    if (!ev) throw new EventsError('EVENT_NOT_FOUND')
    if (part.status === 'confirmed') return part
    if (part.status !== 'subscribed') throw new EventsError('INVALID_PARTICIPATION_STATE')

    // Fix NA3-04: revalida bloqueio host↔participante no momento do confirm
    const isBlocked = await this.friendsRepo.isBlockedEitherDirection(userId, ev.hostUserId)
    if (isBlocked) throw new EventsError('NOT_INVITED')

    return this.repo.setStatus(part.id, 'confirmed')
  }

  // ─────────────────────────────────────────────────────────────
  // Listing
  // ─────────────────────────────────────────────────────────────
  async listParticipants(
    viewerId: string,
    eventId: string,
    query: ListParticipantsQuery,
  ): Promise<{ participants: ParticipantWithUser[]; nextCursor: string | null }> {
    const ev = await this.eventsRepo.findById(eventId)
    if (!ev) throw new EventsError('EVENT_NOT_FOUND')
    // Visibilidade aplicada no service de eventos — aqui só permitimos se o user pode ver o evento
    if (ev.hostUserId !== viewerId) {
      if (ev.visibility === 'friends') {
        const isFriend = await this.friendsRepo.areFriends(viewerId, ev.hostUserId)
        if (!isFriend) throw new EventsError('NOT_INVITED')
      }
      if (ev.visibility === 'invite') {
        const invited = await this.invitesRepo.existsForUser(eventId, viewerId)
        if (!invited) throw new EventsError('NOT_INVITED')
      }
    }
    const status: ParticipantStatus | undefined = query.status
    const list = await this.repo.listByEvent(eventId, status, query.limit)

    // Filtra participantes privados para viewers que não são host
    if (ev.hostUserId !== viewerId) {
      for (const p of list) {
        // Se o participante é privado, o viewer não é amigo dele, e não é o próprio participante
        // anonimiza os dados
        if (p.user) {
          const isPrivate = p.user.privacy === 'private'
          const isOwnUser = p.user.id === viewerId
          if (isPrivate && !isOwnUser) {
            const isFriend = await this.friendsRepo.areFriends(viewerId, p.user.id)
            if (!isFriend) {
              p.user.displayName = 'Usuário'
              p.user.avatarUrl = null
            }
          }
        }
      }
    }

    return { participants: list, nextCursor: null }
  }
}
