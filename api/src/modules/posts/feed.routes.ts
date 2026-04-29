import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FeedService } from './feed.service.js'
import { FeedController } from './feed.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'
import { feedQuerySchema } from './posts.schema.js'

const userIdParam = z.object({ userId: z.string().uuid() })

export const feedRoutes: FastifyPluginAsyncZod<{ feedService: FeedService }> = async (app, options) => {
  const controller = new FeedController(options.feedService)

  app.get('/', {
    schema: {
      operationId: 'feed_get',
      tags: ['Feed'],
      summary: 'Feed do usuário',
      description: 'Posts dos amigos + próprios + públicos, respeitando visibility e filtrando user_blocks. Cursor pagination cronológica decrescente.',
      security: [{ accessToken: [] }],
      querystring: feedQuerySchema,
    },
    preHandler: [authenticate],
    handler: controller.getFeed.bind(controller),
  })
}

export const profilePostsRoutes: FastifyPluginAsyncZod<{ feedService: FeedService }> = async (app, options) => {
  const controller = new FeedController(options.feedService)

  app.get('/:userId/posts', {
    schema: {
      operationId: 'feed_profile_posts',
      tags: ['Feed'],
      summary: 'Posts no perfil de um usuário',
      description: 'Posts do usuário visíveis pelo requester (privacy + amizade).',
      params: userIdParam,
      querystring: feedQuerySchema,
    },
    preHandler: [optionalAuthenticate],
    handler: controller.getProfilePosts.bind(controller),
  })
}
