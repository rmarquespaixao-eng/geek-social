import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { AuthService } from './auth.service.js'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { AuthController } from './auth.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { requireFlag } from '../../shared/middleware/require-flag.js'
import { createIpRateLimiter, createUserRateLimiter } from '../../shared/middleware/rate-limit.js'
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  setPasswordSchema,
  verifyEmailBodySchema,
  resendVerificationSchema,
  tokenResponseSchema,
  accessTokenOnlyResponseSchema,
  messageResponseSchema,
  errorResponseSchema,
} from './auth.schema.js'

const noContentSchema = z.void()

const registerRateLimiter = createIpRateLimiter(10, 60 * 1000)
const loginRateLimiter = createIpRateLimiter(5, 60 * 1000)
const forgotRateLimiter = createIpRateLimiter(5, 60 * 1000)
const resetRateLimiter = createIpRateLimiter(5, 60 * 1000)
const resendRateLimiter = createIpRateLimiter(5, 60 * 1000)
// Verify-email tem orçamento próprio: o token é 256-bit random (brute-force inviável),
// então pode ser mais lenient — antes compartilhava com resend e travava o reenvio.
const verifyRateLimiter = createIpRateLimiter(20, 60 * 1000)
// set-password é sensível: JWT vazado + sem rate-limit = hijack de conta. 3/hora por userId.
const setPasswordRateLimiter = createUserRateLimiter(3, 60 * 60 * 1000)
// change-password: JWT vazado + 400/204 distintos permitia brute-force ilimitado da senha
// atual (#4). 5/hora por userId é coerente com setPassword e ainda cobre uso legítimo.
const changePasswordRateLimiter = createUserRateLimiter(5, 60 * 60 * 1000)

export const authRoutes: FastifyPluginAsyncZod<{ authService: AuthService; db: DatabaseClient }> = async (app, options) => {
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
    preHandler: [registerRateLimiter, requireFlag(options.db, 'new_registrations')],
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
    preHandler: [loginRateLimiter],
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
    preHandler: [forgotRateLimiter],
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
    preHandler: [resetRateLimiter],
    handler: controller.resetPassword.bind(controller),
  })

  app.post('/verify-email', {
    schema: {
      operationId: 'auth_verify_email',
      tags: ['Auth'],
      summary: 'Verificar e-mail via token',
      description: 'Consome o token enviado por e-mail no registro. Marca o usuário como emailVerified e invalida o token (single-use, TTL 24h).',
      body: verifyEmailBodySchema,
      response: {
        200: messageResponseSchema,
        400: errorResponseSchema,
      },
    },
    preHandler: [verifyRateLimiter],
    handler: controller.verifyEmail.bind(controller),
  })

  app.post('/resend-verification', {
    schema: {
      operationId: 'auth_resend_verification',
      tags: ['Auth'],
      summary: 'Reenviar e-mail de verificação',
      description: 'Sempre retorna 200 (não revela se o e-mail existe ou se já está verificado). Revoga tokens anteriores e emite um novo.',
      body: resendVerificationSchema,
      response: {
        200: messageResponseSchema,
      },
    },
    preHandler: [resendRateLimiter],
    handler: controller.resendVerification.bind(controller),
  })

  app.put('/change-password', {
    schema: {
      operationId: 'auth_change_password',
      tags: ['Auth'],
      summary: 'Trocar senha (autenticado)',
      description: 'Requer senha atual. Revoga todas as sessões existentes para segurança. Rate-limit: 5/hora por usuário pra evitar brute-force com JWT vazado.',
      security: [{ accessToken: [] }],
      body: changePasswordSchema,
      response: {
        204: noContentSchema,
        400: errorResponseSchema,
      },
    },
    preHandler: [authenticate, changePasswordRateLimiter],
    handler: controller.changePassword.bind(controller),
  })

  app.post('/set-password', {
    schema: {
      operationId: 'auth_set_password',
      tags: ['Auth'],
      summary: 'Definir senha inicial (conta criada via OAuth)',
      description: 'Para usuários que entraram via Google e ainda não têm senha local. Exige token de verificação de e-mail (prova de posse do endereço). Falha com PASSWORD_ALREADY_SET se já existir senha — quem quer trocar usa /change-password.',
      security: [{ accessToken: [] }],
      body: setPasswordSchema,
      response: {
        204: noContentSchema,
        400: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
      },
    },
    preHandler: [authenticate, setPasswordRateLimiter],
    handler: controller.setPassword.bind(controller),
  })

  app.post('/logout-all', {
    schema: {
      operationId: 'auth_logout_all',
      tags: ['Auth'],
      summary: 'Encerrar todas as sessões do usuário',
      description: 'Revoga todos os refresh tokens E incrementa tokenVersion, invalidando todos os JWTs ativos imediatamente. Diferente de /logout (que só sai do dispositivo atual).',
      security: [{ accessToken: [] }],
      response: {
        204: noContentSchema,
      },
    },
    preHandler: [authenticate],
    handler: controller.logoutAll.bind(controller),
  })
}
