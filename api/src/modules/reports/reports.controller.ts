import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ReportsService } from './reports.service.js'
import { ReportsError } from './reports.service.js'
import { createReportSchema } from './reports.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = createReportSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
    }
    try {
      const report = await this.service.create(userId, parsed.data)
      return reply.status(201).send({ id: report.id, status: report.status, createdAt: report.createdAt.toISOString() })
    } catch (error) {
      if (error instanceof ReportsError) {
        const status = error.code === 'TARGET_NOT_FOUND' ? 404
          : error.code === 'CANNOT_REPORT_OWN' ? 403
          : error.code === 'ALREADY_REPORTED' ? 409
          : 400
        return reply.status(status).send({ error: error.code })
      }
      throw error
    }
  }
}
