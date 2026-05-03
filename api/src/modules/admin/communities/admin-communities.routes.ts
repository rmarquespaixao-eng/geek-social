import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { AdminCommunitiesController } from './admin-communities.controller.js'
import { listCommunitiesQuerySchema, updateCommunityStatusBodySchema } from './admin-communities.schema.js'
import type { AdminCommunitiesService } from './admin-communities.service.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })

export const adminCommunitiesRoutes: FastifyPluginAsyncZod<{ adminCommunitiesService: AdminCommunitiesService }> = async (app, opts) => {
  const ctrl = new AdminCommunitiesController(opts.adminCommunitiesService)

  app.get('/', {
    preHandler: [authenticate, requireRole(['admin', 'moderator'])],
    schema: {
      operationId: 'admin_communities_list',
      tags: ['Admin'],
      summary: 'Listar comunidades',
      security: [{ accessToken: [] }],
      querystring: listCommunitiesQuerySchema,
    },
    handler: ctrl.list.bind(ctrl),
  })

  app.patch('/:id/status', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_communities_set_status',
      tags: ['Admin'],
      summary: 'Suspender/ativar comunidade',
      security: [{ accessToken: [] }],
      params: idParam,
      body: updateCommunityStatusBodySchema,
      response: { 204: noContent },
    },
    handler: ctrl.setStatus.bind(ctrl),
  })
}
