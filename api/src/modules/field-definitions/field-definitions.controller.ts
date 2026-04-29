import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FieldDefinitionsService } from './field-definitions.service.js'
import { FieldDefinitionsError } from './field-definitions.service.js'
import type { CreateFieldDefinitionInput } from './field-definitions.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

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
    } catch (error) {
      if (error instanceof FieldDefinitionsError) {
        if (error.code === 'INVALID_NAME') {
          return reply.status(422).send({ error: 'Nome inválido' })
        }
        if (error.code === 'FIELD_KEY_ALREADY_EXISTS') {
          return reply.status(409).send({ error: 'Você já tem um campo com esse nome' })
        }
      }
      throw error
    }
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.delete(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof FieldDefinitionsError) {
        if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Definição não encontrada' })
        if (error.code === 'FIELD_IN_USE') return reply.status(409).send({ error: 'Campo está em uso em uma coleção' })
      }
      throw error
    }
  }
}
