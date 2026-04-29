import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { OffersService } from './offers.service.js'
import { OffersController } from './offers.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { createOfferSchema, listOffersQuerySchema, proposeSchema } from './offers.schema.js'

const idParam = z.object({ id: z.string().uuid() })

export const offersRoutes: FastifyPluginAsyncZod<{ offersService: OffersService }> = async (app, opts) => {
  const ctrl = new OffersController(opts.offersService)

  app.post('/', {
    schema: {
      operationId: 'offers_create',
      tags: ['Offers'],
      summary: 'Criar oferta em listing',
      description: 'Cria oferta tipo buy ou trade. Pre-check evita 500: retorna DUPLICATE_PENDING_OFFER (409) se mesmo user já tem oferta pending nesse item. Cria a primeira proposal automaticamente.',
      security: [{ accessToken: [] }],
      body: createOfferSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.create.bind(ctrl),
  })

  app.get('/received', {
    schema: {
      operationId: 'offers_list_received',
      tags: ['Offers'],
      summary: 'Ofertas recebidas',
      description: 'Ofertas onde o user é dono do listing. Filtra por status.',
      security: [{ accessToken: [] }],
      querystring: listOffersQuerySchema,
    },
    preHandler: [authenticate],
    handler: ctrl.listReceived.bind(ctrl),
  })

  app.get('/sent', {
    schema: {
      operationId: 'offers_list_sent',
      tags: ['Offers'],
      summary: 'Ofertas enviadas',
      description: 'Ofertas onde o user é o offerer.',
      security: [{ accessToken: [] }],
      querystring: listOffersQuerySchema,
    },
    preHandler: [authenticate],
    handler: ctrl.listSent.bind(ctrl),
  })

  app.get('/:id', {
    schema: {
      operationId: 'offers_get',
      tags: ['Offers'],
      summary: 'Detalhes de uma oferta',
      description: 'Retorna OfferWithDetails — inclui latestProposal (id, proposerId, status), itens envolvidos, e dados do listing.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.getOne.bind(ctrl),
  })

  app.post('/:id/accept', {
    schema: {
      operationId: 'offers_accept',
      tags: ['Offers'],
      summary: 'Aceitar a proposta corrente',
      description: 'UPDATE proposal corrente status=accepted + offer.status=accepted. Próximo passo: dual confirm. Apenas o lado oposto ao proposer pode aceitar.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.accept.bind(ctrl),
  })

  app.post('/:id/reject', {
    schema: {
      operationId: 'offers_reject',
      tags: ['Offers'],
      summary: 'Rejeitar a proposta corrente',
      description: 'Rejeita apenas a rodada (proposal.status=rejected). A oferta segue como pending — receptor pode contra-propor.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.reject.bind(ctrl),
  })

  app.post('/:id/cancel', {
    schema: {
      operationId: 'offers_cancel',
      tags: ['Offers'],
      summary: 'Cancelar oferta (offerer)',
      description: 'O ofertante desfaz a oferta inteira antes de completar. UPDATE offer.status=cancelled. Notifica o dono.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.cancel.bind(ctrl),
  })

  app.post('/:id/confirm', {
    schema: {
      operationId: 'offers_confirm',
      tags: ['Offers'],
      summary: 'Confirmar transação (dual)',
      description: 'Cada lado confirma uma vez. Quando ambos confirmam, executeTransfer move itens entre coleções, status=completed, listing=closed. Idempotente: re-confirmar tenta executar transferência se ainda não rodou.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.confirm.bind(ctrl),
  })

  app.post('/:id/propose', {
    schema: {
      operationId: 'offers_propose',
      tags: ['Offers'],
      summary: 'Contra-propor (counter-proposal)',
      description: 'Cria nova proposal com o turno do oposto. A anterior vira superseded. Só permitido após reject da última.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: proposeSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.propose.bind(ctrl),
  })

  app.get('/:id/history', {
    schema: {
      operationId: 'offers_history',
      tags: ['Offers'],
      summary: 'Histórico de propostas da oferta',
      description: 'Lista todas as proposals em ordem cronológica. Útil pra timeline de negociação.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.getHistory.bind(ctrl),
  })
}
