import * as openidClient from 'openid-client'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { AuthService } from './auth.service.js'
import { AuthError } from './auth.service.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { errorResponseSchema } from './auth.schema.js'

const googleLinkUrlResponseSchema = z.object({
  url: z.string().url().describe('URL de autorização do Google. Frontend deve redirecionar o navegador para ela.'),
})

type GoogleConfig = {
  clientId: string
  clientSecret: string
  appUrl: string
  frontendUrl: string
}

type GoogleStateClaims = {
  mode: 'login' | 'link'
  userId?: string
}

const GOOGLE_ISSUER = new URL('https://accounts.google.com')

export async function registerGoogleRoutes(
  app: FastifyInstance,
  authService: AuthService,
  config: GoogleConfig,
) {
  const redirectUri = `${config.appUrl}/auth/google/callback`

  const oidcConfig = await openidClient.discovery(
    GOOGLE_ISSUER,
    config.clientId,
    { client_secret: config.clientSecret },
    openidClient.ClientSecretPost(config.clientSecret),
  )

  function frontendRedirect(reply: FastifyReply, params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString()
    return reply.redirect(`${config.frontendUrl}/auth/callback?${qs}`)
  }

  function setRefreshCookie(reply: FastifyReply, token: string, expires: Date) {
    reply.setCookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      expires,
      path: '/',
    })
  }

  // Inicia OAuth no modo "login/registro" (público)
  app.get('/auth/google', {
    schema: {
      operationId: 'auth_google_start',
      tags: ['Auth'],
      summary: 'Iniciar OAuth com Google (login/registro)',
      description: 'Redireciona pro Google. Após autorização, callback emite tokens e redireciona pro frontend com `?status=registered|logged-in&token=...`.',
    },
  }, async (_request, reply) => {
    const state = await reply.jwtSign({ mode: 'login' } as GoogleStateClaims, { expiresIn: '5m' })
    const url = openidClient.buildAuthorizationUrl(oidcConfig, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    return reply.redirect(url.toString())
  })

  // Inicia OAuth no modo "link" (autenticado — vincula à conta atual)
  app.get('/auth/google/link', {
    schema: {
      operationId: 'auth_google_link_start',
      tags: ['Auth'],
      summary: 'Iniciar vínculo de conta Google (autenticado)',
      description: 'Retorna a URL de autorização do Google em JSON (não redireciona). Frontend leva o usuário pra essa URL. Callback vai redirecionar com `status=linked` ou erro.',
      security: [{ accessToken: [] }],
      response: {
        200: googleLinkUrlResponseSchema,
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const state = await reply.jwtSign({ mode: 'link', userId } as GoogleStateClaims, { expiresIn: '5m' })
    const url = openidClient.buildAuthorizationUrl(oidcConfig, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    return reply.send({ url: url.toString() })
  })

  app.get('/auth/google/callback', {
    schema: {
      operationId: 'auth_google_callback',
      tags: ['Auth'],
      summary: 'Callback OAuth do Google (não chamar diretamente)',
      description: 'Endpoint chamado pelo Google após autorização. Sempre redireciona pro frontend com query string indicando o resultado: `status=registered|logged-in|linked|linked-login` (sucesso) ou `status=error&code=INVALID_STATE|OAUTH_FAILED|EMAIL_MISSING|LOGIN_FAILED|LINK_FAILED`. Não consome JSON.',
    },
  }, async (request, reply) => {
    const currentUrl = new URL(request.url, config.appUrl)
    const stateToken = currentUrl.searchParams.get('state')

    let claims: GoogleStateClaims
    try {
      if (!stateToken) throw new Error('missing state')
      claims = app.jwt.verify(stateToken) as GoogleStateClaims
    } catch {
      return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'INVALID_STATE' })
    }

    let tokens
    try {
      tokens = await openidClient.authorizationCodeGrant(oidcConfig, currentUrl, {
        expectedState: stateToken!,
      })
    } catch {
      return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'OAUTH_FAILED' })
    }

    const idClaims = tokens.claims()
    const sub = idClaims?.sub
    if (!sub) {
      return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'OAUTH_FAILED' })
    }

    let userinfo
    try {
      userinfo = await openidClient.fetchUserInfo(oidcConfig, tokens.access_token, sub)
    } catch {
      return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'OAUTH_FAILED' })
    }

    const email = (userinfo.email as string | undefined) ?? null
    if (!email) {
      return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'EMAIL_MISSING' })
    }
    const displayName = (userinfo.name ?? userinfo.given_name ?? 'Usuário') as string
    const avatarUrl = (userinfo.picture as string | undefined) ?? null

    if (claims.mode === 'link') {
      if (!claims.userId) {
        return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'INVALID_STATE' })
      }
      try {
        await authService.linkGoogleAccount(claims.userId, userinfo.sub, avatarUrl)
        return frontendRedirect(reply, { provider: 'google', status: 'linked' })
      } catch (err) {
        const code = err instanceof AuthError ? err.code : 'LINK_FAILED'
        return frontendRedirect(reply, { provider: 'google', status: 'error', code })
      }
    }

    try {
      const { result, created, linked } = await authService.loginWithGoogle({
        googleId: userinfo.sub,
        email,
        displayName,
        avatarUrl,
      })
      const accessToken = await reply.jwtSign(result.accessTokenClaims, { expiresIn: '15m' })
      setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt)
      const status = created ? 'registered' : linked ? 'linked-login' : 'logged-in'
      return frontendRedirect(reply, { provider: 'google', status, token: accessToken })
    } catch {
      return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'LOGIN_FAILED' })
    }
  })

  // Desvincular conta Google (autenticado)
  app.delete('/auth/google/link', {
    schema: {
      operationId: 'auth_google_unlink',
      tags: ['Auth'],
      summary: 'Desvincular conta Google (autenticado)',
      description: 'Remove o vínculo entre a conta atual e o Google. Falha se a conta não tiver senha local definida (PASSWORD_REQUIRED_BEFORE_UNLINK), pra evitar conta órfã sem método de login.',
      security: [{ accessToken: [] }],
      response: {
        204: z.void(),
        400: errorResponseSchema,
        404: errorResponseSchema,
        409: errorResponseSchema,
      },
    },
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    try {
      await authService.unlinkGoogleAccount(userId)
      return reply.status(204).send()
    } catch (err) {
      if (err instanceof AuthError) {
        const status = err.code === 'PASSWORD_REQUIRED_BEFORE_UNLINK' ? 409
          : err.code === 'GOOGLE_NOT_LINKED' ? 404
          : err.code === 'USER_NOT_FOUND' ? 404
          : 400
        return reply.status(status).send({ error: err.code })
      }
      throw err
    }
  })
}
