import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CollectionsService } from './collections.service.js'
import { CollectionsError } from './collections.service.js'
import type {
  CreateCollectionInput,
  UpdateCollectionInput,
  AttachSchemaEntryInput,
  UpdateSchemaEntryInput,
} from './collections.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof CollectionsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Coleção não encontrada' })
      if (error.code === 'FIELD_NOT_FOUND') return reply.status(404).send({ error: 'Definição de campo não encontrada' })
      if (error.code === 'FIELD_KEY_DUPLICATE') return reply.status(409).send({ error: 'Já existe um campo com esse identificador nessa coleção' })
      if (error.code === 'SYSTEM_FIELD_LOCKED') return reply.status(403).send({ error: 'Campos padrão não podem ser removidos' })
    }
    throw error
  }

  async list(request: FastifyRequest<{ Querystring: { q?: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const collections = await this.service.list(userId, request.query.q)
    return reply.send(collections)
  }

  async create(request: FastifyRequest<{ Body: CreateCollectionInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const collection = await this.service.create(userId, request.body)
    return reply.status(201).send(collection)
  }

  async get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const collection = await this.service.get(userId, request.params.id)
      return reply.send(collection)
    } catch (error) { return this.handleError(error, reply) }
  }

  async update(request: FastifyRequest<{ Params: { id: string }; Body: UpdateCollectionInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const collection = await this.service.update(userId, request.params.id, request.body)
      return reply.send(collection)
    } catch (error) { return this.handleError(error, reply) }
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.delete(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async uploadIcon(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })
    try {
      const buffer = await data.toBuffer()
      const result = await this.service.uploadIcon(userId, request.params.id, buffer)
      return reply.send({ iconUrl: result.iconUrl })
    } catch (error) { return this.handleError(error, reply) }
  }

  async uploadCover(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })
    try {
      const buffer = await data.toBuffer()
      const collection = await this.service.uploadCover(userId, request.params.id, buffer)
      return reply.send(collection)
    } catch (error) { return this.handleError(error, reply) }
  }

  async attachField(
    request: FastifyRequest<{ Params: { id: string }; Body: AttachSchemaEntryInput }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const entry = await this.service.attachField(userId, request.params.id, request.body.fieldDefinitionId, {
        isRequired: request.body.isRequired,
      })
      return reply.status(201).send(entry)
    } catch (error) { return this.handleError(error, reply) }
  }

  async detachField(
    request: FastifyRequest<{ Params: { id: string; entryId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.detachField(userId, request.params.id, request.params.entryId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async updateSchemaEntry(
    request: FastifyRequest<{ Params: { id: string; entryId: string }; Body: UpdateSchemaEntryInput }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const entry = await this.service.updateSchemaEntry(userId, request.params.id, request.params.entryId, request.body)
      return reply.send(entry)
    } catch (error) { return this.handleError(error, reply) }
  }

  async getStats(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const stats = await this.service.getStats(userId)
    return reply.send(stats)
  }

  async listPublic(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
    const user = request.user as AccessTokenClaims | undefined
    const viewerId = user?.userId ?? null
    try {
      const collections = await this.service.getPublicCollections(request.params.userId, viewerId)
      return reply.send(collections)
    } catch (error) { return this.handleError(error, reply) }
  }
}
