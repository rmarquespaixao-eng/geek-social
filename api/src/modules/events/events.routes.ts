import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { EventsService } from './events.service.js'
import type { ParticipantsService } from './participants.service.js'
import type { InvitesService } from './invites.service.js'
import { EventsController } from './events.controller.js'
import { ParticipantsController } from './participants.controller.js'
import { InvitesController } from './invites.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import {
  cancelEventSchema,
  createInvitesSchema,
  listEventsQuerySchema,
  listParticipantsQuerySchema,
  myEventsQuerySchema,
} from './events.schema.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const inviteParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() })

export type EventsRoutesOptions = {
  eventsService: EventsService
  participantsService: ParticipantsService
  invitesService: InvitesService
}

export const eventsRoutes: FastifyPluginAsyncZod<EventsRoutesOptions> = async (app, opts) => {
  const eventsCtrl = new EventsController(opts.eventsService)
  const participantsCtrl = new ParticipantsController(opts.participantsService)
  const invitesCtrl = new InvitesController(opts.invitesService)

  // ── Eventos ────────────────────────────────────────────────────
  app.post('/', {
    schema: {
      operationId: 'events_create',
      tags: ['Events'],
      summary: 'Criar evento (Rolê)',
      description: 'Multipart com cover obrigatório + campos do evento (presencial requer address, online requer meetingUrl).',
      security: [{ accessToken: [] }],
      consumes: ['multipart/form-data'],
    },
    preHandler: [authenticate],
    handler: eventsCtrl.create.bind(eventsCtrl),
  })

  app.get('/', {
    schema: {
      operationId: 'events_list',
      tags: ['Events'],
      summary: 'Listar rolês visíveis',
      description: 'Listagem paginada com filtros: data (from/to), tipo, cidade (presencial), visibility, cursor.',
      security: [{ accessToken: [] }],
      querystring: listEventsQuerySchema,
    },
    preHandler: [authenticate],
    handler: eventsCtrl.list.bind(eventsCtrl),
  })

  app.get('/me/hosted', {
    schema: {
      operationId: 'events_list_hosted',
      tags: ['Events'],
      summary: 'Meus rolês (anfitrião)',
      security: [{ accessToken: [] }],
      querystring: myEventsQuerySchema,
    },
    preHandler: [authenticate],
    handler: eventsCtrl.listHosted.bind(eventsCtrl),
  })

  app.get('/me/attending', {
    schema: {
      operationId: 'events_list_attending',
      tags: ['Events'],
      summary: 'Meus rolês (participante)',
      description: 'Eventos onde sou subscribed/confirmed.',
      security: [{ accessToken: [] }],
      querystring: myEventsQuerySchema,
    },
    preHandler: [authenticate],
    handler: eventsCtrl.listAttending.bind(eventsCtrl),
  })

  app.get('/:id', {
    schema: {
      operationId: 'events_get',
      tags: ['Events'],
      summary: 'Detalhes do rolê',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: eventsCtrl.get.bind(eventsCtrl),
  })

  app.patch('/:id', {
    schema: {
      operationId: 'events_update',
      tags: ['Events'],
      summary: 'Editar rolê (host)',
      description: 'Multipart opcional para trocar capa. Mudanças em campos sensíveis disparam notificações pros inscritos.',
      security: [{ accessToken: [] }],
      params: idParam,
      consumes: ['multipart/form-data', 'application/json'],
    },
    preHandler: [authenticate],
    handler: eventsCtrl.update.bind(eventsCtrl),
  })

  app.delete('/:id', {
    schema: {
      operationId: 'events_cancel',
      tags: ['Events'],
      summary: 'Cancelar rolê (host) — soft, mantém no banco com status=cancelled',
      description: 'Marca o evento como `cancelled`, preserva no banco e notifica inscritos com `event_cancelled`. Para apagar de vez, use `DELETE /events/:id/permanent`.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: cancelEventSchema,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: eventsCtrl.cancel.bind(eventsCtrl),
  })

  app.delete('/:id/permanent', {
    schema: {
      operationId: 'events_delete_permanent',
      tags: ['Events'],
      summary: 'Excluir rolê de vez (host) — hard delete',
      description: 'Hard delete: remove o evento + addresses/online/participants/invites por cascade. Limpa cover do S3 (best-effort). Se o evento ainda estava `scheduled` no momento da exclusão, notifica inscritos não-saídos com `event_cancelled` antes de remover.',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: eventsCtrl.deletePermanent.bind(eventsCtrl),
  })

  // ── Participantes ──────────────────────────────────────────────
  app.post('/:id/participants', {
    schema: {
      operationId: 'events_subscribe',
      tags: ['Events'],
      summary: 'Inscrever-se no rolê',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: participantsCtrl.subscribe.bind(participantsCtrl),
  })

  app.delete('/:id/participants/me', {
    schema: {
      operationId: 'events_leave',
      tags: ['Events'],
      summary: 'Sair do rolê',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: participantsCtrl.leave.bind(participantsCtrl),
  })

  app.post('/:id/participants/me/confirm', {
    schema: {
      operationId: 'events_confirm',
      tags: ['Events'],
      summary: 'Confirmar presença',
      description: 'Muda status de subscribed para confirmed.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: participantsCtrl.confirm.bind(participantsCtrl),
  })

  app.get('/:id/participants', {
    schema: {
      operationId: 'events_list_participants',
      tags: ['Events'],
      summary: 'Listar participantes do rolê',
      security: [{ accessToken: [] }],
      params: idParam,
      querystring: listParticipantsQuerySchema,
    },
    preHandler: [authenticate],
    handler: participantsCtrl.list.bind(participantsCtrl),
  })

  // ── Convites ───────────────────────────────────────────────────
  app.post('/:id/invites', {
    schema: {
      operationId: 'events_invites_create',
      tags: ['Events'],
      summary: 'Convidar usuários (host)',
      security: [{ accessToken: [] }],
      params: idParam,
      body: createInvitesSchema,
    },
    preHandler: [authenticate],
    handler: invitesCtrl.create.bind(invitesCtrl),
  })

  app.delete('/:id/invites/:userId', {
    schema: {
      operationId: 'events_invites_delete',
      tags: ['Events'],
      summary: 'Remover convite (host)',
      security: [{ accessToken: [] }],
      params: inviteParams,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: invitesCtrl.delete.bind(invitesCtrl),
  })

  app.get('/:id/invites', {
    schema: {
      operationId: 'events_invites_list',
      tags: ['Events'],
      summary: 'Listar convites do rolê (host)',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: invitesCtrl.list.bind(invitesCtrl),
  })
}
