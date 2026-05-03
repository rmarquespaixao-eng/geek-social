import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../../shared/middleware/authenticate.js'
import { requireRole } from '../../../shared/middleware/require-role.js'
import { CollectionTypesController } from './collection-types.controller.js'
import {
  collectionTypeInputSchema,
  collectionTypeUpdateSchema,
  collectionTypeResponseSchema,
  listCollectionTypesQuerySchema,
  listCollectionTypesResponseSchema,
} from './collection-types.schema.js'
import type { CollectionTypesService } from './collection-types.service.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })

export const collectionTypesRoutes: FastifyPluginAsyncZod<{ collectionTypesService: CollectionTypesService }> = async (app, opts) => {
  const ctrl = new CollectionTypesController(opts.collectionTypesService)

  app.get('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_collection_types_list',
      tags: ['Admin'],
      summary: 'Listar tipos de coleção',
      security: [{ accessToken: [] }],
      querystring: listCollectionTypesQuerySchema,
      response: { 200: listCollectionTypesResponseSchema },
    },
    handler: ctrl.list.bind(ctrl),
  })

  app.get('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_collection_types_get',
      tags: ['Admin'],
      summary: 'Obter tipo de coleção por ID',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 200: collectionTypeResponseSchema },
    },
    handler: ctrl.getById.bind(ctrl),
  })

  app.post('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_collection_types_create',
      tags: ['Admin'],
      summary: 'Criar tipo de coleção',
      security: [{ accessToken: [] }],
      body: collectionTypeInputSchema,
      response: { 201: collectionTypeResponseSchema },
    },
    handler: ctrl.create.bind(ctrl),
  })

  app.patch('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_collection_types_update',
      tags: ['Admin'],
      summary: 'Atualizar tipo de coleção',
      security: [{ accessToken: [] }],
      params: idParam,
      body: collectionTypeUpdateSchema,
      response: { 200: collectionTypeResponseSchema },
    },
    handler: ctrl.update.bind(ctrl),
  })

  app.delete('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      operationId: 'admin_collection_types_delete',
      tags: ['Admin'],
      summary: 'Remover tipo de coleção',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    handler: ctrl.delete.bind(ctrl),
  })
}
