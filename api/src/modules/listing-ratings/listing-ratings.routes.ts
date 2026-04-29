import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { ListingRatingsService } from './listing-ratings.service.js'
import { ListingRatingsController } from './listing-ratings.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'

const offerIdParam = z.object({ offerId: z.string().uuid() })
const userIdParam = z.object({ userId: z.string().uuid() })

const rateBodySchema = z.object({
  offerId: z.string().uuid(),
  score: z.number().int().min(1).max(2),
})

export const listingRatingsRoutes: FastifyPluginAsyncZod<{ listingRatingsService: ListingRatingsService }> = async (app, opts) => {
  const ctrl = new ListingRatingsController(opts.listingRatingsService)

  app.post('/', {
    schema: {
      operationId: 'ratings_submit',
      tags: ['Listing Ratings'],
      summary: 'Submeter avaliação pós-transação',
      description: 'Cria avaliação imutável. Score 1 (negative) ou 2 (positive). Apenas em offers completed dentro da janela de 30 dias. Unique por (offer_id, rater_id).',
      security: [{ accessToken: [] }],
      body: rateBodySchema,
    },
    preHandler: [authenticate],
    handler: ctrl.rate.bind(ctrl),
  })

  app.get('/mine', {
    schema: {
      operationId: 'ratings_list_mine',
      tags: ['Listing Ratings'],
      summary: 'Avaliações que eu dei',
      description: 'Lista de ratings do user atual. Frontend usa pra evitar N+1 ao listar ofertas — checa "já avaliei?" em memória.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: ctrl.listMyRatings.bind(ctrl),
  })

  app.get('/offers/:offerId/mine', {
    schema: {
      operationId: 'ratings_get_mine_for_offer',
      tags: ['Listing Ratings'],
      summary: 'Minha avaliação numa oferta específica',
      description: 'Retorna o rating do user atual nessa offer (ou null se ainda não avaliou).',
      security: [{ accessToken: [] }],
      params: offerIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.getMyRatingForOffer.bind(ctrl),
  })

  app.get('/offers/:offerId', {
    schema: {
      operationId: 'ratings_get_for_offer',
      tags: ['Listing Ratings'],
      summary: 'Avaliações de uma oferta',
      description: 'Lista os 2 ratings (um por lado) de uma oferta concluída.',
      security: [{ accessToken: [] }],
      params: offerIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.getRatingsForOffer.bind(ctrl),
  })

  app.get('/users/:userId', {
    schema: {
      operationId: 'ratings_user_reputation',
      tags: ['Listing Ratings'],
      summary: 'Reputação agregada de um usuário',
      description: 'Retorna { count, avgScore, visible }. visible=false se count < MIN_RATINGS (3) — frontend mostra "sem reputação ainda".',
      security: [{ accessToken: [] }],
      params: userIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.getReputation.bind(ctrl),
  })
}
