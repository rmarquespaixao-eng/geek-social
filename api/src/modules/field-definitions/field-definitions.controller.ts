import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FieldDefinitionsService } from './field-definitions.service.js'
import { FieldDefinitionsError } from './field-definitions.service.js'
import type { CreateFieldDefinitionInput } from './field-definitions.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  INVALID_NAME: 422,
  FIELD_KEY_ALREADY_EXISTS: 409,
  FIELD_IN_USE: 409,
}

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof FieldDefinitionsError) {
    const status = STATUS_BY_CODE[error.code] ?? 400
    reply.request.log.warn(
      { url: reply.request.url, method: reply.request.method, code: error.code, status },
      'FieldDefinitionsError',
    )
    return reply.status(status).send({ error: error.code })
  }
  throw error
}

export class FieldDefinitionsController {
  constructor(private readonly service: FieldDefinitionsService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const defs = await this.service.listByUser(userId)
    return reply.send(defs)
  }

  async create(request: FastifyRequest<{ Body: CreateFieldDefinitionInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const def = await this.service.create(userId, request.body)
      return reply.status(201).send(def)
    } catch (error) { return handleError(error, reply) }
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.delete(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return handleError(error, reply) }
  }
}
