import type { FastifyRequest, FastifyReply } from 'fastify'
import type { LgpdService } from './lgpd.service.js'
import { LgpdError } from './lgpd.service.js'
import type { ListLgpdQuery, DecideLgpdBody } from './lgpd.schema.js'

export class LgpdController {
  constructor(private readonly service: LgpdService) {}

  private handleError(err: unknown, reply: FastifyReply) {
    if (err instanceof LgpdError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message })
    }
    throw err
  }

  async list(request: FastifyRequest<{ Querystring: ListLgpdQuery }>, reply: FastifyReply) {
    const result = await this.service.list(request, request.query)
    return reply.send(result)
  }

  async approve(request: FastifyRequest<{ Params: { id: string }; Body: DecideLgpdBody }>, reply: FastifyReply) {
    try {
      await this.service.approve(request, request.params.id, request.body)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }

  async reject(request: FastifyRequest<{ Params: { id: string }; Body: DecideLgpdBody }>, reply: FastifyReply) {
    try {
      await this.service.reject(request, request.params.id, request.body)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }

  async complete(request: FastifyRequest<{ Params: { id: string }; Body: DecideLgpdBody }>, reply: FastifyReply) {
    try {
      await this.service.complete(request, request.params.id, request.body)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }
}
