import type { FastifyRequest } from 'fastify'
import type { AdminAuditLogRepository, AdminAuditAction, RecordOptions, ListLogsFilters } from './audit-log.repository.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'
import type { PlatformRole } from '../../shared/middleware/require-role.js'

export class AdminAuditLogService {
  constructor(private readonly repo: AdminAuditLogRepository) {}

  /**
   * Registra uma ação administrativa enriquecendo com IP e papel do actor
   * a partir do request já autenticado.
   */
  async recordFromRequest(
    request: FastifyRequest,
    action: AdminAuditAction,
    opts: RecordOptions = {},
  ): Promise<void> {
    const claims = request.user as (AccessTokenClaims & { platformRole?: PlatformRole }) | undefined
    const actorId = claims?.userId ?? null
    const roleAtTime: PlatformRole = claims?.platformRole ?? 'user'
    const ip = request.ip

    await this.repo.record(action, actorId, roleAtTime, { ...opts, ip })
  }

  async list(filters: ListLogsFilters = {}) {
    return this.repo.list(filters)
  }
}
