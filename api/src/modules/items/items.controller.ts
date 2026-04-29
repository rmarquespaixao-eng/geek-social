import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ItemsService } from './items.service.js'
import { ItemsError } from './items.service.js'
import type { CreateItemInput, UpdateItemInput } from './items.schema.js'
import { listItemsQuerySchema } from './items.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof ItemsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Item não encontrado' })
      if (error.code === 'REQUIRED_FIELD_MISSING') return reply.status(422).send({ error: 'Campo obrigatório ausente' })
      if (error.code === 'INVALID_FIELD_TYPE') return reply.status(422).send({ error: 'Tipo de campo inválido' })
      if (error.code === 'INVALID_FIELD_VALUE') return reply.status(422).send({ error: 'Valor inválido para campo select' })
      if (error.code === 'INVALID_RATING') return reply.status(422).send({ error: 'Rating deve ser entre 1 e 5' })
    }
    throw error
  }

  async list(
    request: FastifyRequest<{ Params: { collectionId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = listItemsQuerySchema.safeParse(request.query ?? {})
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_QUERY', details: parsed.error.flatten() })
    }
    const { q, cursor, limit, sort, rating_min, has_cover, ...rest } = parsed.data
    const rawFieldParams: Record<string, string> = {}
    for (const [k, v] of Object.entries(rest)) {
      if (typeof v === 'string') rawFieldParams[k] = v
    }
    try {
      const page = await this.service.listPage(userId, request.params.collectionId, {
        q, cursor, limit, sort,
        ratingMin: rating_min,
        hasCover: has_cover === undefined ? undefined : has_cover === 'true',
        rawFieldParams,
      })
      return reply.send(page)
    } catch (error) { return this.handleError(error, reply) }
  }

  async create(
    request: FastifyRequest<{ Params: { collectionId: string }; Body: CreateItemInput }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const item = await this.service.create(userId, request.params.collectionId, request.body)
      return reply.status(201).send(item)
    } catch (error) { return this.handleError(error, reply) }
  }

  async get(
    request: FastifyRequest<{ Params: { collectionId: string; itemId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const item = await this.service.get(userId, request.params.collectionId, request.params.itemId)
      return reply.send(item)
    } catch (error) { return this.handleError(error, reply) }
  }

  async update(
    request: FastifyRequest<{ Params: { collectionId: string; itemId: string }; Body: UpdateItemInput }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const item = await this.service.update(userId, request.params.collectionId, request.params.itemId, request.body)
      return reply.send(item)
    } catch (error) { return this.handleError(error, reply) }
  }

  async delete(
    request: FastifyRequest<{ Params: { collectionId: string; itemId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.delete(userId, request.params.collectionId, request.params.itemId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async uploadCover(
    request: FastifyRequest<{ Params: { collectionId: string; itemId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })
    try {
      const buffer = await data.toBuffer()
      const item = await this.service.uploadCover(userId, request.params.collectionId, request.params.itemId, buffer)
      return reply.send(item)
    } catch (error) { return this.handleError(error, reply) }
  }

  async listPublic(
    request: FastifyRequest<{ Params: { userId: string; collectionId: string } }>,
    reply: FastifyReply,
  ) {
    const user = request.user as AccessTokenClaims | undefined
    const viewerId = user?.userId ?? null
    try {
      const items = await this.service.listPublicItems(request.params.collectionId, request.params.userId, viewerId)
      return reply.send(items)
    } catch (error) { return this.handleError(error, reply) }
  }

}
