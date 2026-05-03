import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { CollectionsService } from './collections.service.js'
import { CollectionsController } from './collections.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'
import {
  createCollectionSchema,
  updateCollectionSchema,
  attachSchemaEntrySchema,
  updateSchemaEntrySchema,
} from './collections.schema.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const userIdParam = z.object({ userId: z.string().uuid() })
const idEntryParam = z.object({ id: z.string().uuid(), entryId: z.string().uuid() })

export const collectionsRoutes: FastifyPluginAsyncZod<{ collectionsService: CollectionsService }> = async (app, options) => {
  const controller = new CollectionsController(options.collectionsService)

  app.get('/', {
    schema: {
      operationId: 'collections_list_mine',
      tags: ['Collections'],
      summary: 'Listar minhas coleções',
      description: 'Coleções do usuário autenticado, com cursor pagination. Filtro opcional ?q= por nome.',
      security: [{ accessToken: [] }],
      querystring: z.object({ q: z.string().optional() }),
    },
    preHandler: [authenticate],
    handler: controller.list.bind(controller),
  })

  app.post('/', {
    schema: {
      operationId: 'collections_create',
      tags: ['Collections'],
      summary: 'Criar coleção',
      description: 'Cria nova coleção. Tipo é imutável após criação. fieldDefinitionIds opcional para popular schema dinâmico inicial.',
      security: [{ accessToken: [] }],
      body: createCollectionSchema,
    },
    preHandler: [authenticate],
    handler: controller.create.bind(controller),
  })

  app.get('/stats', {
    schema: {
      operationId: 'collections_stats',
      tags: ['Collections'],
      summary: 'Dashboard de estatísticas das coleções',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.getStats.bind(controller),
  })

  app.get('/:id', {
    schema: {
      operationId: 'collections_get',
      tags: ['Collections'],
      summary: 'Detalhes da coleção',
      description: 'Retorna a coleção com seu schema dinâmico (campos visíveis em items).',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: controller.get.bind(controller),
  })

  app.put('/:id', {
    schema: {
      operationId: 'collections_update',
      tags: ['Collections'],
      summary: 'Atualizar coleção',
      description: 'Edita name, description, visibility, autoShareToFeed. Tipo NÃO é alterável.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: updateCollectionSchema,
    },
    preHandler: [authenticate],
    handler: controller.update.bind(controller),
  })

  app.delete('/:id', {
    schema: {
      operationId: 'collections_delete',
      tags: ['Collections'],
      summary: 'Excluir coleção',
      description: 'DELETE cascateia para items, collection_field_schema. Itens transferidos previamente não são afetados (já mudaram collection_id).',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.delete.bind(controller),
  })

  app.post('/:id/icon', {
    schema: {
      operationId: 'collections_upload_icon',
      tags: ['Collections'],
      summary: 'Upload de ícone customizado da coleção',
      description: 'Multipart. Substitui icon_url anterior.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: controller.uploadIcon.bind(controller),
  })

  app.post('/:id/cover', {
    schema: {
      operationId: 'collections_upload_cover',
      tags: ['Collections'],
      summary: 'Upload de capa da coleção',
      description: 'Multipart. Banner exibido no detalhe da coleção.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: controller.uploadCover.bind(controller),
  })

  app.post('/:id/schema', {
    schema: {
      operationId: 'collections_attach_field',
      tags: ['Collections'],
      summary: 'Adicionar field ao schema da coleção',
      description: 'INSERT em collection_field_schema. Faz o campo aparecer em items dessa coleção.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: attachSchemaEntrySchema,
    },
    preHandler: [authenticate],
    handler: controller.attachField.bind(controller),
  })

  app.delete('/:id/schema/:entryId', {
    schema: {
      operationId: 'collections_detach_field',
      tags: ['Collections'],
      summary: 'Remover field do schema da coleção',
      description: 'DELETE em collection_field_schema. Itens existentes preservam seus valores no JSONB; só some da UI.',
      security: [{ accessToken: [] }],
      params: idEntryParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.detachField.bind(controller),
  })

  app.patch('/:id/schema/:entryId', {
    schema: {
      operationId: 'collections_update_schema_entry',
      tags: ['Collections'],
      summary: 'Atualizar entrada do schema (isRequired)',
      description: 'Marca/desmarca campo como obrigatório.',
      security: [{ accessToken: [] }],
      params: idEntryParam,
      body: updateSchemaEntrySchema,
    },
    preHandler: [authenticate],
    handler: controller.updateSchemaEntry.bind(controller),
  })
}

export const collectionsPublicRoutes: FastifyPluginAsyncZod<{ collectionsService: CollectionsService }> = async (app, options) => {
  const controller = new CollectionsController(options.collectionsService)
  app.get('/:userId/collections', {
    schema: {
      operationId: 'collections_list_public',
      tags: ['Collections'],
      summary: 'Listar coleções públicas de um usuário',
      description: 'Coleções visíveis pelo requester baseado em privacy + amizade. Items embutidos opcionalmente via query.',
      params: userIdParam,
    },
    preHandler: [optionalAuthenticate],
    handler: controller.listPublic.bind(controller),
  })
}
