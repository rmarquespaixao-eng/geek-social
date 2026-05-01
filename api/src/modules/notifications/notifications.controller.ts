import type { FastifyRequest, FastifyReply } from 'fastify'
import type { NotificationsService } from './notifications.service.js'

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  async list(req: FastifyRequest<{ Querystring: { cursor?: string; limit?: number } }>, reply: FastifyReply) {
    const userId = (req.user as { userId: string }).userId
    const result = await this.service.list(userId, {
      cursor: req.query.cursor,
      limit: req.query.limit,
    })
    return reply.send(result)
  }

  async countUnread(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as { userId: string }).userId
    const count = await this.service.countUnread(userId)
    return reply.send({ count })
  }

  async markAllRead(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as { userId: string }).userId
    await this.service.markAllRead(userId)
    return reply.status(204).send()
  }

  async markRead(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as { userId: string }).userId
    await this.service.markRead(userId, req.params.id)
    return reply.status(204).send()
  }

  async deleteAll(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as { userId: string }).userId
    await this.service.deleteAll(userId)
    return reply.status(204).send()
  }

  async deleteOne(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as { userId: string }).userId
    await this.service.deleteOne(userId, req.params.id)
    return reply.status(204).send()
  }
}
