import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { createUserRateLimiter } from '../../../shared/middleware/rate-limit.js'
import type { LgpdRepository } from './lgpd.repository.js'
import type { AccessTokenClaims } from '../../auth/auth.service.js'

const submitBody = z.object({
  type: z.enum(['export', 'delete', 'rectify', 'portability']),
})

const responseSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  status: z.string(),
  createdAt: z.date(),
})

const rateLimiter = createUserRateLimiter(2, 24 * 60 * 60 * 1000)

export const lgpdUserRoutes: FastifyPluginAsyncZod<{ repo: LgpdRepository }> = async (app, opts) => {
  app.post('/', {
    preHandler: [authenticate, rateLimiter],
    schema: {
      operationId: 'lgpd_user_create',
      tags: ['LGPD'],
      summary: 'Submeter solicitação LGPD (Art. 18)',
      security: [{ accessToken: [] }],
      body: submitBody,
      response: {
        201: responseSchema,
        409: z.object({ error: z.string(), message: z.string() }),
      },
    },
    handler: async (request, reply) => {
      const { userId } = request.user as AccessTokenClaims
      const existing = await opts.repo.findPendingByUserId(userId)
      if (existing) {
        return reply.status(409).send({
          error: 'LGPD_REQUEST_PENDING',
          message: 'Você já tem uma solicitação em andamento',
        })
      }
      const row = await opts.repo.create(userId, request.body.type)
      return reply.status(201).send(row)
    },
  })
}
