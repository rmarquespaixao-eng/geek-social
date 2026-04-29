/**
 * Erros do módulo de eventos ("Rolê").
 *
 * Códigos seguem a tabela em `specs/2026-04-28-events-design.md` § 5.
 *
 *  - 403: NOT_HOST | NOT_INVITED | EVENT_CANCELLED
 *  - 404: EVENT_NOT_FOUND | PARTICIPATION_NOT_FOUND
 *  - 409: TIME_CONFLICT | ALREADY_SUBSCRIBED | EVENT_ALREADY_STARTED |
 *         INVALID_PARTICIPATION_STATE
 *  - 422: INVALID_DURATION | INVALID_CAPACITY |
 *         MISSING_ADDRESS_FOR_PRESENCIAL | MISSING_MEETING_URL_FOR_ONLINE |
 *         INVALID_COVER | UNSUPPORTED_MEDIA_FORMAT | MEDIA_TOO_LARGE |
 *         STORAGE_NOT_CONFIGURED
 *  - 503: STORAGE_UNAVAILABLE
 */
export class EventsError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code)
    this.name = 'EventsError'
  }
}
