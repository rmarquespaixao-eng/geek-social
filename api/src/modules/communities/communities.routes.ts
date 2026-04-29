import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { CommunitiesService } from './communities.service.js'
import type { MembersService } from './members.service.js'
import type { JoinRequestsService } from './join-requests.service.js'
import type { TopicsService } from './topics.service.js'
import { CommunitiesController } from './communities.controller.js'
import { MembersController } from './members.controller.js'
import { JoinRequestsController } from './join-requests.controller.js'
import { TopicsController } from './topics.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'
import {
  listCommunitiesQuerySchema,
  idOrSlugParam,
  uuidParam,
  joinRequestParams,
  topicParams,
  createTopicSchema,
  listTopicsQuerySchema,
  listMembersQuerySchema,
} from './communities.schema.js'

const noContent = z.void()

export type CommunitiesRoutesOptions = {
  communitiesService: CommunitiesService
  membersService: MembersService
  joinRequestsService: JoinRequestsService
  topicsService: TopicsService
}

export const communitiesRoutes: FastifyPluginAsyncZod<CommunitiesRoutesOptions> = async (app, opts) => {
  const commCtrl = new CommunitiesController(opts.communitiesService, opts.membersService)
  const membersCtrl = new MembersController(opts.membersService)
  const joinReqCtrl = new JoinRequestsController(opts.joinRequestsService)
  const topicsCtrl = new TopicsController(opts.topicsService)

  // ── Communities CRUD ──────────────────────────────────────────────
  app.post('/', {
    schema: {
      operationId: 'communities_create',
      tags: ['Communities'],
      summary: 'Criar comunidade',
      description: 'Multipart com cover + icon obrigatórios. Slug derivado do nome (auto-suffix em colisão).',
      security: [{ accessToken: [] }],
      consumes: ['multipart/form-data'],
    },
    preHandler: [authenticate],
    handler: commCtrl.create.bind(commCtrl),
  })

  app.get('/', {
    schema: {
      operationId: 'communities_list',
      tags: ['Communities'],
      summary: 'Listar comunidades visíveis',
      security: [{ accessToken: [] }],
      querystring: listCommunitiesQuerySchema,
    },
    preHandler: [optionalAuthenticate],
    handler: commCtrl.list.bind(commCtrl),
  })

  app.get('/me/owned', {
    schema: {
      operationId: 'communities_list_owned',
      tags: ['Communities'],
      summary: 'Minhas comunidades (dono)',
      security: [{ accessToken: [] }],
      querystring: listCommunitiesQuerySchema,
    },
    preHandler: [authenticate],
    handler: commCtrl.listOwned.bind(commCtrl),
  })

  app.get('/me/joined', {
    schema: {
      operationId: 'communities_list_joined',
      tags: ['Communities'],
      summary: 'Comunidades em que sou membro ativo',
      security: [{ accessToken: [] }],
      querystring: listCommunitiesQuerySchema,
    },
    preHandler: [authenticate],
    handler: commCtrl.listJoined.bind(commCtrl),
  })

  app.get('/:id', {
    schema: {
      operationId: 'communities_get',
      tags: ['Communities'],
      summary: 'Detalhe da comunidade',
      security: [{ accessToken: [] }],
      params: idOrSlugParam,
    },
    preHandler: [optionalAuthenticate],
    handler: commCtrl.get.bind(commCtrl),
  })

  app.patch('/:id', {
    schema: {
      operationId: 'communities_update',
      tags: ['Communities'],
      summary: 'Editar comunidade (somente dono)',
      security: [{ accessToken: [] }],
      params: uuidParam,
      consumes: ['multipart/form-data', 'application/json'],
    },
    preHandler: [authenticate],
    handler: commCtrl.update.bind(commCtrl),
  })

  app.delete('/:id', {
    schema: {
      operationId: 'communities_soft_delete',
      tags: ['Communities'],
      summary: 'Excluir comunidade (soft, somente dono)',
      security: [{ accessToken: [] }],
      params: uuidParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: commCtrl.softDelete.bind(commCtrl),
  })

  // ── Members ────────────────────────────────────────────────────────
  app.post('/:id/members', {
    schema: {
      operationId: 'communities_join',
      tags: ['Communities'],
      summary: 'Entrar na comunidade (pública) ou pedir entrada (restrita)',
      security: [{ accessToken: [] }],
      params: uuidParam,
    },
    preHandler: [authenticate],
    handler: membersCtrl.join.bind(membersCtrl),
  })

  app.delete('/:id/members/me', {
    schema: {
      operationId: 'communities_leave',
      tags: ['Communities'],
      summary: 'Sair da comunidade',
      security: [{ accessToken: [] }],
      params: uuidParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: membersCtrl.leave.bind(membersCtrl),
  })

  app.get('/:id/members', {
    schema: {
      operationId: 'communities_list_members',
      tags: ['Communities'],
      summary: 'Listar membros da comunidade',
      security: [{ accessToken: [] }],
      params: uuidParam,
      querystring: listMembersQuerySchema,
    },
    preHandler: [optionalAuthenticate],
    handler: membersCtrl.listMembers.bind(membersCtrl),
  })

  // ── Join Requests ──────────────────────────────────────────────────
  app.get('/:id/join-requests', {
    schema: {
      operationId: 'communities_list_join_requests',
      tags: ['Communities'],
      summary: 'Listar pedidos de entrada pendentes (owner/moderator)',
      security: [{ accessToken: [] }],
      params: uuidParam,
    },
    preHandler: [authenticate],
    handler: joinReqCtrl.listPending.bind(joinReqCtrl),
  })

  app.post('/:id/join-requests/:userId/approve', {
    schema: {
      operationId: 'communities_approve_join_request',
      tags: ['Communities'],
      summary: 'Aprovar pedido de entrada (owner/moderator)',
      security: [{ accessToken: [] }],
      params: joinRequestParams,
    },
    preHandler: [authenticate],
    handler: joinReqCtrl.approve.bind(joinReqCtrl),
  })

  app.post('/:id/join-requests/:userId/reject', {
    schema: {
      operationId: 'communities_reject_join_request',
      tags: ['Communities'],
      summary: 'Rejeitar pedido de entrada (owner/moderator)',
      security: [{ accessToken: [] }],
      params: joinRequestParams,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: joinReqCtrl.reject.bind(joinReqCtrl),
  })

  // ── Topics ─────────────────────────────────────────────────────────
  app.get('/:id/topics', {
    schema: {
      operationId: 'communities_list_topics',
      tags: ['Communities'],
      summary: 'Listar tópicos da comunidade (pinned primeiro)',
      security: [{ accessToken: [] }],
      params: uuidParam,
      querystring: listTopicsQuerySchema,
    },
    preHandler: [optionalAuthenticate],
    handler: topicsCtrl.listTopics.bind(topicsCtrl),
  })

  app.post('/:id/topics', {
    schema: {
      operationId: 'communities_create_topic',
      tags: ['Communities'],
      summary: 'Criar tópico na comunidade',
      security: [{ accessToken: [] }],
      params: uuidParam,
      body: createTopicSchema,
    },
    preHandler: [authenticate],
    handler: topicsCtrl.createTopic.bind(topicsCtrl),
  })

  app.get('/:id/topics/:topicId', {
    schema: {
      operationId: 'communities_get_topic',
      tags: ['Communities'],
      summary: 'Detalhes do tópico + meta',
      security: [{ accessToken: [] }],
      params: topicParams,
    },
    preHandler: [optionalAuthenticate],
    handler: topicsCtrl.getTopicWithMeta.bind(topicsCtrl),
  })
}
