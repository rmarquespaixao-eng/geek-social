import type { FeatureFlagsRepository } from './feature-flags.repository.js'
import type { AdminAuditLogService } from '../audit-log.service.js'
import type { FastifyRequest } from 'fastify'
import type { AccessTokenClaims } from '../../auth/auth.service.js'
import type { CreateFlagBody, UpdateFlagBody } from './feature-flags.schema.js'

export class FeatureFlagsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'FeatureFlagsError'
  }
}

export class FeatureFlagsService {
  constructor(
    private readonly repo: FeatureFlagsRepository,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list() {
    return this.repo.list()
  }

  async getPublicMap(): Promise<Record<string, boolean>> {
    const rows = await this.repo.list()
    return Object.fromEntries(rows.map(r => [r.key, r.enabled]))
  }

  async create(request: FastifyRequest, body: CreateFlagBody) {
    const claims = request.user as AccessTokenClaims
    const existing = await this.repo.findByKey(body.key)
    if (existing) throw new FeatureFlagsError('KEY_CONFLICT', `Feature flag com chave '${body.key}' já existe`, 409)

    const flag = await this.repo.create(body, claims.userId)

    await this.auditLog.recordFromRequest(request, 'feature_flag_create', {
      targetType: 'feature_flag',
      targetId: flag.id,
      metadata: { key: flag.key, enabled: flag.enabled },
    })

    return flag
  }

  async update(request: FastifyRequest, id: string, body: UpdateFlagBody) {
    const claims = request.user as AccessTokenClaims
    const existing = await this.repo.findById(id)
    if (!existing) throw new FeatureFlagsError('NOT_FOUND', 'Feature flag não encontrada', 404)

    const updated = await this.repo.update(id, body, claims.userId)

    const wasToggled = body.enabled !== undefined && body.enabled !== existing.enabled
    await this.auditLog.recordFromRequest(request, wasToggled ? 'feature_flag_toggle' : 'feature_flag_update', {
      targetType: 'feature_flag',
      targetId: id,
      metadata: { key: existing.key, enabled: body.enabled ?? existing.enabled },
    })

    return updated
  }

  async delete(request: FastifyRequest, id: string): Promise<void> {
    const existing = await this.repo.findById(id)
    if (!existing) throw new FeatureFlagsError('NOT_FOUND', 'Feature flag não encontrada', 404)

    await this.repo.delete(id)

    await this.auditLog.recordFromRequest(request, 'feature_flag_delete', {
      targetType: 'feature_flag',
      targetId: id,
      metadata: { key: existing.key },
    })
  }
}
