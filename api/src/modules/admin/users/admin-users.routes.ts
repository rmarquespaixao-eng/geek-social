import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { createUserRateLimiter } from '../../../shared/middleware/rate-limit.js'
import { AdminUsersController } from './admin-users.controller.js'
import { listUsersQuerySchema, setUserStatusBodySchema, setUserRoleBodySchema } from './admin-users.schema.js'
import type { AdminUsersService } from './admin-users.service.js'

const mutationRateLimiter = createUserRateLimiter(20, 60 * 1000)
const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })

const listUsersResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    email: z.string(),
    avatarUrl: z.string().nullable(),
    platformRole: z.enum(['user', 'moderator', 'admin']),
    emailVerified: z.boolean(),
    createdAt: z.date(),
  })),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export const adminUsersRoutes: FastifyPluginAsyncZod<{ adminUsersService: AdminUsersService }> = async (app, opts) => {
  const ctrl = new AdminUsersController(opts.adminUsersService)

  app.get('/', {
    preHandler: [authenticate, requireRole(['admin', 'moderator'])],
    schema: {
      operationId: 'admin_users_list',
      tags: ['Admin'],
      summary: 'Listar usuários',
      security: [{ accessToken: [] }],
      querystring: listUsersQuerySchema,
      response: { 200: listUsersResponseSchema },
    },
    handler: ctrl.list.bind(ctrl),
  })

  app.patch('/:id/status', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_users_set_status',
      tags: ['Admin'],
      summary: 'Alterar status do usuário (ban/unban/suspender)',
      security: [{ accessToken: [] }],
      params: idParam,
      body: setUserStatusBodySchema,
      response: { 204: noContent },
    },
    handler: ctrl.setStatus.bind(ctrl),
  })

  app.patch('/:id/role', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_users_set_role',
      tags: ['Admin'],
      summary: 'Alterar papel do usuário (promover/rebaixar)',
      security: [{ accessToken: [] }],
      params: idParam,
      body: setUserRoleBodySchema,
      response: { 204: noContent },
    },
    handler: ctrl.setRole.bind(ctrl),
  })

  app.post('/:id/anonymize', {
    preHandler: [authenticate, requireRole('admin'), mutationRateLimiter],
    schema: {
      operationId: 'admin_users_anonymize',
      tags: ['Admin'],
      summary: 'Anonimizar conta (LGPD)',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    handler: ctrl.anonymize.bind(ctrl),
  })
}
