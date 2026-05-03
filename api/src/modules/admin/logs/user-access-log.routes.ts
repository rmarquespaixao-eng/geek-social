import { z } from 'zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { UserAccessLogRepository } from './user-access-log.repository.js'
import type { userAccessLog } from '../../../shared/infra/database/schema.js'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'

type AccessLogRow = typeof userAccessLog.$inferSelect

const querystringSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const userAccessLogRoutes: FastifyPluginAsyncZod<{ repo: UserAccessLogRepository }> = async (app, opts) => {
  app.get<{ Querystring: z.infer<typeof querystringSchema> }>('/', {
    preHandler: [authenticate, requireRole(['admin', 'moderator'])],
    schema: {
      operationId: 'admin_user_access_logs_list',
      tags: ['Admin'],
      querystring: querystringSchema,
      response: {
        200: z.object({
          items: z.array(z.object({
            id: z.string(),
            userId: z.string().nullable(),
            action: z.string(),
            path: z.string().nullable(),
            ip: z.string().nullable(),
            userAgent: z.string().nullable(),
            metadata: z.record(z.string(), z.unknown()),
            createdAt: z.string(),
          })),
          total: z.number(),
          page: z.number(),
          pageSize: z.number(),
        }),
      },
    },
    handler: async (
      request: FastifyRequest<{ Querystring: z.infer<typeof querystringSchema> }>,
      reply: FastifyReply,
    ) => {
      const q = request.query
      const { rows, total } = await opts.repo.list(q)
      const items = rows.map((r: AccessLogRow) => ({
        id: r.id,
        userId: r.userId ?? null,
        action: r.action,
        path: r.path ?? null,
        ip: r.ip ?? null,
        userAgent: r.userAgent ?? null,
        metadata: (r.metadata as Record<string, unknown>) ?? {},
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))
      return reply.send({ items, total, page: q.page, pageSize: q.pageSize })
    },
  })
}
