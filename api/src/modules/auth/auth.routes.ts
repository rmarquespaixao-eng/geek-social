import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { AuthService } from './auth.service.js'
import { AuthController } from './auth.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  setPasswordSchema,
  tokenResponseSchema,
  accessTokenOnlyResponseSchema,
  messageResponseSchema,
  errorResponseSchema,
} from './auth.schema.js'

const noContentSchema = z.void()

export const authRoutes: FastifyPluginAsyncZod<{ authService: AuthService }> = async (app, options) => {
  const controller = new AuthController(options.authService)

  app.post('/register', {
    schema: {
      operationId: 'auth_register',
      tags: ['Auth'],
      summary: 'Registrar nova conta',
      description: 'Cria nova conta com e-mail/senha, dispara e-mail de verificação, e já emite tokens (access JWT + refresh cookie).',
      body: registerSchema,
      response: {
        201: tokenResponseSchema,
        409: errorResponseSchema,
      },
    },
    handler: controller.register.bind(controller),
  })

  app.post('/login', {
    schema: {
      operationId: 'auth_login',
      tags: ['Auth'],
      summary: 'Login com e-mail/senha',
      description: 'Autentica usuário, emite par de tokens, cria registro em refresh_tokens.',
      body: loginSchema,
      response: {
        200: tokenResponseSchema,
        401: errorResponseSchema,
      },
    },
    handler: controller.login.bind(controller),
  })

  app.post('/refresh', {
    schema: {
      operationId: 'auth_refresh',
      tags: ['Auth'],
      summary: 'Rotacionar tokens via refresh cookie',
      description: 'Lê cookie refreshToken, gera novo par (access + refresh), revoga o refresh anterior. Cookie HttpOnly atualizado na resposta.',
      security: [{ refreshCookie: [] }],
      response: {
        200: accessTokenOnlyResponseSchema,
        401: errorResponseSchema,
      },
    },
    handler: controller.refresh.bind(controller),
  })

  app.post('/logout', {
    schema: {
      operationId: 'auth_logout',
      tags: ['Auth'],
      summary: 'Encerrar sessão atual',
      description: 'Revoga o refresh token corrente e limpa o cookie. Idempotente: chamar sem cookie retorna 204.',
      response: {
        204: noContentSchema,
      },
    },
    handler: controller.logout.bind(controller),
  })

  app.post('/forgot-password', {
    schema: {
      operationId: 'auth_forgot_password',
      tags: ['Auth'],
      summary: 'Solicitar e-mail de reset de senha',
      description: 'Sempre retorna 200, mesmo se o e-mail não existir, pra não revelar contas. Token tem TTL de 1 hora e é single-use.',
      body: forgotPasswordSchema,
      response: {
        200: messageResponseSchema,
      },
    },
    handler: controller.forgotPassword.bind(controller),
  })

  app.post('/reset-password', {
    schema: {
      operationId: 'auth_reset_password',
      tags: ['Auth'],
      summary: 'Redefinir senha via token',
      description: 'Consome token recebido por e-mail. Atualiza senha, marca token como usado, revoga TODOS os refresh tokens do usuário.',
      body: resetPasswordSchema,
      response: {
        200: messageResponseSchema,
        400: errorResponseSchema,
      },
    },
    handler: controller.resetPassword.bind(controller),
  })

  app.put('/change-password', {
    schema: {
      operationId: 'auth_change_password',
      tags: ['Auth'],
      summary: 'Trocar senha (autenticado)',
      description: 'Requer senha atual. NÃO revoga sessões existentes — use reset-password se quiser invalidar todas.',
      security: [{ accessToken: [] }],
      body: changePasswordSchema,
      response: {
        204: noContentSchema,
        400: errorResponseSchema,
      },
    },
    preHandler: [authenticate],
    handler: controller.changePassword.bind(controller),
  })

  app.post('/set-password', {
    schema: {
      operationId: 'auth_set_password',
      tags: ['Auth'],
      summary: 'Definir senha inicial (conta criada via OAuth)',
      description: 'Para usuários que entraram via Google e ainda não têm senha local. Falha com PASSWORD_ALREADY_SET se já existir senha.',
      security: [{ accessToken: [] }],
      body: setPasswordSchema,
      response: {
        204: noContentSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
      },
    },
    preHandler: [authenticate],
    handler: controller.setPassword.bind(controller),
  })
}
