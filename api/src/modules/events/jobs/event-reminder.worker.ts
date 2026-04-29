import type { EventsRepository } from '../events.repository.js'
import type { NotificationsService } from '../../notifications/notifications.service.js'
import type { EventReminderPayload } from './event-jobs.scheduler.js'

export type EventReminderWorkerDeps = {
  eventsRepo: EventsRepository
  notificationsService: NotificationsService
  /** 'event_reminder_48h' | 'event_reminder_2h' */
  notificationType: 'event_reminder_48h' | 'event_reminder_2h'
}

/**
 * Worker pg-boss para os jobs de lembrete (T-48h e T-2h).
 *
 * Busca participantes ativos (`subscribed`/`confirmed`) no momento do disparo
 * — assim é seguro mesmo após edições/promoções da waitlist depois do agendamento.
 *
 * Skip silencioso se o evento estiver `cancelled` ou `ended` (passou da janela).
 */
export function createEventReminderWorker(deps: EventReminderWorkerDeps) {
  return async (payload: EventReminderPayload): Promise<void> => {
    const event = await deps.eventsRepo.findById(payload.eventId)
    if (!event) return
    if (event.status !== 'scheduled') return

    const participants = await deps.eventsRepo.findActiveParticipants(payload.eventId)
    for (const p of participants) {
      // Notificação "do sistema" para o próprio user (host pode ser actor)
      await deps.notificationsService
        .notifySelf({
          userId: p.userId,
          type: deps.notificationType,
          entityId: payload.eventId,
        })
        .catch(() => {})
    }
  }
}
