import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { StatsController } from './stats.controller.js'
import { statsResponseSchema } from './stats.schema.js'
import type { StatsService } from './stats.service.js'

export const statsRoutes: FastifyPluginAsyncZod<{ statsService: StatsService }> = async (app, opts) => {
  const ctrl = new StatsController(opts.statsService)

  app.get('/', {
    preHandler: [authenticate, requireRole(['admin', 'moderator'])],
    schema: {
      operationId: 'admin_stats',
      tags: ['Admin'],
      summary: 'Estatísticas do painel',
      description: 'Agrega contadores da plataforma para o dashboard administrativo.',
      security: [{ accessToken: [] }],
      response: { 200: statsResponseSchema },
    },
    handler: ctrl.getStats.bind(ctrl),
  })
}
