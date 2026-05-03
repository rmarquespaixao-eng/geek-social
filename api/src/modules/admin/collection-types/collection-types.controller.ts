import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CollectionTypesService } from './collection-types.service.js'
import { CollectionTypeError } from './collection-types.service.js'
import type { CollectionTypeInput, CollectionTypeUpdate, ListCollectionTypesQuery } from './collection-types.schema.js'

export class CollectionTypesController {
  constructor(private readonly service: CollectionTypesService) {}

  private handleError(err: unknown, reply: FastifyReply) {
    if (err instanceof CollectionTypeError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message })
    }
    throw err
  }

  async list(request: FastifyRequest<{ Querystring: ListCollectionTypesQuery }>, reply: FastifyReply) {
    const result = await this.service.list(request.query)
    return reply.send(result)
  }

  async getById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const result = await this.service.getById(request.params.id)
      return reply.send(result)
    } catch (err) { return this.handleError(err, reply) }
  }

  async create(request: FastifyRequest<{ Body: CollectionTypeInput }>, reply: FastifyReply) {
    try {
      const result = await this.service.create(request, request.body)
      return reply.status(201).send(result)
    } catch (err) { return this.handleError(err, reply) }
  }

  async update(request: FastifyRequest<{ Params: { id: string }; Body: CollectionTypeUpdate }>, reply: FastifyReply) {
    try {
      const result = await this.service.update(request, request.params.id, request.body)
      return reply.send(result)
    } catch (err) { return this.handleError(err, reply) }
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      await this.service.delete(request, request.params.id)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }
}
