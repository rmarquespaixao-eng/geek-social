import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { ReportsService } from './reports.service.js'
import { ReportsController } from './reports.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { createReportSchema } from './reports.schema.js'

export const reportsRoutes: FastifyPluginAsyncZod<{ reportsService: ReportsService }> = async (app, opts) => {
  const ctrl = new ReportsController(opts.reportsService)

  app.post('/', {
    schema: {
      operationId: 'reports_create',
      tags: ['Reports'],
      summary: 'Denunciar conteúdo',
      description: 'Cria denúncia com targetType polimórfico (user/message/post/collection/conversation). Unique por (reporter, target_type, target_id) — denúncia duplicada retorna conflict.',
      security: [{ accessToken: [] }],
      body: createReportSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.create.bind(ctrl),
  })
}
