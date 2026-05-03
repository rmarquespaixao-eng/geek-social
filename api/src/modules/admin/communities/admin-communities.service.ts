import type { AdminCommunitiesRepository } from './admin-communities.repository.js'
import type { AdminAuditLogService } from '../audit-log.service.js'
import type { FastifyRequest } from 'fastify'
import type { ListCommunitiesQuery, UpdateCommunityStatusBody } from './admin-communities.schema.js'

export class AdminCommunitiesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AdminCommunitiesError'
  }
}

export class AdminCommunitiesService {
  constructor(
    private readonly repo: AdminCommunitiesRepository,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(_request: FastifyRequest, filters: ListCommunitiesQuery) {
    return this.repo.list(filters)
  }

  async setStatus(request: FastifyRequest, id: string, body: UpdateCommunityStatusBody): Promise<void> {
    const community = await this.repo.findById(id)
    if (!community) throw new AdminCommunitiesError('NOT_FOUND', 'Comunidade não encontrada', 404)

    await this.repo.setStatus(id, body.status)

    const action = body.status === 'suspended' ? 'community_suspend' : 'community_unsuspend'
    await this.auditLog.recordFromRequest(request, action, {
      targetType: 'community',
      targetId: id,
      metadata: { reason: body.reason ?? null },
    })
  }
}
