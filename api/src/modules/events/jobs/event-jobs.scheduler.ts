import type { IJobsQueue } from '../../../shared/contracts/jobs-queue.contract.js'

export type EventReminderPayload = {
  eventId: string
}

const REMINDER_48H_OFFSET_SECONDS = 48 * 60 * 60
const REMINDER_2H_OFFSET_SECONDS = 2 * 60 * 60

function secondsUntil(target: Date): number {
  return Math.floor((target.getTime() - Date.now()) / 1000)
}

/**
 * Helpers para enfileirar e cancelar jobs de lembrete de eventos.
 *
 * Estratégia: agendamos os jobs no momento de criação do evento e
 * re-agendamos no momento de uma edição (cancela antigos + reenfileira).
 * O worker faz o fanout para os participantes ativos no momento do disparo.
 */
export class EventJobsScheduler {
  constructor(private jobs: IJobsQueue | null) {}

  /** Permite injetar a fila depois da construção (jobs só existem quando JOBS_DATABASE_URL está set). */
  setQueue(jobs: IJobsQueue): void {
    this.jobs = jobs
  }

  /** Enfileira ambos os lembretes para um evento, respeitando proximidade temporal. */
  async scheduleReminders(eventId: string, startsAt: Date): Promise<void> {
    if (!this.jobs) return

    // T-48h
    const fire48 = new Date(startsAt.getTime() - REMINDER_48H_OFFSET_SECONDS * 1000)
    if (fire48.getTime() > Date.now()) {
      const startAfter = secondsUntil(fire48)
      await this.jobs.enqueue<EventReminderPayload>(
        'event.reminder_48h',
        { eventId },
        { startAfterSeconds: Math.max(0, startAfter) },
      )
    } else if (startsAt.getTime() > Date.now()) {
      // Janela de 48h já dentro — dispara imediatamente
      await this.jobs.enqueue<EventReminderPayload>(
        'event.reminder_48h',
        { eventId },
        { startAfterSeconds: 0 },
      )
    }

    // T-2h
    const fire2 = new Date(startsAt.getTime() - REMINDER_2H_OFFSET_SECONDS * 1000)
    if (fire2.getTime() > Date.now()) {
      const startAfter = secondsUntil(fire2)
      await this.jobs.enqueue<EventReminderPayload>(
        'event.reminder_2h',
        { eventId },
        { startAfterSeconds: Math.max(0, startAfter) },
      )
    }
  }

  /** Cancela TODOS os jobs pendentes de lembrete para um evento. */
  async cancelRemindersForEvent(eventId: string): Promise<void> {
    if (!this.jobs) return
    await this.jobs.cancelEventJobs(eventId)
  }

  /** Atalho: cancela + reagenda. */
  async rescheduleReminders(eventId: string, startsAt: Date): Promise<void> {
    await this.cancelRemindersForEvent(eventId)
    await this.scheduleReminders(eventId, startsAt)
  }
}
