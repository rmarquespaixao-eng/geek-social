import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FriendsService } from './friends.service.js'
import { FriendsController } from './friends.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { sendFriendRequestSchema } from './friends.schema.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const userIdParam = z.object({ userId: z.string().uuid() })
const friendIdParam = z.object({ friendId: z.string().uuid() })

export const friendsRoutes: FastifyPluginAsyncZod<{ friendsService: FriendsService }> = async (app, options) => {
  const controller = new FriendsController(options.friendsService)

  app.post('/requests', {
    schema: {
      operationId: 'friends_send_request',
      tags: ['Friends'],
      summary: 'Enviar pedido de amizade',
      description: 'Cria uma friendship pending. Dispara notificação friend_request pro receiver. Falha se já há pedido nessa direção (DUPLICATE_REQUEST) ou se há block ativo.',
      security: [{ accessToken: [] }],
      body: sendFriendRequestSchema,
    },
    preHandler: [authenticate],
    handler: controller.sendRequest.bind(controller),
  })

  app.get('/requests/received', {
    schema: {
      operationId: 'friends_list_received_requests',
      tags: ['Friends'],
      summary: 'Listar pedidos recebidos pendentes',
      description: 'Pedidos de amizade onde o user atual é o receiver e status=pending.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.listReceivedRequests.bind(controller),
  })

  app.get('/requests/sent', {
    schema: {
      operationId: 'friends_list_sent_requests',
      tags: ['Friends'],
      summary: 'Listar pedidos enviados pendentes',
      description: 'Pedidos onde o user atual é o requester e status=pending.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.listSentRequests.bind(controller),
  })

  app.post('/requests/:id/accept', {
    schema: {
      operationId: 'friends_accept_request',
      tags: ['Friends'],
      summary: 'Aceitar pedido de amizade',
      description: 'UPDATE status=accepted. Dispara notificação friend_accepted, vincula chat 1-1 (linkFriendship no socket gateway), e emit conversation:refresh.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: controller.acceptRequest.bind(controller),
  })

  app.post('/requests/:id/reject', {
    schema: {
      operationId: 'friends_reject_request',
      tags: ['Friends'],
      summary: 'Rejeitar pedido de amizade',
      description: 'DELETE da friendship. Sem notificação (rejeição silenciosa).',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.rejectRequest.bind(controller),
  })

  app.delete('/requests/:id', {
    schema: {
      operationId: 'friends_cancel_request',
      tags: ['Friends'],
      summary: 'Cancelar pedido enviado',
      description: 'O requester desfaz seu próprio pedido pending. DELETE.',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.cancelRequest.bind(controller),
  })

  app.get('/', {
    schema: {
      operationId: 'friends_list',
      tags: ['Friends'],
      summary: 'Lista de amigos aceitos',
      description: 'Friendships com status=accepted onde o user é requester ou receiver.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.listFriends.bind(controller),
  })

  app.delete('/:friendId', {
    schema: {
      operationId: 'friends_remove',
      tags: ['Friends'],
      summary: 'Desfazer amizade',
      description: 'DELETE da friendship aceita. Emit unlinkFriendship no chat (chat 1-1 fica desconectado mas conversation preservada).',
      security: [{ accessToken: [] }],
      params: friendIdParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.removeFriend.bind(controller),
  })
}

export const blocksRoutes: FastifyPluginAsyncZod<{ friendsService: FriendsService }> = async (app, options) => {
  const controller = new FriendsController(options.friendsService)

  app.post('/:userId', {
    schema: {
      operationId: 'blocks_add',
      tags: ['Friends'],
      summary: 'Bloquear usuário',
      description: 'INSERT user_blocks. Cascateia: DELETE friendship existente + emit conversation:refresh + unlinkFriendship.',
      security: [{ accessToken: [] }],
      params: userIdParam,
    },
    preHandler: [authenticate],
    handler: controller.blockUser.bind(controller),
  })

  app.delete('/:userId', {
    schema: {
      operationId: 'blocks_remove',
      tags: ['Friends'],
      summary: 'Desbloquear usuário',
      description: 'DELETE user_blocks. NÃO restaura amizade automaticamente — usuários precisam refazer pedido se quiserem.',
      security: [{ accessToken: [] }],
      params: userIdParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.unblockUser.bind(controller),
  })

  app.get('/', {
    schema: {
      operationId: 'blocks_list',
      tags: ['Friends'],
      summary: 'Listar usuários bloqueados',
      description: 'Quem o user atual bloqueou. Não retorna quem o bloqueou (assimétrico).',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.listBlocks.bind(controller),
  })
}
