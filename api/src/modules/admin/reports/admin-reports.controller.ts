import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AdminReportsService } from './admin-reports.service.js'
import { AdminReportsError } from './admin-reports.service.js'
import type { ListReportsQuery, UpdateReportStatusBody } from './admin-reports.schema.js'

export class AdminReportsController {
  constructor(private readonly service: AdminReportsService) {}

  private handleError(err: unknown, reply: FastifyReply) {
    if (err instanceof AdminReportsError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message })
    }
    throw err
  }

  async list(request: FastifyRequest<{ Querystring: ListReportsQuery }>, reply: FastifyReply) {
    const result = await this.service.list(request, request.query)
    return reply.send(result)
  }

  async updateStatus(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateReportStatusBody }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.updateStatus(request, request.params.id, request.body)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }
}
