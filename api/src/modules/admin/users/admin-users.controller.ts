import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AdminUsersService } from './admin-users.service.js'
import { AdminUsersError } from './admin-users.service.js'
import type { ListUsersQuery, SetUserStatusBody, SetUserRoleBody } from './admin-users.schema.js'

export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  private handleError(err: unknown, reply: FastifyReply) {
    if (err instanceof AdminUsersError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message })
    }
    throw err
  }

  async list(request: FastifyRequest<{ Querystring: ListUsersQuery }>, reply: FastifyReply) {
    try {
      const result = await this.service.list(request, request.query)
      return reply.send(result)
    } catch (err) { return this.handleError(err, reply) }
  }

  async setStatus(
    request: FastifyRequest<{ Params: { id: string }; Body: SetUserStatusBody }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.setStatus(request, request.params.id, request.body)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }

  async setRole(
    request: FastifyRequest<{ Params: { id: string }; Body: SetUserRoleBody }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.setRole(request, request.params.id, request.body)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }

  async anonymize(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.anonymize(request, request.params.id)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }
}
