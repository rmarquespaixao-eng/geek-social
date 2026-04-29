import type { FastifyRequest, FastifyReply } from 'fastify'
import type { InvitesService } from './invites.service.js'
import { mapEventsError } from './events.controller.js'
import { createInvitesSchema } from './events.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class InvitesController {
  constructor(private readonly service: InvitesService) {}

  async create(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = createInvitesSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
    }
    try {
      const result = await this.service.createMany(userId, request.params.id, parsed.data.userIds)
      return reply.status(201).send(result)
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async delete(
    request: FastifyRequest<{ Params: { id: string; userId: string } }>,
    reply: FastifyReply,
  ) {
    const auth = request.user as AccessTokenClaims
    try {
      await this.service.deleteOne(auth.userId, request.params.id, request.params.userId)
      return reply.status(204).send()
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async list(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const invites = await this.service.list(userId, request.params.id)
      return reply.send({ invites })
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }
}
