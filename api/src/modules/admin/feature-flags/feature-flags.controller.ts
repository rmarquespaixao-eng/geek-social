import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FeatureFlagsService } from './feature-flags.service.js'
import { FeatureFlagsError } from './feature-flags.service.js'
import type { CreateFlagBody, UpdateFlagBody } from './feature-flags.schema.js'

export class FeatureFlagsController {
  constructor(private readonly service: FeatureFlagsService) {}

  private handleError(err: unknown, reply: FastifyReply) {
    if (err instanceof FeatureFlagsError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message })
    }
    throw err
  }

  async list(_request: FastifyRequest, reply: FastifyReply) {
    const flags = await this.service.list()
    return reply.send(flags)
  }

  async create(request: FastifyRequest<{ Body: CreateFlagBody }>, reply: FastifyReply) {
    try {
      const flag = await this.service.create(request, request.body)
      return reply.status(201).send(flag)
    } catch (err) { return this.handleError(err, reply) }
  }

  async update(request: FastifyRequest<{ Params: { id: string }; Body: UpdateFlagBody }>, reply: FastifyReply) {
    try {
      const flag = await this.service.update(request, request.params.id, request.body)
      return reply.send(flag)
    } catch (err) { return this.handleError(err, reply) }
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      await this.service.delete(request, request.params.id)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }
}
