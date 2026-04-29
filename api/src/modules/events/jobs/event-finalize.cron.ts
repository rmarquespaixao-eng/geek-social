import type { EventsService } from '../events.service.js'

export type EventFinalizeDeps = {
  eventsService: EventsService
}

/**
 * Job — atualiza eventos `status='scheduled' AND ends_at < now()`
 * para `status='ended'`. Roda a cada hora (configurado em app.ts).
 */
export async function runEventFinalize(deps: EventFinalizeDeps): Promise<void> {
  await deps.eventsService.finalizePastEvents()
}
