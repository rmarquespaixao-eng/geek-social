import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { CommentsService } from './comments.service.js'
import { CommentsController } from './comments.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'
import { addCommentSchema, updateCommentSchema } from './posts.schema.js'

const noContent = z.void()
const postIdParam = z.object({ postId: z.string().uuid() })
const commentParam = z.object({ postId: z.string().uuid(), id: z.string().uuid() })

export const commentsRoutes: FastifyPluginAsyncZod<{ commentsService: CommentsService }> = async (app, options) => {
  const controller = new CommentsController(options.commentsService)

  app.post('/:postId/comments', {
    schema: {
      operationId: 'comments_add',
      tags: ['Posts'],
      summary: 'Adicionar comentário ao post',
      description: 'INSERT comment. Dispara notificação post_comment ao dono do post (se autor != dono).',
      security: [{ accessToken: [] }],
      params: postIdParam,
      body: addCommentSchema,
    },
    preHandler: [authenticate],
    handler: controller.addComment.bind(controller),
  })

  app.get('/:postId/comments', {
    schema: {
      operationId: 'comments_list',
      tags: ['Posts'],
      summary: 'Listar comentários do post',
      description: 'Cursor pagination cronológica crescente. Inclui dados do autor.',
      params: postIdParam,
      querystring: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).optional() }),
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.listComments.bind(controller),
  })

  app.patch('/:postId/comments/:id', {
    schema: {
      operationId: 'comments_update',
      tags: ['Posts'],
      summary: 'Editar comentário',
      description: 'Apenas o autor pode editar. Atualiza updated_at; UI mostra "editado".',
      security: [{ accessToken: [] }],
      params: commentParam,
      body: updateCommentSchema,
    },
    preHandler: [authenticate],
    handler: controller.updateComment.bind(controller),
  })

  app.delete('/:postId/comments/:id', {
    schema: {
      operationId: 'comments_delete',
      tags: ['Posts'],
      summary: 'Excluir comentário',
      description: 'Pode ser feito pelo autor OU pelo dono do post (moderação leve).',
      security: [{ accessToken: [] }],
      params: commentParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.deleteComment.bind(controller),
  })
}
