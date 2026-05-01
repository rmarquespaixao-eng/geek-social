import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService, AccessTokenClaims } from './auth.service.js'
import { AuthError } from './auth.service.js'
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput, ChangePasswordInput, SetPasswordInput, VerifyEmailBody, ResendVerificationInput } from './auth.schema.js'
import crypto from 'node:crypto'

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async register(request: FastifyRequest<{ Body: RegisterInput }>, reply: FastifyReply) {
    try {
      const result = await this.authService.register(request.body)
      const accessToken = await reply.jwtSign(result.accessTokenClaims, { expiresIn: '15m' })
      this.setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt)
      return reply.status(201).send({ accessToken, user: result.user })
    } catch (error) {
      if (error instanceof AuthError && error.code === 'EMAIL_ALREADY_EXISTS') {
        return reply.status(409).send({ error: 'E-mail já cadastrado' })
      }
      throw error
    }
  }

  async login(request: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) {
    try {
      const result = await this.authService.login(request.body)
      const accessToken = await reply.jwtSign(result.accessTokenClaims, { expiresIn: '15m' })
      this.setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt)
      return reply.send({ accessToken, user: result.user })
    } catch (error) {
      if (error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') {
        return reply.status(401).send({ error: 'Credenciais inválidas' })
      }
      throw error
    }
  }

  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const rawToken = request.cookies['refreshToken']
    if (!rawToken) return reply.status(401).send({ error: 'Não autorizado' })

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    try {
      const result = await this.authService.refreshToken(tokenHash)
      const accessToken = await reply.jwtSign(result.accessTokenClaims, { expiresIn: '15m' })
      this.setRefreshCookie(reply, result.newRefreshToken, result.expiresAt)
      return reply.send({ accessToken })
    } catch {
      return reply.status(401).send({ error: 'Sessão expirada' })
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const rawToken = request.cookies['refreshToken']
    if (rawToken) {
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      await this.authService.logout(tokenHash)
    }
    reply.clearCookie('refreshToken', { path: '/auth' })
    return reply.status(204).send()
  }

  async forgotPassword(request: FastifyRequest<{ Body: ForgotPasswordInput }>, reply: FastifyReply) {
    // Fire-and-forget pra não vazar timing oracle de enumeração (auditoria #10).
    // Resposta retorna em ~1ms independente de o e-mail existir.
    this.authService.forgotPassword(request.body)
      .catch(err => request.log.warn({ err }, 'forgotPassword background failed'))
    return reply.send({ message: 'Se o e-mail existir, você receberá as instruções em breve.' })
  }

  async resetPassword(request: FastifyRequest<{ Body: ResetPasswordInput }>, reply: FastifyReply) {
    try {
      await this.authService.resetPassword(request.body)
      return reply.send({ message: 'Senha redefinida com sucesso.' })
    } catch (error) {
      if (error instanceof AuthError && error.code === 'INVALID_RESET_TOKEN') {
        return reply.status(400).send({ error: 'Token inválido ou expirado' })
      }
      throw error
    }
  }

  async changePassword(request: FastifyRequest<{ Body: ChangePasswordInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.authService.changePassword(userId, request.body)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') {
        return reply.status(400).send({ error: 'Senha atual incorreta' })
      }
      throw error
    }
  }

  async verifyEmail(request: FastifyRequest<{ Body: VerifyEmailBody }>, reply: FastifyReply) {
    try {
      await this.authService.confirmEmailVerification(request.body.token)
      return reply.send({ message: 'E-mail verificado com sucesso.' })
    } catch (error) {
      if (error instanceof AuthError && error.code === 'INVALID_VERIFICATION_TOKEN') {
        return reply.status(400).send({ error: 'Token inválido ou expirado' })
      }
      throw error
    }
  }

  async resendVerification(request: FastifyRequest<{ Body: ResendVerificationInput }>, reply: FastifyReply) {
    // Fire-and-forget — mesma razão de forgotPassword (auditoria #10).
    this.authService.resendEmailVerification(request.body.email)
      .catch(err => request.log.warn({ err }, 'resendEmailVerification background failed'))
    return reply.send({ message: 'Se o e-mail existir e ainda não estiver verificado, você receberá novas instruções em breve.' })
  }

  async setPassword(request: FastifyRequest<{ Body: SetPasswordInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.authService.setInitialPassword(userId, request.body)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof AuthError) {
        // Log the specific code server-side but return a generic error to avoid leaking account state
        request.log.warn({ code: error.code, userId }, 'setPassword failed')
        return reply.status(400).send({ error: 'SET_PASSWORD_FAILED' })
      }
      throw error
    }
  }

  async logoutAll(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    await this.authService.logoutAllSessions(userId)
    reply.clearCookie('refreshToken', { path: '/auth' })
    return reply.status(204).send()
  }

  private setRefreshCookie(reply: FastifyReply, token: string, expires: Date) {
    reply.setCookie('refreshToken', token, buildRefreshCookieOpts(expires))
  }
}

// Reaproveitado pelo controller e pela google.strategy: cookie só serve em /auth/*,
// secure controlado por env (não NODE_ENV) pra cobrir staging via HTTPS, e sameSite
// strict em produção.
export function buildRefreshCookieOpts(expires: Date) {
  const isProd = process.env.NODE_ENV === 'production'
  // COOKIE_SECURE override permite forçar secure também em staging com HTTPS sem
  // depender de NODE_ENV='production'.
  const secure = process.env.COOKIE_SECURE === 'true' || isProd
  return {
    httpOnly: true,
    secure,
    sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
    expires,
    path: '/auth',
  }
}
