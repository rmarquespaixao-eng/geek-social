import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { CollectionTypesRepository } from './collection-types.repository.js'

const publicTypeSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  isSystem: z.boolean(),
})

export const collectionTypesPublicRoutes: FastifyPluginAsyncZod<{ repo: CollectionTypesRepository }> = async (app, opts) => {
  app.get('/', {
    schema: {
      operationId: 'collection_types_public',
      tags: ['Public'],
      summary: 'Lista tipos de coleção ativos',
      response: { 200: z.array(publicTypeSchema) },
    },
    handler: async (_req, reply) => {
      const { rows } = await opts.repo.findAll({ page: 1, limit: 200, active: true })
      return reply.send(rows.map(r => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        icon: r.icon,
        isSystem: r.isSystem,
      })))
    },
  })
}
