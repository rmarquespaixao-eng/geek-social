import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { UsersService } from './users.service.js'
import { UsersController } from './users.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'
import { createUserRateLimiter } from '../../shared/middleware/rate-limit.js'
import { setColorSchema, updateProfileSchema, updateSettingsSchema } from './users.schema.js'
import { errorResponseSchema } from '../auth/auth.schema.js'

const searchRateLimiter = createUserRateLimiter(30, 60 * 1000)
// deleteAccount é irreversível: rate-limit de 1/24h por userId. Para Google-only, JWT
// vazado é o principal vetor — rate-limit mais restrito limita a janela de ataque (MEDIUM-11).
const deleteAccountRateLimiter = createUserRateLimiter(1, 24 * 60 * 60 * 1000)

const noContent = z.void()
const idParam = z.object({ id: z.string().uuid() })
const searchQuery = z.object({ q: z.string().min(1).max(100), limit: z.coerce.number().int().min(1).max(50).optional() })

export const usersRoutes: FastifyPluginAsyncZod<{ usersService: UsersService }> = async (app, options) => {
  const controller = new UsersController(options.usersService)

  app.get('/me', {
    schema: {
      operationId: 'users_get_me',
      tags: ['Users'],
      summary: 'Perfil do usuário autenticado',
      description: 'Retorna o perfil completo do usuário logado, incluindo configs privadas (privacy, settings).',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.getMe.bind(controller),
  })

  app.get('/search', {
    schema: {
      operationId: 'users_search',
      tags: ['Users'],
      summary: 'Buscar usuários por nome/e-mail',
      description: 'Pesquisa usuários cujo display_name ou e-mail contém o termo informado. Apenas perfis públicos retornam resultados sem amizade.',
      security: [{ accessToken: [] }],
      querystring: searchQuery,
    },
    preHandler: [authenticate, searchRateLimiter],
    handler: controller.searchUsers.bind(controller),
  })

  app.get('/:id/friends', {
    schema: {
      operationId: 'users_public_friends',
      tags: ['Users'],
      summary: 'Lista de amigos públicos de um usuário',
      description: 'Retorna amigos do usuário, respeitando privacy do dono e a relação com o requester.',
      params: idParam,
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.getPublicFriends.bind(controller),
  })

  app.get('/:id/profile', {
    schema: {
      operationId: 'users_public_profile',
      tags: ['Users'],
      summary: 'Perfil público de um usuário',
      description: 'Retorna o perfil público (campos visíveis dependem de privacy + amizade). Usado em /perfil/:id.',
      params: idParam,
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.getProfile.bind(controller),
  })

  app.put('/me/profile', {
    schema: {
      operationId: 'users_update_profile',
      tags: ['Users'],
      summary: 'Atualizar campos de perfil',
      description: 'PATCH semântico — apenas campos enviados são atualizados. Campos: displayName, bio, privacy, birthday, interests, pronouns, location, website.',
      security: [{ accessToken: [] }],
      body: updateProfileSchema,
    },
    preHandler: [authenticate],
    handler: controller.updateProfile.bind(controller),
  })

  app.patch('/me/settings', {
    schema: {
      operationId: 'users_update_settings',
      tags: ['Users'],
      summary: 'Atualizar configurações de privacidade',
      description: 'Atualiza show_presence e show_read_receipts. Hooks emitem socket pra propagar visibilidade aos pares.',
      security: [{ accessToken: [] }],
      body: updateSettingsSchema,
    },
    preHandler: [authenticate],
    handler: controller.updateSettings.bind(controller),
  })

  app.post('/me/avatar', {
    schema: {
      operationId: 'users_upload_avatar',
      tags: ['Users'],
      summary: 'Upload de avatar',
      description: 'Multipart upload. Limite 5MB. Backend gera thumbnail via sharp e deleta avatar anterior se houver.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.uploadAvatar.bind(controller),
  })

  app.delete('/me/avatar', {
    schema: {
      operationId: 'users_delete_avatar',
      tags: ['Users'],
      summary: 'Remover avatar',
      description: 'Apaga avatar do S3 e zera users.avatar_url. UI passa a mostrar placeholder.',
      security: [{ accessToken: [] }],
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.deleteAvatar.bind(controller),
  })

  app.post('/me/cover', {
    schema: {
      operationId: 'users_upload_cover',
      tags: ['Users'],
      summary: 'Upload de capa de perfil',
      description: 'Multipart. Setar imagem zera cover_color (mutuamente exclusivos).',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.uploadCover.bind(controller),
  })

  app.delete('/me/cover', {
    schema: {
      operationId: 'users_delete_cover',
      tags: ['Users'],
      summary: 'Remover capa',
      description: 'Apaga cover_url. Render volta pra cover_color (se houver) ou gradient default.',
      security: [{ accessToken: [] }],
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.deleteCover.bind(controller),
  })

  app.post('/me/background', {
    schema: {
      operationId: 'users_upload_background',
      tags: ['Users'],
      summary: 'Upload de fundo do perfil',
      description: 'Multipart. Imagem de fundo da página de perfil. Zera profile_background_color.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
    handler: controller.uploadProfileBackground.bind(controller),
  })

  app.delete('/me/background', {
    schema: {
      operationId: 'users_delete_background',
      tags: ['Users'],
      summary: 'Remover fundo do perfil',
      description: 'Apaga profile_background_url.',
      security: [{ accessToken: [] }],
      response: { 204: noContent },
    },
    preHandler: [authenticate],
    handler: controller.deleteProfileBackground.bind(controller),
  })

  app.put('/me/cover-color', {
    schema: {
      operationId: 'users_set_cover_color',
      tags: ['Users'],
      summary: 'Definir cor sólida de capa',
      description: 'Hex #RRGGBB. Setar cor zera cover_url. Passar { color: null } limpa.',
      security: [{ accessToken: [] }],
      body: setColorSchema,
    },
    preHandler: [authenticate],
    handler: controller.setCoverColor.bind(controller),
  })

  app.put('/me/background-color', {
    schema: {
      operationId: 'users_set_background_color',
      tags: ['Users'],
      summary: 'Definir cor sólida de fundo do perfil',
      description: 'Hex #RRGGBB. Setar cor zera profile_background_url. Passar { color: null } limpa.',
      security: [{ accessToken: [] }],
      body: setColorSchema,
    },
    preHandler: [authenticate],
    handler: controller.setProfileBackgroundColor.bind(controller),
  })

  app.delete('/me', {
    schema: {
      operationId: 'users_delete_account',
      tags: ['Users'],
      summary: 'Excluir conta permanentemente',
      description: 'Requer confirmação de senha (contas com senha) ou pode omitir (contas Google-only — Google já atua como 2FA implícito). Apaga avatar/cover/background do S3 e DELETE FROM users (cascade nas tabelas relacionadas). Ação irreversível.',
      security: [{ accessToken: [] }],
      body: z.object({
        // Obrigatório para contas com senha; opcional para contas Google-only (NEW-10).
        password: z.string().optional(),
      }),
      response: {
        204: noContent,
        400: errorResponseSchema,
        401: errorResponseSchema,
      },
    },
    preHandler: [authenticate, deleteAccountRateLimiter],
    handler: controller.deleteAccount.bind(controller),
  })
}
