import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import type { AdminContentService } from './admin-content.service.js'
import { AdminContentError } from './admin-content.service.js'
import type { FastifyReply } from 'fastify'

const idParam = z.object({ id: z.string().uuid() })
const noContent = z.void()

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof AdminContentError) {
    return reply.status(err.statusCode).send({ error: err.code, message: err.message })
  }
  throw err
}

export const adminContentRoutes: FastifyPluginAsyncZod<{ adminContentService: AdminContentService }> = async (app, opts) => {
  const svc = opts.adminContentService

  app.delete('/posts/:id', {
    preHandler: [authenticate, requireRole(['admin', 'moderator'])],
    schema: {
      operationId: 'admin_content_delete_post',
      tags: ['Admin'],
      summary: 'Remover post (soft delete)',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    async handler(request, reply) {
      try {
        await svc.deletePost(request, request.params.id)
        return reply.status(204).send()
      } catch (err) { return handleError(err, reply) }
    },
  })

  app.delete('/comments/:id', {
    preHandler: [authenticate, requireRole(['admin', 'moderator'])],
    schema: {
      operationId: 'admin_content_delete_comment',
      tags: ['Admin'],
      summary: 'Remover comentário',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    async handler(request, reply) {
      try {
        await svc.deleteComment(request, request.params.id)
        return reply.status(204).send()
      } catch (err) { return handleError(err, reply) }
    },
  })
}
