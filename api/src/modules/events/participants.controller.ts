import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ParticipantsService } from './participants.service.js'
import { mapEventsError } from './events.controller.js'
import { serializeEventParticipant } from './events.serializer.js'
import { listParticipantsQuerySchema } from './events.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class ParticipantsController {
  constructor(private readonly service: ParticipantsService) {}

  async subscribe(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const result = await this.service.subscribe(userId, request.params.id)
      const body: { status: 'subscribed' | 'waitlist'; position?: number } = { status: result.status }
      if (result.status === 'waitlist' && result.position != null) body.position = result.position
      return reply.status(201).send(body)
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async leave(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.leave(userId, request.params.id)
      return reply.status(204).send()
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async confirm(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const part = await this.service.confirm(userId, request.params.id)
      return reply.send({ status: part.status })
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }

  async list(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    const q = listParticipantsQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_QUERY' })
    try {
      const result = await this.service.listParticipants(userId, request.params.id, q.data)
      return reply.send({
        participants: result.participants.map(serializeEventParticipant),
        nextCursor: result.nextCursor,
      })
    } catch (e) {
      return mapEventsError(e, reply)
    }
  }
}
