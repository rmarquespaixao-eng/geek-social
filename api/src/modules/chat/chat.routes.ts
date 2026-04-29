import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { ConversationsService } from './conversations.service.js'
import type { MessagesService } from './messages.service.js'
import type { DmRequestsService } from './dm-requests.service.js'
import type { PushService } from './push.service.js'
import type { ChatGateway } from './chat.gateway.js'
import type { UsersRepository } from '../users/users.repository.js'
import type { FriendsService } from '../friends/friends.service.js'
import { ChatController } from './chat.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import {
  createGroupSchema,
  updateGroupSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateMemberPermissionsSchema,
  openDmSchema,
  sendDmRequestSchema,
  registerPushSchema,
  getHistoryQuerySchema,
  sendMessageBodySchema,
  forwardMessageSchema,
  setTemporarySchema,
} from './chat.schema.js'

type ChatRoutesOptions = {
  conversationsService: ConversationsService
  messagesService: MessagesService
  dmRequestsService: DmRequestsService
  pushService: PushService
  chatGateway: ChatGateway
  usersRepository: UsersRepository
  friendsService: FriendsService
}

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const memberParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() })
const conversationIdParam = z.object({ id: z.string().uuid() })
const reactionBodySchema = z.object({ emoji: z.string().min(1).max(16), add: z.boolean() })
const listConversationsQuery = z.object({ archived: z.string().optional() })

export const chatRoutes: FastifyPluginAsyncZod<ChatRoutesOptions> = async (app, opts) => {
  const ctrl = new ChatController(
    opts.conversationsService,
    opts.messagesService,
    opts.dmRequestsService,
    opts.pushService,
    opts.chatGateway,
    opts.usersRepository,
    opts.friendsService,
  )

  // DM direto entre amigos
  app.post('/dm', {
    schema: {
      operationId: 'chat_open_dm',
      tags: ['Chat'],
      summary: 'Abrir DM 1-1 com amigo',
      description: 'Cria ou retorna conversa DM existente entre o user atual e friendId. Falha se não há amizade aceita.',
      security: [{ accessToken: [] }],
      body: openDmSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.openDm.bind(ctrl),
  })

  // Pedidos de DM
  app.post('/dm-requests', {
    schema: {
      operationId: 'chat_send_dm_request',
      tags: ['Chat'],
      summary: 'Enviar pedido de DM (não-amigo)',
      description: 'Cria dm_request para receiver. Aparece na caixa de "Solicitações" do destinatário até ser aceito/rejeitado.',
      security: [{ accessToken: [] }],
      body: sendDmRequestSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.sendDmRequest.bind(ctrl),
  })

  app.get('/dm-requests', {
    schema: {
      operationId: 'chat_list_dm_requests',
      tags: ['Chat'],
      summary: 'Listar pedidos de DM pendentes',
      description: 'Pedidos onde o user atual é receiver e status=pending.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: ctrl.listDmRequests.bind(ctrl),
  })

  app.post('/dm-requests/:id/accept', {
    schema: {
      operationId: 'chat_accept_dm_request',
      tags: ['Chat'],
      summary: 'Aceitar pedido de DM',
      description: 'Cria conversation DM + insere mensagem original + UPDATE status=accepted.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.acceptDmRequest.bind(ctrl),
  })

  app.post('/dm-requests/:id/reject', {
    schema: {
      operationId: 'chat_reject_dm_request',
      tags: ['Chat'],
      summary: 'Rejeitar pedido de DM',
      description: 'UPDATE status=rejected. Sender NÃO pode reenviar (unique constraint).',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.rejectDmRequest.bind(ctrl),
  })

  // Grupos
  app.post('/groups', {
    schema: {
      operationId: 'chat_create_group',
      tags: ['Chat'],
      summary: 'Criar grupo',
      description: 'Cria conversation type=group. Criador vira role=owner. Membros adicionados depois via invite.',
      security: [{ accessToken: [] }],
      body: createGroupSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.createGroup.bind(ctrl),
  })

  app.get('/groups/:id', {
    schema: {
      operationId: 'chat_get_group',
      tags: ['Chat'],
      summary: 'Detalhes do grupo + lista de membros',
      description: 'Retorna conversation + members[] com roles e permissions.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.getGroup.bind(ctrl),
  })

  app.patch('/groups/:id', {
    schema: {
      operationId: 'chat_update_group',
      tags: ['Chat'],
      summary: 'Editar nome/descrição do grupo',
      description: 'Apenas owner/admin podem editar.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: updateGroupSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.updateGroup.bind(ctrl),
  })

  app.delete('/groups/:id', {
    schema: {
      operationId: 'chat_delete_group',
      tags: ['Chat'],
      summary: 'Apagar grupo (apenas owner)',
      description: 'DELETE cascateia messages + members. Apenas o owner pode.',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.deleteGroup.bind(ctrl),
  })

  app.post('/groups/:id/cover', {
    schema: {
      operationId: 'chat_upload_group_cover',
      tags: ['Chat'],
      summary: 'Upload de capa do grupo',
      description: 'Multipart. Apenas owner/admin.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.uploadGroupCover.bind(ctrl),
  })

  // Membros
  app.post('/groups/:id/members', {
    schema: {
      operationId: 'chat_invite_member',
      tags: ['Chat'],
      summary: 'Convidar membro pro grupo',
      description: 'Apenas owner/admin podem convidar. Adiciona com role=member.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: inviteMemberSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.inviteMember.bind(ctrl),
  })

  app.delete('/groups/:id/members/:userId', {
    schema: {
      operationId: 'chat_remove_member',
      tags: ['Chat'],
      summary: 'Remover membro do grupo',
      description: 'Apenas owner/admin podem remover.',
      security: [{ accessToken: [] }],
      params: memberParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.removeMember.bind(ctrl),
  })

  app.patch('/groups/:id/members/:userId/role', {
    schema: {
      operationId: 'chat_update_member_role',
      tags: ['Chat'],
      summary: 'Mudar role de membro',
      description: 'Apenas owner pode promover/rebaixar admins.',
      security: [{ accessToken: [] }],
      params: memberParam,
      body: updateMemberRoleSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.updateMemberRole.bind(ctrl),
  })

  app.patch('/groups/:id/members/:userId/permissions', {
    schema: {
      operationId: 'chat_update_member_permissions',
      tags: ['Chat'],
      summary: 'Atualizar permissões de membro',
      description: 'Apenas owner/admin. Restringe can_send_messages e can_send_files.',
      security: [{ accessToken: [] }],
      params: memberParam,
      body: updateMemberPermissionsSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.updateMemberPermissions.bind(ctrl),
  })

  app.post('/groups/:id/leave', {
    schema: {
      operationId: 'chat_leave_group',
      tags: ['Chat'],
      summary: 'Sair do grupo',
      description: 'DELETE membership do user atual. Owner pode transferir ownership antes; senão grupo precisa ser deletado.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: ctrl.leaveConversation.bind(ctrl),
  })

  // Mensagens
  app.get('/conversations/:id/messages', {
    schema: {
      operationId: 'chat_get_messages',
      tags: ['Chat'],
      summary: 'Histórico de mensagens da conversa',
      description: 'Cursor pagination decrescente. Filtra hidden_for_user_ids do user atual.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
      querystring: getHistoryQuerySchema,
    },
    preHandler: [authenticate],
    handler: ctrl.getHistory.bind(ctrl),
  })

  app.post('/conversations/:id/messages', {
    schema: {
      operationId: 'chat_send_message',
      tags: ['Chat'],
      summary: 'Enviar mensagem',
      description: 'INSERT message + emit socket message:new. Suporta texto, attachments (já uploadados), reply, e callMetadata.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
      body: sendMessageBodySchema,
    },
    preHandler: [authenticate],
    handler: ctrl.sendMessage.bind(ctrl),
  })

  app.delete('/messages/:id', {
    schema: {
      operationId: 'chat_delete_message',
      tags: ['Chat'],
      summary: 'Apagar mensagem',
      description: 'Soft delete (UPDATE deleted_at). Pode passar ?forAll=true se autor; senão esconde só pra mim.',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.deleteMessage.bind(ctrl),
  })

  app.post('/messages/:id/forward', {
    schema: {
      operationId: 'chat_forward_message',
      tags: ['Chat'],
      summary: 'Encaminhar mensagem para outras conversas',
      description: 'Replica content/attachments em N conversations. Limite 20 destinos.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: forwardMessageSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.forwardMessage.bind(ctrl),
  })

  app.post('/messages/:id/reactions', {
    schema: {
      operationId: 'chat_toggle_reaction',
      tags: ['Chat'],
      summary: 'Adicionar/remover reação',
      description: 'Toggle por (message_id, user_id, emoji): se já existe → DELETE; se não → INSERT.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: reactionBodySchema,
    },
    preHandler: [authenticate],
    handler: ctrl.toggleReaction.bind(ctrl),
  })

  app.post('/conversations/:id/attachments', {
    schema: {
      operationId: 'chat_upload_attachment',
      tags: ['Chat'],
      summary: 'Upload de attachment (pré-mensagem)',
      description: 'Multipart upload. Cria message_attachments sem message_id ainda. ID retornado é usado em send_message.attachmentIds.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.uploadAttachment.bind(ctrl),
  })

  // Conversas
  app.get('/conversations', {
    schema: {
      operationId: 'chat_list_conversations',
      tags: ['Chat'],
      summary: 'Listar minhas conversas',
      description: 'Conversations onde o user é membro. Passe ?archived=true para listar arquivadas em vez de ativas. Inclui última mensagem, unread count, peer info (em DMs).',
      security: [{ accessToken: [] }],
      querystring: listConversationsQuery,
    },
    preHandler: [authenticate],
    handler: ctrl.listConversations.bind(ctrl),
  })

  app.get('/conversations/:id', {
    schema: {
      operationId: 'chat_get_conversation',
      tags: ['Chat'],
      summary: 'Detalhes da conversa',
      description: 'Inclui members em grupos, peer em DMs, e flags do membership atual (muted, archived, hidden).',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.getConversation.bind(ctrl),
  })

  app.post('/conversations/:id/read', {
    schema: {
      operationId: 'chat_mark_read',
      tags: ['Chat'],
      summary: 'Marcar como lida',
      description: 'UPDATE conversation_members.last_read_at. Emit socket conversation:read.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.markAsRead.bind(ctrl),
  })

  app.post('/conversations/:id/archive', {
    schema: {
      operationId: 'chat_archive',
      tags: ['Chat'],
      summary: 'Arquivar conversa',
      description: 'UPDATE is_archived=true. Esconde da lista principal.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.archiveConversation.bind(ctrl),
  })

  app.post('/conversations/:id/unarchive', {
    schema: {
      operationId: 'chat_unarchive',
      tags: ['Chat'],
      summary: 'Desarquivar conversa',
      description: 'UPDATE is_archived=false.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.unarchiveConversation.bind(ctrl),
  })

  app.post('/conversations/:id/mute', {
    schema: {
      operationId: 'chat_mute',
      tags: ['Chat'],
      summary: 'Silenciar conversa',
      description: 'UPDATE is_muted=true. Mensagens chegam mas sem push notification.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.muteConversation.bind(ctrl),
  })

  app.post('/conversations/:id/unmute', {
    schema: {
      operationId: 'chat_unmute',
      tags: ['Chat'],
      summary: 'Desativar silenciar',
      description: 'UPDATE is_muted=false.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.unmuteConversation.bind(ctrl),
  })

  app.post('/conversations/:id/hide', {
    schema: {
      operationId: 'chat_hide',
      tags: ['Chat'],
      summary: 'Esconder conversa (modo Snapchat)',
      description: 'UPDATE conversation_members.hidden_at = now(). Mensagens novas são marcadas is_temporary; cron deleta após X tempo.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
    },
    preHandler: [authenticate],
    handler: ctrl.hideConversation.bind(ctrl),
  })

  app.patch('/conversations/:id/temporary', {
    schema: {
      operationId: 'chat_set_temporary',
      tags: ['Chat'],
      summary: 'Ligar/desligar modo temporário (per-user)',
      description: 'Quando enabled=true, mensagens enviadas por mim ficam efêmeras pro outro lado.',
      security: [{ accessToken: [] }],
      params: conversationIdParam,
      body: setTemporarySchema,
    },
    preHandler: [authenticate],
    handler: ctrl.setTemporary.bind(ctrl),
  })

  // Push
  app.post('/push-subscriptions', {
    schema: {
      operationId: 'chat_register_push',
      tags: ['Chat'],
      summary: 'Registrar Web Push subscription',
      description: 'INSERT push_subscriptions com endpoint + keys. UPSERT por endpoint.',
      security: [{ accessToken: [] }],
      body: registerPushSchema,
    },
    preHandler: [authenticate],
    handler: ctrl.registerPush.bind(ctrl),
  })

  app.delete('/push-subscriptions/:id', {
    schema: {
      operationId: 'chat_remove_push',
      tags: ['Chat'],
      summary: 'Remover push subscription',
      description: 'DELETE da subscription. Apenas o dono pode.',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: ctrl.removePush.bind(ctrl),
  })
}
