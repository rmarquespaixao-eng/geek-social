import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { createUserRateLimiter } from '../../../shared/middleware/rate-limit.js'
import { AdminReportsController } from './admin-reports.controller.js'
import { listReportsQuerySchema, updateReportStatusBodySchema } from './admin-reports.schema.js'
import type { AdminReportsService } from './admin-reports.service.js'

const mutationRateLimiter = createUserRateLimiter(20, 60 * 1000)
const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })

export const adminReportsRoutes: FastifyPluginAsyncZod<{ adminReportsService: AdminReportsService }> = async (app, opts) => {
  const ctrl = new AdminReportsController(opts.adminReportsService)

  app.get('/', {
    preHandler: [authenticate, requireRole(['admin', 'moderator'])],
    schema: {
      operationId: 'admin_reports_list',
      tags: ['Admin'],
      summary: 'Listar denúncias',
      security: [{ accessToken: [] }],
      querystring: listReportsQuerySchema,
    },
    handler: ctrl.list.bind(ctrl),
  })

  app.patch('/:id/status', {
    preHandler: [authenticate, requireRole(['admin', 'moderator']), mutationRateLimiter],
    schema: {
      operationId: 'admin_reports_update_status',
      tags: ['Admin'],
      summary: 'Atualizar status de denúncia',
      security: [{ accessToken: [] }],
      params: idParam,
      body: updateReportStatusBodySchema,
      response: { 204: noContent },
    },
    handler: ctrl.updateStatus.bind(ctrl),
  })
}
