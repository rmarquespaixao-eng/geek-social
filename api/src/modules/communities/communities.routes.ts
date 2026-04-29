import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export const communitiesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.log.info('communities module loaded')
}
