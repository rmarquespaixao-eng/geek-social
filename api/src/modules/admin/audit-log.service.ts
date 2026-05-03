import type { FastifyRequest } from 'fastify'
import type { AdminAuditLogRepository, AdminAuditAction, RecordOptions, ListLogsFilters } from './audit-log.repository.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'
import type { PlatformRole } from '../../shared/middleware/require-role.js'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'

// Chaves permitidas no campo metadata do audit log. Chaves fora desta lista são descartadas.
const METADATA_ALLOWLIST = new Set([
  'from', 'to', 'key', 'enabled', 'reason', 'targetId', 'action',
  'role', 'status', 'type', 'notes', 'provider', 'model',
])

function sanitizeMetadata(raw: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (METADATA_ALLOWLIST.has(k)) {
      sanitized[k] = v
    } else {
      console.warn(`[audit-log] Dropping unknown metadata key: ${k}`)
    }
  }
  return sanitized
}

export class AdminAuditLogService {
  constructor(private readonly repo: AdminAuditLogRepository) {}

  /**
   * Registra uma ação administrativa enriquecendo com IP e papel do actor
   * a partir do request já autenticado.
   * @param tx Transação opcional — use quando a mutação e o audit devem ser atômicos.
   */
  async recordFromRequest(
    request: FastifyRequest,
    action: AdminAuditAction,
    opts: RecordOptions = {},
    tx?: DatabaseClient,
  ): Promise<void> {
    const claims = request.user as (AccessTokenClaims & { platformRole?: PlatformRole }) | undefined
    const actorId = claims?.userId ?? null
    const roleAtTime: PlatformRole = claims?.platformRole ?? 'user'
    const ip = request.ip

    const sanitizedOpts: RecordOptions = {
      ...opts,
      metadata: opts.metadata ? sanitizeMetadata(opts.metadata) : opts.metadata,
      ip,
    }

    await this.repo.record(action, actorId, roleAtTime, sanitizedOpts, tx)
  }

  async list(filters: ListLogsFilters = {}) {
    return this.repo.list(filters)
  }
}
