import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { searchGames } from './igdb.client.js'

export const igdbRoutes: FastifyPluginAsyncZod<{ clientId: string; clientSecret: string }> = async (app, { clientId, clientSecret }) => {
  app.get('/search', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({ q: z.string().min(1).max(100) }),
    },
  }, async (req, reply) => {
    const results = await searchGames(clientId, clientSecret, req.query.q.trim())
    return reply.send(results)
  })
}
