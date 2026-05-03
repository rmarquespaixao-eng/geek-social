import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { createUserRateLimiter } from '../../../shared/middleware/rate-limit.js'
import { FeatureFlagsController } from './feature-flags.controller.js'
import { createFlagBodySchema, updateFlagBodySchema, setUserOverrideBodySchema } from './feature-flags.schema.js'
import type { FeatureFlagsService } from './feature-flags.service.js'

const mutationRateLimiter = createUserRateLimiter(20, 60 * 1000)
const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const idUserParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() })

const featureFlagSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  updatedBy: z.string().uuid().nullable(),
  updatedAt: z.date(),
  createdAt: z.date(),
})

const userOverrideSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  enabled: z.boolean(),
  updatedAt: z.date(),
})

const listFlagsResponseSchema = z.array(featureFlagSchema)

export const featureFlagsRoutes: FastifyPluginAsyncZod<{ featureFlagsService: FeatureFlagsService }> = async (app, opts) => {
  const ctrl = new FeatureFlagsController(opts.featureFlagsService)

  app.get('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_feature_flags_list',
      tags: ['Admin'],
      summary: 'Listar feature flags',
      security: [{ accessToken: [] }],
      response: { 200: listFlagsResponseSchema },
    },
    handler: ctrl.list.bind(ctrl),
  })

  app.post('/', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_feature_flags_create',
      tags: ['Admin'],
      summary: 'Criar feature flag',
      security: [{ accessToken: [] }],
      body: createFlagBodySchema,
      response: { 201: featureFlagSchema },
    },
    handler: ctrl.create.bind(ctrl),
  })

  app.patch('/:id', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_feature_flags_update',
      tags: ['Admin'],
      summary: 'Atualizar feature flag',
      security: [{ accessToken: [] }],
      params: idParam,
      body: updateFlagBodySchema,
      response: { 200: featureFlagSchema },
    },
    handler: ctrl.update.bind(ctrl),
  })

  app.delete('/:id', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
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

  // ── User overrides ──────────────────────────────────────────────

  app.get('/:id/overrides', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_feature_flags_list_overrides',
      tags: ['Admin'],
      summary: 'Listar overrides por usuário',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 200: z.array(userOverrideSchema) },
    },
    handler: ctrl.listOverrides.bind(ctrl),
  })

  app.put('/:id/overrides/:userId', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_feature_flags_set_user_override',
      tags: ['Admin'],
      summary: 'Definir override de flag para usuário',
      security: [{ accessToken: [] }],
      params: idUserParams,
      body: setUserOverrideBodySchema,
      response: { 200: z.object({ userId: z.string().uuid(), flagId: z.string().uuid(), enabled: z.boolean(), updatedAt: z.date() }) },
    },
    handler: ctrl.setUserOverride.bind(ctrl),
  })

  app.delete('/:id/overrides/:userId', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_feature_flags_remove_user_override',
      tags: ['Admin'],
      summary: 'Remover override de flag para usuário',
      security: [{ accessToken: [] }],
      params: idUserParams,
      response: { 204: noContent },
    },
    handler: ctrl.removeUserOverride.bind(ctrl),
  })
}
