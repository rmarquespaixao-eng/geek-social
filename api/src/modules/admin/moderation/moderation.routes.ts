import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { ModerationController } from './moderation.controller.js'
import { aiConfigInputSchema, aiConfigResponseSchema, ageConfigInputSchema, ageConfigResponseSchema } from './moderation.schema.js'
import type { ModerationService } from './moderation.service.js'

const noContent = z.void()

export const moderationRoutes: FastifyPluginAsyncZod<{ moderationService: ModerationService }> = async (app, opts) => {
  const ctrl = new ModerationController(opts.moderationService)

  // AI Moderation config
  app.get('/ai', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_moderation_ai_get',
      tags: ['Admin'],
      summary: 'Obter configuração de moderação por IA',
      security: [{ accessToken: [] }],
      response: { 200: aiConfigResponseSchema },
    },
    handler: ctrl.getAiConfig.bind(ctrl),
  })

  app.patch('/ai', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_moderation_ai_update',
      tags: ['Admin'],
      summary: 'Atualizar configuração de moderação por IA',
      security: [{ accessToken: [] }],
      body: aiConfigInputSchema,
      response: { 200: aiConfigResponseSchema },
    },
    handler: ctrl.updateAiConfig.bind(ctrl),
  })

  app.delete('/ai/api-key', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_moderation_ai_apikey_clear',
      tags: ['Admin'],
      summary: 'Remover chave de API da moderação por IA',
      security: [{ accessToken: [] }],
      response: { 204: noContent },
    },
    handler: ctrl.clearApiKey.bind(ctrl),
  })

  // Age verification config
  app.get('/age', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_moderation_age_get',
      tags: ['Admin'],
      summary: 'Obter configuração de verificação de idade',
      security: [{ accessToken: [] }],
      response: { 200: ageConfigResponseSchema },
    },
    handler: ctrl.getAgeConfig.bind(ctrl),
  })

  app.patch('/age', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_moderation_age_update',
      tags: ['Admin'],
      summary: 'Atualizar configuração de verificação de idade',
      security: [{ accessToken: [] }],
      body: ageConfigInputSchema,
      response: { 200: ageConfigResponseSchema },
    },
    handler: ctrl.updateAgeConfig.bind(ctrl),
  })
}
