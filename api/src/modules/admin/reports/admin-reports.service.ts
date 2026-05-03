import type { AdminReportsRepository } from './admin-reports.repository.js'
import type { AdminAuditLogService } from '../audit-log.service.js'
import type { FastifyRequest } from 'fastify'
import type { ListReportsQuery, UpdateReportStatusBody } from './admin-reports.schema.js'

export class AdminReportsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AdminReportsError'
  }
}

export class AdminReportsService {
  constructor(
    private readonly repo: AdminReportsRepository,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(_request: FastifyRequest, filters: ListReportsQuery) {
    const { rows, total } = await this.repo.list(filters)
    const items = rows.map(r => ({
      id: r.id,
      reporterId: r.reporterId,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt,
    }))
    return { items, total, page: filters.page, pageSize: filters.pageSize }
  }

  async updateStatus(request: FastifyRequest, id: string, body: UpdateReportStatusBody): Promise<void> {
    // Mapeia status da API para valores do DB
    const dbStatus = body.status === 'resolved' || body.status === 'reviewing'
      ? 'reviewed' as const
      : 'dismissed' as const

    const dbExpected = body.currentStatus === 'resolved' || body.currentStatus === 'reviewing'
      ? 'reviewed' as const
      : body.currentStatus

    const updated = await this.repo.updateStatus(id, dbStatus, dbExpected)

    if (!updated) {
      throw new AdminReportsError(
        'REPORT_ALREADY_DECIDED',
        'Denúncia já foi decidida ou status atual diverge',
        409,
      )
    }

    const auditAction = body.status === 'dismissed' ? 'report_dismiss' : 'report_review'
    await this.auditLog.recordFromRequest(request, auditAction, {
      targetType: 'report',
      targetId: id,
    })
  }
}
