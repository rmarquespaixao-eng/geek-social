import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { ListingsService } from './listings.service.js'
import { ListingsController } from './listings.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { createListingSchema, updateListingSchema } from './listings.schema.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const listingDeleteQuery = z.object({ hard: z.enum(['true', 'false']).optional() })

export const listingsRoutes: FastifyPluginAsyncZod<{ listingsService: ListingsService }> = async (app, options) => {
  const ctrl = new ListingsController(options.listingsService)

  app.post('/', {
    schema: {
      operationId: 'listings_create',
      tags: ['Listings'],
      summary: 'Criar anúncio na Vitrine',
      description: 'INSERT listing com status=active e disclaimer_accepted_at=now(). Falha com ALREADY_LISTED se item já tem listing ativo.',
      security: [{ accessToken: [] }],
      body: createListingSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.create.bind(ctrl),
  })

  app.get('/mine', {
    schema: {
      operationId: 'listings_list_own',
      tags: ['Listings'],
      summary: 'Meus anúncios',
      description: 'Lista listings do usuário, ordenados por status + created_at. Inclui closed/paused. Filtro opcional ?status=active|paused|closed.',
      security: [{ accessToken: [] }],
      querystring: z.object({ status: z.enum(['active', 'paused', 'closed']).optional() }),
    },
    preHandler: [authenticate],
    handler: ctrl.listOwn.bind(ctrl),
  })

  app.patch('/:id', {
    schema: {
      operationId: 'listings_update',
      tags: ['Listings'],
      summary: 'Atualizar anúncio',
      description: 'Edita availability, askingPrice, paymentMethods. Status apenas via pause/resume/close.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: updateListingSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.update.bind(ctrl),
  })

  app.patch('/:id/pause', {
    schema: {
      operationId: 'listings_pause',
      tags: ['Listings'],
      summary: 'Pausar anúncio',
      description: 'UPDATE status=paused. Listing some do marketplace mas pode ser reativado. Pendente NÃO impacta ofertas existentes.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.pause.bind(ctrl),
  })

  app.patch('/:id/resume', {
    schema: {
      operationId: 'listings_resume',
      tags: ['Listings'],
      summary: 'Retomar anúncio pausado',
      description: 'UPDATE status=active. Listing volta ao marketplace.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.resume.bind(ctrl),
  })

  app.delete('/:id', {
    schema: {
      operationId: 'listings_close',
      tags: ['Listings'],
      summary: 'Encerrar (ou excluir permanentemente)',
      description: 'Default: UPDATE status=closed (mantém histórico). Com ?hard=true em listing já closed: DELETE permanente. Auto-rejeita ofertas pendentes em ambos os casos.',
      security: [{ accessToken: [] }],
      params: idParam,
      querystring: listingDeleteQuery,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.close.bind(ctrl),
  })
}

export const marketplaceRoutes: FastifyPluginAsyncZod<{ listingsService: ListingsService }> = async (app, options) => {
  const ctrl = new ListingsController(options.listingsService)
  app.get('/', {
    schema: {
      operationId: 'marketplace_list',
      tags: ['Listings'],
      summary: 'Listar marketplace público',
      description: 'Listings active de outros usuários. Filtros: ?type=sale|trade|both, ?collection_type=games|books|cardgames|boardgames|custom, ?min_price/?max_price (em centavos), ?limit. Cursor pagination.',
      security: [{ accessToken: [] }],
      querystring: z.object({
        type: z.string().optional(),
        collection_type: z.string().optional(),
        min_price: z.string().optional(),
        max_price: z.string().optional(),
        limit: z.string().optional(),
      }),
    },
    preHandler: [authenticate],
    handler: ctrl.listMarketplace.bind(ctrl),
  })
}
