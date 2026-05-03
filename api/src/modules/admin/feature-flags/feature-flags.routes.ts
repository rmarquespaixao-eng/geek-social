import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { FeatureFlagsController } from './feature-flags.controller.js'
import { createFlagBodySchema, updateFlagBodySchema } from './feature-flags.schema.js'
import type { FeatureFlagsService } from './feature-flags.service.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })

export const featureFlagsRoutes: FastifyPluginAsyncZod<{ featureFlagsService: FeatureFlagsService }> = async (app, opts) => {
  const ctrl = new FeatureFlagsController(opts.featureFlagsService)

  app.get('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_feature_flags_list',
      tags: ['Admin'],
      summary: 'Listar feature flags',
      security: [{ accessToken: [] }],
    },
    handler: ctrl.list.bind(ctrl),
  })

  app.post('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_feature_flags_create',
      tags: ['Admin'],
      summary: 'Criar feature flag',
      security: [{ accessToken: [] }],
      body: createFlagBodySchema,
    },
    handler: ctrl.create.bind(ctrl),
  })

  app.patch('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_feature_flags_update',
      tags: ['Admin'],
      summary: 'Atualizar feature flag',
      security: [{ accessToken: [] }],
      params: idParam,
      body: updateFlagBodySchema,
    },
    handler: ctrl.update.bind(ctrl),
  })

  app.delete('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_feature_flags_delete',
      tags: ['Admin'],
      summary: 'Excluir feature flag',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    handler: ctrl.delete.bind(ctrl),
  })
}
