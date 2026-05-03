import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { ItemsService } from './items.service.js'
import { ItemsController } from './items.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'
import { createItemSchema, updateItemSchema } from './items.schema.js'

const noContent = z.void()
const collectionParam = z.object({ collectionId: z.string().uuid() })
const itemParam = z.object({ collectionId: z.string().uuid(), itemId: z.string().uuid() })
const publicItemsParam = z.object({ userId: z.string().uuid(), collectionId: z.string().uuid() })

export const itemsRoutes: FastifyPluginAsyncZod<{ itemsService: ItemsService }> = async (app, options) => {
  const controller = new ItemsController(options.itemsService)

  app.get('/items', {
    schema: {
      operationId: 'items_list_all',
      tags: ['Items'],
      summary: 'Listar todos os itens do usuário',
      description: 'Cursor pagination de todos os itens de todas as coleções do usuário. Inclui collectionName, collectionTypeKey, collectionTypeIcon. Suporta: q, cursor, limit, sort, rating_min, has_cover.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.listAll.bind(controller),
  })

  app.get('/:collectionId/items', {
    schema: {
      operationId: 'items_list',
      tags: ['Items'],
      summary: 'Listar itens da coleção',
      description: 'Cursor pagination + filtros dinâmicos baseados em fields da coleção. Query params: q, cursor, limit (1-100, default 30), sort (recent|oldest|name|name_desc|rating), rating_min (1-5), has_cover (true|false), field_KEY (igualdade ou CSV em select), field_KEY_gte/_lte (range em number/money/date).',
      security: [{ accessToken: [] }],
      params: collectionParam,
    },
    preHandler: [authenticate],
    handler: controller.list.bind(controller),
  })

  app.post('/:collectionId/items', {
    schema: {
      operationId: 'items_create',
      tags: ['Items'],
      summary: 'Criar item na coleção',
      description: 'INSERT com fields validados contra schema dinâmico da coleção. Se collection.auto_share_to_feed=true OU shareToFeed=true, dispara post item_share automaticamente.',
      security: [{ accessToken: [] }],
      params: collectionParam,
      body: createItemSchema,
    },
    preHandler: [authenticate],
    handler: controller.create.bind(controller),
  })

  app.get('/:collectionId/items/:itemId', {
    schema: {
      operationId: 'items_get',
      tags: ['Items'],
      summary: 'Detalhes de um item',
      description: 'Retorna item com fields, rating, comment, e metadata da coleção (schema dinâmico pra renderizar fields corretamente).',
      security: [{ accessToken: [] }],
      params: itemParam,
    },
    preHandler: [authenticate],
    handler: controller.get.bind(controller),
  })

  app.put('/:collectionId/items/:itemId', {
    schema: {
      operationId: 'items_update',
      tags: ['Items'],
      summary: 'Atualizar item',
      description: 'PATCH semântico. fields é merge (preserva chaves não enviadas).',
      security: [{ accessToken: [] }],
      params: itemParam,
      body: updateItemSchema,
    },
    preHandler: [authenticate],
    handler: controller.update.bind(controller),
  })

  app.delete('/:collectionId/items/:itemId', {
    schema: {
      operationId: 'items_delete',
      tags: ['Items'],
      summary: 'Excluir item',
      description: 'DELETE cascateia listing ativo do item, post item_share. Item já transferido em offers passadas é preservado em outras coleções.',
      security: [{ accessToken: [] }],
      params: itemParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.delete.bind(controller),
  })

  app.post('/:collectionId/items/:itemId/cover', {
    schema: {
      operationId: 'items_upload_cover',
      tags: ['Items'],
      summary: 'Upload de capa do item',
      description: 'Multipart. Substitui cover_url anterior.',
      security: [{ accessToken: [] }],
      params: itemParam,
    },
    preHandler: [authenticate],
    handler: controller.uploadCover.bind(controller),
  })
}

export const itemsPublicRoutes: FastifyPluginAsyncZod<{ itemsService: ItemsService }> = async (app, options) => {
  const controller = new ItemsController(options.itemsService)
  app.get('/:userId/collections/:collectionId/items', {
    schema: {
      operationId: 'items_list_public',
      tags: ['Items'],
      summary: 'Listar itens públicos de uma coleção alheia',
      description: 'Visibilidade decide pelo combo collection.visibility + amizade. Mesmos query params de items_list.',
      params: publicItemsParam,
    },
    preHandler: [optionalAuthenticate],
    handler: controller.listPublic.bind(controller),
  })
}
