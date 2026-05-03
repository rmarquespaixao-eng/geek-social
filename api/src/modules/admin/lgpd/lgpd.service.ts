import type { LgpdRepository } from './lgpd.repository.js'
import type { AdminAuditLogService } from '../audit-log.service.js'
import type { FastifyRequest } from 'fastify'
import type { AccessTokenClaims } from '../../auth/auth.service.js'
import type { ListLgpdQuery, DecideLgpdBody } from './lgpd.schema.js'

export class LgpdError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'LgpdError'
  }
}

export class LgpdService {
  constructor(
    private readonly repo: LgpdRepository,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(_request: FastifyRequest, filters: ListLgpdQuery) {
    const { rows, total } = await this.repo.list(filters)
    // Adiciona prazo legal calculado em runtime
    const items = rows.map(r => ({
      ...r,
      legalDeadlineAt: new Date(r.createdAt.getTime() + 15 * 24 * 60 * 60 * 1000),
    }))
    return { items, total, page: filters.page, pageSize: filters.pageSize }
  }

  async approve(request: FastifyRequest, id: string, body: DecideLgpdBody): Promise<void> {
    const claims = request.user as AccessTokenClaims
    const updated = await this.repo.transitionStatus(
      id,
      ['pending', 'processing'],
      'processing',
      claims.userId,
      body.notes,
    )
    if (!updated) {
      throw new LgpdError('INVALID_TRANSITION', 'Solicitação não encontrada ou status não permite aprovação', 409)
    }
    await this.auditLog.recordFromRequest(request, 'lgpd_approve', {
      targetType: 'lgpd_request',
      targetId: id,
    })
  }

  async reject(request: FastifyRequest, id: string, body: DecideLgpdBody): Promise<void> {
    const claims = request.user as AccessTokenClaims
    const updated = await this.repo.transitionStatus(
      id,
      ['pending', 'processing'],
      'rejected',
      claims.userId,
      body.notes,
    )
    if (!updated) {
      throw new LgpdError('INVALID_TRANSITION', 'Solicitação não encontrada ou status não permite rejeição', 409)
    }
    await this.auditLog.recordFromRequest(request, 'lgpd_reject', {
      targetType: 'lgpd_request',
      targetId: id,
    })
  }

  async complete(request: FastifyRequest, id: string, body: DecideLgpdBody): Promise<void> {
    const claims = request.user as AccessTokenClaims
    const updated = await this.repo.transitionStatus(
      id,
      ['processing'],
      'completed',
      claims.userId,
      body.notes,
    )
    if (!updated) {
      throw new LgpdError('INVALID_TRANSITION', 'Solicitação não encontrada ou precisa estar em processamento para ser concluída', 409)
    }
    await this.auditLog.recordFromRequest(request, 'lgpd_complete', {
      targetType: 'lgpd_request',
      targetId: id,
    })
  }
}
