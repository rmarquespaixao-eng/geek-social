import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AdminCommunitiesService } from './admin-communities.service.js'
import { AdminCommunitiesError } from './admin-communities.service.js'
import type { ListCommunitiesQuery, UpdateCommunityStatusBody } from './admin-communities.schema.js'

export class AdminCommunitiesController {
  constructor(private readonly service: AdminCommunitiesService) {}

  private handleError(err: unknown, reply: FastifyReply) {
    if (err instanceof AdminCommunitiesError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message })
    }
    throw err
  }

  async list(request: FastifyRequest<{ Querystring: ListCommunitiesQuery }>, reply: FastifyReply) {
    const result = await this.service.list(request, request.query)
    return reply.send(result)
  }

  async setStatus(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateCommunityStatusBody }>,
    reply: FastifyReply,
  ) {
    try {
      await this.service.setStatus(request, request.params.id, request.body)
      return reply.status(204).send()
    } catch (err) { return this.handleError(err, reply) }
  }
}
