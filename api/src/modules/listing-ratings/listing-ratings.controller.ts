import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ListingRatingsService } from './listing-ratings.service.js'
import { ListingRatingsError } from './listing-ratings.service.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'
import { z } from 'zod'

const rateSchema = z.object({
  offerId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
})

const STATUS_BY_CODE: Record<string, number> = {
  OFFER_NOT_FOUND: 404,
  NOT_FOUND: 404,
  OFFER_NOT_COMPLETED: 422,
  NOT_AUTHORIZED: 403,
  WINDOW_EXPIRED: 422,
  ALREADY_RATED: 409,
}

export class ListingRatingsController {
  constructor(private readonly service: ListingRatingsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof ListingRatingsError) {
      const status = STATUS_BY_CODE[error.code] ?? 400
      return reply.status(status).send({ error: error.code })
    }
    throw error
  }

  async rate(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = rateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_INPUT', details: parsed.error.flatten() })
    try {
      const rating = await this.service.rate(userId, parsed.data.offerId, parsed.data.score)
      return reply.status(201).send(rating)
    } catch (e) { return this.handleError(e, reply) }
  }

  async getReputation(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
    const reputation = await this.service.getReputation(request.params.userId)
    return reply.send(reputation)
  }

  async getMyRatingForOffer(request: FastifyRequest<{ Params: { offerId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const rating = await this.service.getMyRatingForOffer(userId, request.params.offerId)
    return reply.send(rating ?? null)
  }

  async getRatingsForOffer(request: FastifyRequest<{ Params: { offerId: string } }>, reply: FastifyReply) {
    const ratings = await this.service.getRatingsForOffer(request.params.offerId)
    return reply.send(ratings)
  }

  async listMyRatings(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const ratings = await this.service.listMyRatings(userId)
    return reply.send(ratings)
  }
}
