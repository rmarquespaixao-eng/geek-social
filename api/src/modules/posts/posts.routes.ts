import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { PostsService } from './posts.service.js'
import { PostsController } from './posts.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { createPostSchema, updatePostSchema } from './posts.schema.js'

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const mediaParam = z.object({ id: z.string().uuid(), mediaId: z.string().uuid() })

export const postsRoutes: FastifyPluginAsyncZod<{ postsService: PostsService }> = async (app, options) => {
  const controller = new PostsController(options.postsService)

  app.post('/', {
    schema: {
      operationId: 'posts_create',
      tags: ['Posts'],
      summary: 'Criar post manual',
      description: 'Multipart com content + arquivos opcionais. Cria post type=manual + post_media rows.',
      security: [{ accessToken: [] }],
      body: createPostSchema,
    },
    preHandler: [authenticate],
    handler: controller.createPost.bind(controller),
  })

  app.get('/:id', {
    schema: {
      operationId: 'posts_get',
      tags: ['Posts'],
      summary: 'Detalhes do post',
      description: 'Retorna post com media, reaction counts, comment count, e info do autor. Respeita visibility.',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: controller.getPost.bind(controller),
  })

  app.patch('/:id', {
    schema: {
      operationId: 'posts_update',
      tags: ['Posts'],
      summary: 'Editar post',
      description: 'PATCH semântico em content e visibility. Apenas o autor pode editar.',
      security: [{ accessToken: [] }],
      params: idParam,
      body: updatePostSchema,
    },
    preHandler: [authenticate],
    handler: controller.updatePost.bind(controller),
  })

  app.delete('/:id', {
    schema: {
      operationId: 'posts_delete',
      tags: ['Posts'],
      summary: 'Excluir post',
      description: 'DELETE cascateia comments, reactions, post_media. Arquivos no S3 ficam órfãos (pendência).',
      security: [{ accessToken: [] }],
      params: idParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.deletePost.bind(controller),
  })

  app.post('/:id/media', {
    schema: {
      operationId: 'posts_add_media',
      tags: ['Posts'],
      summary: 'Adicionar mídia ao post',
      description: 'Multipart upload. Adiciona ao final da galeria (display_order incrementa).',
      security: [{ accessToken: [] }],
      params: idParam,
    },
    preHandler: [authenticate],
    handler: controller.addMedia.bind(controller),
  })

  app.delete('/:id/media/:mediaId', {
    schema: {
      operationId: 'posts_remove_media',
      tags: ['Posts'],
      summary: 'Remover mídia do post',
      description: 'DELETE da row em post_media. Arquivo S3 fica órfão.',
      security: [{ accessToken: [] }],
      params: mediaParam,
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.removeMedia.bind(controller),
  })
}
