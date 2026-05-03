import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { FeatureFlagsService } from './feature-flags.service.js'

export const featureFlagsPublicRoutes: FastifyPluginAsyncZod<{ featureFlagsService: FeatureFlagsService }> = async (app, opts) => {
  app.get('/', {
    schema: {
      operationId: 'feature_flags_public',
      tags: ['Public'],
      summary: 'Mapa de feature flags ativas',
      response: { 200: z.record(z.string(), z.boolean()) },
    },
    handler: async (_req, reply) => {
      return reply.send(await opts.featureFlagsService.getPublicMap())
    },
  })
}
