import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthService, AccessTokenClaims } from './auth.service.js'
import { AuthError } from './auth.service.js'
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput, ChangePasswordInput, SetPasswordInput } from './auth.schema.js'
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
    reply.clearCookie('refreshToken')
    return reply.status(204).send()
  }

  async forgotPassword(request: FastifyRequest<{ Body: ForgotPasswordInput }>, reply: FastifyReply) {
    await this.authService.forgotPassword(request.body)
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

  async setPassword(request: FastifyRequest<{ Body: SetPasswordInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.authService.setInitialPassword(userId, request.body)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.code === 'PASSWORD_ALREADY_SET') {
          return reply.status(409).send({ error: 'PASSWORD_ALREADY_SET' })
        }
        if (error.code === 'USER_NOT_FOUND') {
          return reply.status(404).send({ error: 'USER_NOT_FOUND' })
        }
      }
      throw error
    }
  }

  private setRefreshCookie(reply: FastifyReply, token: string, expires: Date) {
    reply.setCookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      expires,
      path: '/',
    })
  }
}
