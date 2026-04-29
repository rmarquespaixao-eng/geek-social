import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ListingsService } from './listings.service.js'
import { ListingsError } from './listings.service.js'
import { createListingSchema, updateListingSchema } from './listings.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

const STATUS_BY_CODE: Record<string, number> = {
  ITEM_NOT_FOUND: 404,
  NOT_FOUND: 404,
  NOT_AUTHORIZED: 403,
  ALREADY_LISTED: 409,
  INVALID_TRANSITION: 422,
  LISTING_CLOSED: 422,
  LISTING_NOT_CLOSED: 422,
}

export class ListingsController {
  constructor(private readonly service: ListingsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof ListingsError) {
      const status = STATUS_BY_CODE[error.code] ?? 400
      reply.request.log.warn(
        { url: reply.request.url, method: reply.request.method, code: error.code, status },
        'ListingsError',
      )
      return reply.status(status).send({ error: error.code })
    }
    throw error
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = createListingSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_INPUT', details: parsed.error.flatten() })
    try {
      const listing = await this.service.create(userId, parsed.data)
      return reply.status(201).send(listing)
    } catch (e) { return this.handleError(e, reply) }
  }

  async listOwn(request: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const status = request.query.status as 'active' | 'paused' | 'closed' | undefined
    return reply.send(await this.service.listOwn(userId, status))
  }

  async listMarketplace(
    request: FastifyRequest<{ Querystring: { type?: string; collection_type?: string; min_price?: string; max_price?: string; limit?: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    const q = request.query
    const type = (q.type === 'sale' || q.type === 'trade' || q.type === 'both') ? q.type : undefined
    return reply.send(await this.service.listMarketplace(userId, {
      type,
      collectionType: q.collection_type,
      minPrice: q.min_price ? Number(q.min_price) : undefined,
      maxPrice: q.max_price ? Number(q.max_price) : undefined,
      limit: q.limit ? Number(q.limit) : 60,
    }))
  }

  async update(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = updateListingSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_INPUT', details: parsed.error.flatten() })
    try {
      const listing = await this.service.update(userId, request.params.id, parsed.data)
      return reply.send(listing)
    } catch (e) { return this.handleError(e, reply) }
  }

  async pause(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      return reply.send(await this.service.pause(userId, request.params.id))
    } catch (e) { return this.handleError(e, reply) }
  }

  async resume(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      return reply.send(await this.service.resume(userId, request.params.id))
    } catch (e) { return this.handleError(e, reply) }
  }

  async close(request: FastifyRequest<{ Params: { id: string }; Querystring: { hard?: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      if (request.query.hard === 'true') {
        await this.service.hardDelete(userId, request.params.id)
        return reply.status(204).send()
      }
      return reply.send(await this.service.close(userId, request.params.id))
    } catch (e) { return this.handleError(e, reply) }
  }
}
