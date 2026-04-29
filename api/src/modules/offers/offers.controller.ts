import type { FastifyRequest, FastifyReply } from 'fastify'
import type { OffersService } from './offers.service.js'
import { OffersError } from './offers.service.js'
import { createOfferSchema, listOffersQuerySchema, proposeSchema } from './offers.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

const STATUS_BY_CODE: Record<string, number> = {
  LISTING_NOT_FOUND: 404,
  LISTING_NOT_ACTIVE: 409,
  ITEM_NOT_FOUND: 404,
  OFFER_NOT_FOUND: 404,
  OFFERED_ITEM_NOT_FOUND: 404,
  ITEM_NOT_AVAILABLE: 404,
  ITEM_NOT_FOR_SALE: 422,
  ITEM_NOT_FOR_TRADE: 422,
  CANNOT_OFFER_OWN_ITEM: 403,
  DUPLICATE_PENDING_OFFER: 409,
  NO_PENDING_PROPOSAL: 409,
  CANNOT_ACCEPT_OWN_PROPOSAL: 403,
  CANNOT_REJECT_OWN_PROPOSAL: 403,
  ALREADY_PROPOSED: 409,
  OFFER_NOT_NEGOTIABLE: 409,
  NO_PROPOSAL_HISTORY: 404,
  INVALID_PROPOSAL: 422,
  PROPOSALS_NOT_CONFIGURED: 500,
  OFFERED_ITEM_NOT_OWNED: 403,
  OFFERED_COLLECTION_PRIVATE: 422,
  OFFERED_COLLECTION_REQUIRES_FRIENDSHIP: 403,
  NOT_AUTHORIZED: 403,
  INVALID_TRANSITION: 409,
  ALREADY_CONFIRMED: 409,
  ITEM_GONE: 410,
  OFFERED_ITEM_GONE: 410,
  OFFERER_HAS_NO_COLLECTION: 422,
  OWNER_HAS_NO_COLLECTION: 422,
  LISTINGS_SERVICE_NOT_CONFIGURED: 500,
}

export class OffersController {
  constructor(private readonly service: OffersService) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = createOfferSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
    }
    try {
      const offer = await this.service.create(userId, parsed.data)
      return reply.status(201).send(offer)
    } catch (e) {
      return mapError(e, reply)
    }
  }

  async listReceived(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const q = listOffersQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_QUERY' })
    const offers = await this.service.listReceived(userId, q.data.status)
    return reply.send(offers)
  }

  async listSent(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const q = listOffersQuerySchema.safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'INVALID_QUERY' })
    const offers = await this.service.listSent(userId, q.data.status)
    return reply.send(offers)
  }

  async getOne(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      return reply.send(await this.service.getOne(userId, request.params.id))
    } catch (e) {
      return mapError(e, reply)
    }
  }

  async accept(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const result = await this.service.accept(userId, request.params.id)
      return reply.send(result)
    } catch (e) {
      return mapError(e, reply)
    }
  }

  async reject(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      return reply.send(await this.service.reject(userId, request.params.id))
    } catch (e) {
      return mapError(e, reply)
    }
  }

  async cancel(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      return reply.send(await this.service.cancel(userId, request.params.id))
    } catch (e) {
      return mapError(e, reply)
    }
  }

  async confirm(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      return reply.send(await this.service.confirm(userId, request.params.id))
    } catch (e) {
      return mapError(e, reply)
    }
  }

  async propose(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = proposeSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
    }
    try {
      const proposal = await this.service.propose(userId, request.params.id, parsed.data)
      return reply.status(201).send(proposal)
    } catch (e) {
      return mapError(e, reply)
    }
  }

  async getHistory(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      return reply.send(await this.service.getHistory(userId, request.params.id))
    } catch (e) {
      return mapError(e, reply)
    }
  }
}

function mapError(e: unknown, reply: FastifyReply) {
  if (e instanceof OffersError) {
    const status = STATUS_BY_CODE[e.code] ?? 400
    reply.request.log.warn(
      { url: reply.request.url, method: reply.request.method, code: e.code, status },
      'OffersError',
    )
    return reply.status(status).send({ error: e.code })
  }
  throw e
}
