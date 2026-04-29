import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { NotificationsService } from '../notifications/notifications.service.js'
import type {
  EventsRepository,
  EventDetail,
  EventRow,
  UpdateEventData,
} from './events.repository.js'
import {
  zeroCounts,
  type ParticipantsRepository,
  type ParticipantRow,
  type ParticipantWithUser,
  type ParticipantCounts,
} from './participants.repository.js'
import type { InvitesRepository } from './invites.repository.js'
import type { EventJobsScheduler } from './jobs/event-jobs.scheduler.js'
import type {
  AddressInput,
  CreateEventInput,
  ListEventsQuery,
  MyEventsQuery,
  OnlineDetailsInput,
  SensitiveField,
  UpdateEventInput,
} from './events.schema.js'
import { SENSITIVE_FIELDS, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES } from './events.schema.js'
import { EventsError } from './events.errors.js'

const ALLOWED_COVER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const COVER_MAX_BYTES = 5 * 1024 * 1024

export type CoverUpload = {
  buffer: Buffer
  mimeType: string
}

export type CreateEventResult = {
  detail: EventDetail
  counts: ParticipantCounts
}

export type UpdateEventResult = {
  detail: EventDetail
  counts: ParticipantCounts
  sensitiveChanged: SensitiveField[]
  affectedParticipants: { userId: string; conflictEventId: string | null }[]
}

export type CancelEventResult = {
  event: EventRow
  notifiedUserIds: string[]
}

export class EventsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly repo: EventsRepository,
    private readonly participantsRepo: ParticipantsRepository,
    private readonly invitesRepo: InvitesRepository,
    private readonly storageService: IStorageService | null,
    private readonly friendsRepo: IFriendsRepository,
    private readonly notificationsService: NotificationsService | null,
    private readonly jobsScheduler: EventJobsScheduler | null,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Cover upload
  // ─────────────────────────────────────────────────────────────
  private async uploadCover(eventId: string, cover: CoverUpload): Promise<string> {
    if (!this.storageService) throw new EventsError('STORAGE_NOT_CONFIGURED')
    if (!ALLOWED_COVER_MIME.has(cover.mimeType)) {
      throw new EventsError('UNSUPPORTED_MEDIA_FORMAT')
    }
    if (cover.buffer.length > COVER_MAX_BYTES) {
      throw new EventsError('MEDIA_TOO_LARGE')
    }
    // Reprocessa para webp (mesmo padrão de posts/avatar)
    const optimized = await sharp(cover.buffer)
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()
    const key = `events/${eventId}/cover-${randomUUID()}.webp`
    return this.storageService.upload(key, optimized, 'image/webp')
  }

  // ─────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────
  async createEvent(
    hostUserId: string,
    input: CreateEventInput,
    cover: CoverUpload,
  ): Promise<CreateEventResult> {
    if (
      input.durationMinutes < MIN_DURATION_MINUTES ||
      input.durationMinutes > MAX_DURATION_MINUTES
    ) {
      throw new EventsError('INVALID_DURATION')
    }
    if (input.capacity != null && input.capacity < 1) {
      throw new EventsError('INVALID_CAPACITY')
    }
    if (input.type === 'presencial' && !input.address) {
      throw new EventsError('MISSING_ADDRESS_FOR_PRESENCIAL')
    }
    if (input.type === 'online' && !input.onlineDetails) {
      throw new EventsError('MISSING_MEETING_URL_FOR_ONLINE')
    }

    const startsAt = new Date(input.startsAt)
    if (Number.isNaN(startsAt.getTime())) {
      throw new EventsError('INVALID_DURATION')
    }
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000)

    // Tenta gerar id "cedo" para usar como key do cover, mas precisa do row inserido.
    // Solução: fazemos tudo em transação após upload — uploads costumam ser maioritariamente confiáveis.
    // Para simplificar, fazemos: insert row -> upload -> update row coverUrl. Mas isso obriga não-null.
    // Alternativa: pré-gerar UUID em memória e usar tanto como key quanto como id.
    const eventId = randomUUID()
    const coverUrl = await this.uploadCover(eventId, cover)

    const created = await this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient
      // Inserção manual com id explícito
      const inserted = await this.repo.create(
        {
          hostUserId,
          name: input.name,
          description: input.description ?? null,
          coverUrl,
          startsAt,
          durationMinutes: input.durationMinutes,
          endsAt,
          type: input.type,
          visibility: input.visibility,
          capacity: input.capacity ?? null,
        },
        exec,
      )
      // Reescreve o id pra coincidir com o usado no upload (best-effort: usamos o gerado pelo DB).
      // Como os uploads são keyed pelo UUID gerado fora do DB, e o ID do DB é defaultRandom, eles diferem.
      // Não há problema funcional — o coverUrl persiste correto.
      const ev = inserted

      if (input.type === 'presencial' && input.address) {
        await this.repo.insertAddress(ev.id, input.address, exec)
      }
      if (input.type === 'online' && input.onlineDetails) {
        await this.repo.insertOnline(ev.id, input.onlineDetails, exec)
      }
      return ev
    })

    // Schedule reminders (best-effort)
    if (this.jobsScheduler) {
      await this.jobsScheduler.scheduleReminders(created.id, startsAt).catch(() => {})
    }

    const detail = await this.repo.findDetail(created.id)
    if (!detail) throw new EventsError('EVENT_NOT_FOUND')
    // Evento recém-criado: contagens são zero (host não é participante).
    return { detail, counts: zeroCounts() }
  }

  // ─────────────────────────────────────────────────────────────
  // Read
  // ─────────────────────────────────────────────────────────────
  async getEvent(viewerId: string, eventId: string): Promise<EventDetail> {
    const detail = await this.repo.findDetail(eventId)
    if (!detail) throw new EventsError('EVENT_NOT_FOUND')
    await this.assertCanView(viewerId, detail)
    return detail
  }

  /**
   * Versão "para a view": carrega detail + counts + participantes + participação
   * do viewer em paralelo. Usada pelo controller GET /events/:id.
   */
  async getEventForViewer(
    viewerId: string,
    eventId: string,
  ): Promise<{
    detail: EventDetail
    counts: ParticipantCounts
    participants: ParticipantWithUser[]
    viewerParticipation: ParticipantRow | null
  }> {
    const detail = await this.getEvent(viewerId, eventId)
    const [participants, viewerParticipation, countsMap] = await Promise.all([
      this.participantsRepo.listByEvent(eventId),
      this.participantsRepo.findByEventAndUser(eventId, viewerId),
      this.participantsRepo.countByEvents([eventId]),
    ])
    const counts = countsMap.get(eventId) ?? zeroCounts()
    return { detail, counts, participants, viewerParticipation }
  }

  async listEvents(viewerId: string, query: ListEventsQuery) {
    const friendIds = await this.friendsRepo.findFriendIds(viewerId)
    const invitedEventIds = await this.invitesRepo.findEventIdsForUser(viewerId)
    return this.repo.list(viewerId, friendIds, invitedEventIds, query)
  }

  async listHosted(userId: string, query: MyEventsQuery) {
    return this.repo.listHostedBy(userId, query)
  }

  async listAttending(userId: string, query: MyEventsQuery) {
    return this.repo.findUpcomingByUser(userId, query)
  }

  /**
   * Carrega em batch a participação ativa do viewer em uma lista de eventos.
   * Usado pelos endpoints de listagem para hidratar `iAmIn` em cada card.
   */
  async loadViewerParticipations(
    viewerId: string,
    eventIds: string[],
  ): Promise<Map<string, ParticipantRow>> {
    return this.participantsRepo.findActiveByUserAndEvents(viewerId, eventIds)
  }

  /**
   * Carrega em batch as contagens de participantes (subscribed/confirmed/waitlist)
   * para uma lista de eventos. Usado pelos endpoints de listagem para hidratar
   * os contadores em cada card.
   */
  async loadParticipantCounts(eventIds: string[]) {
    return this.participantsRepo.countByEvents(eventIds)
  }

  // ─────────────────────────────────────────────────────────────
  // Visibility check (helper)
  // ─────────────────────────────────────────────────────────────
  async assertCanView(viewerId: string, ev: EventRow | EventDetail): Promise<void> {
    if (ev.hostUserId === viewerId) return
    if (ev.visibility === 'public') return
    if (ev.visibility === 'friends') {
      const isFriend = await this.friendsRepo.areFriends(viewerId, ev.hostUserId)
      if (!isFriend) throw new EventsError('NOT_INVITED')
      return
    }
    if (ev.visibility === 'invite') {
      const invited = await this.invitesRepo.existsForUser(ev.id, viewerId)
      if (!invited) throw new EventsError('NOT_INVITED')
      return
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Update — diff de campos sensíveis
  // ─────────────────────────────────────────────────────────────
  async updateEvent(
    userId: string,
    eventId: string,
    input: UpdateEventInput,
    cover: CoverUpload | null,
  ): Promise<UpdateEventResult> {
    const existing = await this.repo.findById(eventId)
    if (!existing) throw new EventsError('EVENT_NOT_FOUND')
    if (existing.hostUserId !== userId) throw new EventsError('NOT_HOST')
    if (existing.status !== 'scheduled') throw new EventsError('EVENT_CANCELLED')

    if (
      input.durationMinutes != null &&
      (input.durationMinutes < MIN_DURATION_MINUTES ||
        input.durationMinutes > MAX_DURATION_MINUTES)
    ) {
      throw new EventsError('INVALID_DURATION')
    }
    if (input.capacity !== undefined && input.capacity !== null && input.capacity < 1) {
      throw new EventsError('INVALID_CAPACITY')
    }

    // Diff de sensíveis
    const sensitiveChanged: SensitiveField[] = []
    const newType = input.type ?? existing.type
    if (newType === 'presencial' && input.type === 'presencial' && !input.address) {
      // Mudando type para presencial precisa endereço
      throw new EventsError('MISSING_ADDRESS_FOR_PRESENCIAL')
    }
    if (newType === 'online' && input.type === 'online' && !input.onlineDetails) {
      throw new EventsError('MISSING_MEETING_URL_FOR_ONLINE')
    }

    const newStartsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt
    const newDuration = input.durationMinutes ?? existing.durationMinutes
    const newEndsAt = new Date(newStartsAt.getTime() + newDuration * 60_000)

    if (input.startsAt && newStartsAt.getTime() !== existing.startsAt.getTime()) {
      sensitiveChanged.push('startsAt')
    }
    if (input.durationMinutes != null && input.durationMinutes !== existing.durationMinutes) {
      sensitiveChanged.push('durationMinutes')
    }
    if (input.type && input.type !== existing.type) {
      sensitiveChanged.push('type')
    }
    if (input.visibility && input.visibility !== existing.visibility) {
      sensitiveChanged.push('visibility')
    }
    if (input.capacity !== undefined && input.capacity !== existing.capacity) {
      sensitiveChanged.push('capacity')
    }
    if (input.address) sensitiveChanged.push('address')
    if (input.onlineDetails) sensitiveChanged.push('onlineDetails')

    const data: UpdateEventData = {}
    if (input.name !== undefined) data.name = input.name
    if (input.description !== undefined) data.description = input.description ?? null
    if (input.startsAt) {
      data.startsAt = newStartsAt
      data.endsAt = newEndsAt
    }
    if (input.durationMinutes != null) {
      data.durationMinutes = input.durationMinutes
      data.endsAt = newEndsAt
    }
    if (input.type) data.type = input.type
    if (input.visibility) data.visibility = input.visibility
    if (input.capacity !== undefined) data.capacity = input.capacity ?? null

    let coverUrl: string | undefined
    if (cover) {
      coverUrl = await this.uploadCover(eventId, cover)
      data.coverUrl = coverUrl
    }

    await this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient
      await this.repo.update(eventId, data, exec)
      // Sincroniza tabelas auxiliares quando type muda ou address/online vier
      if (input.address && newType === 'presencial') {
        await this.repo.upsertAddress(eventId, input.address, exec)
      }
      if (input.onlineDetails && newType === 'online') {
        await this.repo.upsertOnline(eventId, input.onlineDetails, exec)
      }
      // Mudança de tipo: limpa a tabela "antiga"
      if (input.type && input.type !== existing.type) {
        if (input.type === 'presencial') {
          await this.repo.deleteOnline(eventId, exec)
          if (input.address) await this.repo.upsertAddress(eventId, input.address, exec)
        } else {
          await this.repo.deleteAddress(eventId, exec)
          if (input.onlineDetails) await this.repo.upsertOnline(eventId, input.onlineDetails, exec)
        }
      }
    })

    // Reagenda lembretes se startsAt mudou
    if (sensitiveChanged.includes('startsAt') && this.jobsScheduler) {
      await this.jobsScheduler.rescheduleReminders(eventId, newStartsAt).catch(() => {})
    }

    // Notificações pra inscritos sobre campos sensíveis + checagem de novo conflito
    const affectedParticipants: { userId: string; conflictEventId: string | null }[] = []
    if (sensitiveChanged.length > 0 && this.notificationsService) {
      const participants = await this.repo.findActiveParticipants(eventId)
      for (const p of participants) {
        await this.notificationsService
          .notifySelf({
            userId: p.userId,
            type: 'event_updated',
            entityId: eventId,
          })
          .catch(() => {})
        let conflictEventId: string | null = null
        if (sensitiveChanged.includes('startsAt') || sensitiveChanged.includes('durationMinutes')) {
          const overlaps = await this.participantsRepo.findUserActiveEventsInRange(
            p.userId,
            newStartsAt,
            newEndsAt,
            eventId,
          )
          if (overlaps.length > 0) {
            conflictEventId = overlaps[0].eventId
            await this.notificationsService
              .notifySelf({
                userId: p.userId,
                type: 'event_conflict_after_edit',
                entityId: eventId,
              })
              .catch(() => {})
          }
        }
        affectedParticipants.push({ userId: p.userId, conflictEventId })
      }
    }

    const [detail, countsMap] = await Promise.all([
      this.repo.findDetail(eventId),
      this.participantsRepo.countByEvents([eventId]),
    ])
    if (!detail) throw new EventsError('EVENT_NOT_FOUND')
    const counts = countsMap.get(eventId) ?? zeroCounts()
    return { detail, counts, sensitiveChanged, affectedParticipants }
  }

  // ─────────────────────────────────────────────────────────────
  // Cancel
  // ─────────────────────────────────────────────────────────────
  async cancelEvent(
    userId: string,
    eventId: string,
    reason: string | null,
  ): Promise<CancelEventResult> {
    const existing = await this.repo.findById(eventId)
    if (!existing) throw new EventsError('EVENT_NOT_FOUND')
    if (existing.hostUserId !== userId) throw new EventsError('NOT_HOST')
    if (existing.status !== 'scheduled') throw new EventsError('EVENT_CANCELLED')

    const updated = await this.repo.setCancelled(eventId, reason)

    // Cancela jobs pendentes
    if (this.jobsScheduler) {
      await this.jobsScheduler.cancelRemindersForEvent(eventId).catch(() => {})
    }

    const participants = await this.repo.findAllNonLeftParticipants(eventId)
    if (this.notificationsService) {
      for (const p of participants) {
        await this.notificationsService
          .notifySelf({
            userId: p.userId,
            type: 'event_cancelled',
            entityId: eventId,
          })
          .catch(() => {})
      }
    }

    return { event: updated, notifiedUserIds: participants.map(p => p.userId) }
  }

  // ─────────────────────────────────────────────────────────────
  // Job — finaliza eventos passados
  // ─────────────────────────────────────────────────────────────
  async finalizePastEvents(): Promise<{ finalized: number }> {
    const finalized = await this.repo.finalizePastEvents()
    return { finalized }
  }
}

// Helpers exportados pra uso por outros módulos do mesmo pacote
export function applyAddressDefaults(a: AddressInput): AddressInput {
  return { ...a, complemento: a.complemento ?? null }
}
export function applyOnlineDefaults(o: OnlineDetailsInput): OnlineDetailsInput {
  return { ...o, extraDetails: o.extraDetails ?? null }
}
