import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AdminAuditLogService } from '../audit-log.service.js'
import type { ListLogsQuery } from './admin-logs.schema.js'

export class AdminLogsController {
  constructor(private readonly auditLogService: AdminAuditLogService) {}

  async list(request: FastifyRequest<{ Querystring: ListLogsQuery }>, reply: FastifyReply) {
    const { page, pageSize, action, actorId, targetType, targetId, from, to } = request.query
    const { rows, total } = await this.auditLogService.list({
      action,
      actorId,
      targetType,
      targetId,
      from,
      to,
      page,
      pageSize,
    })
    return reply.send({ items: rows, total, page, pageSize })
  }
}
