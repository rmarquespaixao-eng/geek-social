import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FieldDefinitionsService } from './field-definitions.service.js'
import { FieldDefinitionsController } from './field-definitions.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { createFieldDefinitionSchema } from './field-definitions.schema.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })

export const fieldDefinitionsRoutes: FastifyPluginAsyncZod<{ fieldDefinitionsService: FieldDefinitionsService }> = async (app, options) => {
  const controller = new FieldDefinitionsController(options.fieldDefinitionsService)

  app.get('/', {
    schema: {
      operationId: 'field_definitions_list',
      tags: ['Field Definitions'],
      summary: 'Listar field definitions disponíveis',
      description: 'Retorna definitions de sistema (is_system=true) + customizadas do usuário. Pode filtrar por collection_type.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.list.bind(controller),
  })

  app.post('/', {
    schema: {
      operationId: 'field_definitions_create',
      tags: ['Field Definitions'],
      summary: 'Criar field definition customizada',
      description: 'Cria uma definition do tipo especificado. Para tipo select/money, exige selectOptions. Money: selectOptions[0] é código ISO 4217.',
      security: [{ accessToken: [] }],
      body: createFieldDefinitionSchema,
    },
    preHandler: [authenticate],
    handler: controller.create.bind(controller),
  })

  app.delete('/:id', {
    schema: {
      operationId: 'field_definitions_delete',
      tags: ['Field Definitions'],
      summary: 'Excluir field definition customizada',
      description: 'Apenas customizadas do user (is_system=false). System definitions não podem ser excluídas. Schemas de coleção que referenciam essa definition quebram.',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.delete.bind(controller),
  })
}
