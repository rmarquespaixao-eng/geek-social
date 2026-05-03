import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import type { AccessTokenClaims } from '../../auth/auth.service.js'
import type { FeatureFlagsService } from './feature-flags.service.js'

export const featureFlagsPublicRoutes: FastifyPluginAsyncZod<{ featureFlagsService: FeatureFlagsService }> = async (app, opts) => {
  app.get('/', {
    schema: {
      operationId: 'feature_flags_public',
      tags: ['Public'],
      summary: 'Mapa de feature flags ativas (padrão global)',
      response: { 200: z.record(z.string(), z.boolean()) },
    },
    handler: async (_req, reply) => {
      return reply.send(await opts.featureFlagsService.getPublicMap())
    },
  })

  app.get('/me', {
    preHandler: [authenticate],
    schema: {
      operationId: 'feature_flags_me',
      tags: ['Public'],
      summary: 'Flags resolvidas para o usuário autenticado (considera overrides)',
      security: [{ accessToken: [] }],
      response: { 200: z.record(z.string(), z.boolean()) },
    },
    handler: async (request, reply) => {
      const claims = request.user as AccessTokenClaims
      return reply.send(await opts.featureFlagsService.getResolvedFlagsForUser(claims.userId))
    },
  })
}
