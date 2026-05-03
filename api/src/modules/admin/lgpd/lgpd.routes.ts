import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { createUserRateLimiter } from '../../../shared/middleware/rate-limit.js'
import { LgpdController } from './lgpd.controller.js'
import { listLgpdQuerySchema, decideLgpdBodySchema } from './lgpd.schema.js'
import type { LgpdService } from './lgpd.service.js'

const mutationRateLimiter = createUserRateLimiter(20, 60 * 1000)
const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })

export const lgpdRoutes: FastifyPluginAsyncZod<{ lgpdService: LgpdService }> = async (app, opts) => {
  const ctrl = new LgpdController(opts.lgpdService)

  app.get('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_lgpd_list',
      tags: ['Admin'],
      summary: 'Listar solicitações LGPD',
      security: [{ accessToken: [] }],
      querystring: listLgpdQuerySchema,
    },
    handler: ctrl.list.bind(ctrl),
  })

  app.post('/:id/approve', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_lgpd_approve',
      tags: ['Admin'],
      summary: 'Aprovar solicitação LGPD',
      security: [{ accessToken: [] }],
      params: idParam,
      body: decideLgpdBodySchema,
      response: { 204: noContent },
    },
    handler: ctrl.approve.bind(ctrl),
  })

  app.post('/:id/reject', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_lgpd_reject',
      tags: ['Admin'],
      summary: 'Rejeitar solicitação LGPD',
      security: [{ accessToken: [] }],
      params: idParam,
      body: decideLgpdBodySchema,
      response: { 204: noContent },
    },
    handler: ctrl.reject.bind(ctrl),
  })

  app.post('/:id/complete', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_lgpd_complete',
      tags: ['Admin'],
      summary: 'Concluir solicitação LGPD',
      security: [{ accessToken: [] }],
      params: idParam,
      body: decideLgpdBodySchema,
      response: { 204: noContent },
    },
    handler: ctrl.complete.bind(ctrl),
  })
}
