/**
 * Erros do módulo de Comunidades.
 *
 * Códigos mapeados pelo controller (ver STATUS_BY_CODE em communities.controller.ts):
 *
 *  - 403: NOT_OWNER | NOT_MODERATOR | NOT_MEMBER | BANNED | COMMUNITY_DELETED
 *  - 404: COMMUNITY_NOT_FOUND | MEMBERSHIP_NOT_FOUND | INVITE_NOT_FOUND |
 *         JOIN_REQUEST_NOT_FOUND | POLL_NOT_FOUND | TOPIC_NOT_FOUND
 *  - 409: ALREADY_MEMBER | ALREADY_PENDING | ALREADY_BANNED | ALREADY_INVITED |
 *         OWNER_CANNOT_LEAVE | OWNER_CANNOT_BE_BANNED | TRANSFER_PENDING |
 *         INVALID_MEMBER_STATE | POLL_CLOSED | TOPIC_LOCKED
 *  - 422: INVALID_CATEGORY | INVALID_VISIBILITY | UNSUPPORTED_MEDIA_FORMAT |
 *         MEDIA_TOO_LARGE | INVALID_COVER | INVALID_ICON | INVALID_POLL_OPTIONS |
 *         INVALID_POLL_DURATION | STORAGE_NOT_CONFIGURED
 *  - 503: STORAGE_UNAVAILABLE
 */
export class CommunitiesError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message ?? code)
    this.name = 'CommunitiesError'
  }
}
