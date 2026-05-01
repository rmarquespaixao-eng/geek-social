import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { NotificationsService } from './notifications.service.js'
import { NotificationsController } from './notifications.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { createUserRateLimiter } from '../../shared/middleware/rate-limit.js'

// deleteAll é irreversível e pode limpar histórico de notificações via JWT roubado (NEW-25).
const deleteAllRateLimiter = createUserRateLimiter(5, 60 * 60 * 1000)
const deleteOneRateLimiter = createUserRateLimiter(20, 60 * 60 * 1000)

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const notificationsRoutes: FastifyPluginAsyncZod<{ notificationsService: NotificationsService }> = async (app, opts) => {
  const ctrl = new NotificationsController(opts.notificationsService)

  app.get('/', {
    schema: {
      operationId: 'notifications_list',
      tags: ['Notifications'],
      summary: 'Listar notificações do usuário',
      description: 'Cursor pagination, ordem cronológica decrescente. Inclui actor preview (id, displayName, avatarUrl).',
      security: [{ accessToken: [] }],
      querystring: listQuerySchema,
    },
    preHandler: [authenticate],
    handler: ctrl.list.bind(ctrl),
  })

  app.get('/unread-count', {
    schema: {
      operationId: 'notifications_unread_count',
      tags: ['Notifications'],
      summary: 'Contador de notificações não-lidas',
      description: 'Retorna { count }. Usado pro badge no ícone do sino.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: ctrl.countUnread.bind(ctrl),
  })

  app.post('/read-all', {
    schema: {
      operationId: 'notifications_read_all',
      tags: ['Notifications'],
      summary: 'Marcar todas como lidas',
      description: 'UPDATE notifications SET read=true WHERE recipient_id=? AND read=false.',
      security: [{ accessToken: [] }],
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.markAllRead.bind(ctrl),
  })

  app.patch('/:id/read', {
    schema: {
      operationId: 'notifications_mark_read',
      tags: ['Notifications'],
      summary: 'Marcar uma notificação como lida',
      description: 'UPDATE read=true. Idempotente.',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.markRead.bind(ctrl),
  })

  app.delete('/', {
    schema: {
      operationId: 'notifications_delete_all',
      tags: ['Notifications'],
      summary: 'Apagar todas as notificações',
      description: 'DELETE FROM notifications WHERE recipient_id=?. Limpa caixa do user. Rate-limit: 5/hora por userId.',
      security: [{ accessToken: [] }],
      response: { 204: noContent },
    },
    preHandler: [authenticate, deleteAllRateLimiter],
    handler: ctrl.deleteAll.bind(ctrl),
  })

  app.delete('/:id', {
    schema: {
      operationId: 'notifications_delete',
      tags: ['Notifications'],
      summary: 'Apagar uma notificação',
      description: 'DELETE da notificação específica do user. Não afeta outras.',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate, deleteOneRateLimiter],
    handler: ctrl.deleteOne.bind(ctrl),
  })
}
