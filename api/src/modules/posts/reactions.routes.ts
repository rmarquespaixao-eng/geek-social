import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { ReactionsService } from './reactions.service.js'
import { ReactionsController } from './reactions.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'
import { addReactionSchema } from './posts.schema.js'

const noContent = z.void()
const postIdParam = z.object({ postId: z.string().uuid() })

export const reactionsRoutes: FastifyPluginAsyncZod<{ reactionsService: ReactionsService }> = async (app, options) => {
  const controller = new ReactionsController(options.reactionsService)

  app.post('/:postId/reactions', {
    schema: {
      operationId: 'reactions_react',
      tags: ['Posts'],
      summary: 'Reagir ao post',
      description: 'UPSERT reaction (1 por user/post). Trocar tipo é UPDATE. Dispara notif post_reaction ao dono do post.',
      security: [{ accessToken: [] }],
      params: postIdParam,
      body: addReactionSchema,
    },
    preHandler: [authenticate],
    handler: controller.react.bind(controller),
  })

  app.delete('/:postId/reactions', {
    schema: {
      operationId: 'reactions_remove',
      tags: ['Posts'],
      summary: 'Remover reação',
      description: 'DELETE da reação do user nesse post.',
      security: [{ accessToken: [] }],
      params: postIdParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.removeReaction.bind(controller),
  })

  app.get('/:postId/reactions', {
    schema: {
      operationId: 'reactions_list',
      tags: ['Posts'],
      summary: 'Listar reações do post',
      description: 'Retorna { counts: { power_up, epic, ... }, mine: type | null, recent: User[] }.',
      params: postIdParam,
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.getReactions.bind(controller),
  })
}
