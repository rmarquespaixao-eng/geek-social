import * as openidClient from 'openid-client'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { AuthService } from './auth.service.js'
import { AuthError } from './auth.service.js'
import { authenticate } from '../../shared/middleware/authenticate.js'
import { createIpRateLimiter } from '../../shared/middleware/rate-limit.js'
import { errorResponseSchema } from './auth.schema.js'
import { buildRefreshCookieOpts } from './auth.controller.js'

type OAuthCode = { accessToken: string; expiresAt: number }
// ATENÇÃO: estado em memória do processo. Em deploy multi-instância, o callback
// pode emitir o código em Pod A enquanto o POST /auth/exchange cai no Pod B
// (-> 400 INVALID_OAUTH_CODE). Mitigação atual: rodar single-instance, ou usar
// sticky sessions no LB. Solução completa exige Redis (SETEX/GET/DEL). Veja
// docs/security/2026-04-30-auth-audit.md (#5).
const oauthCodes = new Map<string, OAuthCode>()

function startOAuthCodeCleanup() {
  const handle = setInterval(() => {
    const now = Date.now()
    for (const [code, entry] of oauthCodes.entries()) {
      if (entry.expiresAt <= now) {
        oauthCodes.delete(code)
      }
    }
  }, 60 * 1000)
  if (typeof handle.unref === 'function') handle.unref()
  return handle
}

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

const exchangeRateLimiter = createIpRateLimiter(5, 60 * 1000)

export async function registerGoogleRoutes(
  app: FastifyInstance,
  authService: AuthService,
  config: GoogleConfig,
) {
  const cleanupHandle = startOAuthCodeCleanup()
  app.addHook('onClose', async () => { clearInterval(cleanupHandle) })
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

  function issueOAuthCode(accessToken: string): string {
    const code = randomUUID()
    oauthCodes.set(code, { accessToken, expiresAt: Date.now() + 30_000 })
    return code
  }

  function setRefreshCookie(reply: FastifyReply, token: string, expires: Date) {
    reply.setCookie('refreshToken', token, buildRefreshCookieOpts(expires))
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
    const emailVerified = (userinfo.email_verified as boolean | undefined) === true
      || (idClaims?.email_verified as boolean | undefined) === true
    const displayName = (userinfo.name ?? userinfo.given_name ?? 'Usuário') as string
    const avatarUrl = (userinfo.picture as string | undefined) ?? null

    if (claims.mode === 'link') {
      if (!claims.userId) {
        return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'INVALID_STATE' })
      }
      try {
        await authService.linkGoogleAccount({
          userId: claims.userId,
          googleId: userinfo.sub,
          email,
          emailVerified,
          avatarUrl,
        })
        return frontendRedirect(reply, { provider: 'google', status: 'linked' })
      } catch (err) {
        const code = err instanceof AuthError ? err.code : 'LINK_FAILED'
        return frontendRedirect(reply, { provider: 'google', status: 'error', code })
      }
    }

    try {
      const { result, created } = await authService.loginWithGoogle({
        googleId: userinfo.sub,
        email,
        emailVerified,
        displayName,
        avatarUrl,
      })
      const accessToken = await reply.jwtSign(result.accessTokenClaims, { expiresIn: '15m' })
      setRefreshCookie(reply, result.refreshToken, result.refreshTokenExpiresAt)
      const status = created ? 'registered' : 'logged-in'
      const code = issueOAuthCode(accessToken)
      return frontendRedirect(reply, { provider: 'google', status, code })
    } catch (err) {
      if (err instanceof AuthError) {
        return frontendRedirect(reply, { provider: 'google', status: 'error', code: err.code })
      }
      return frontendRedirect(reply, { provider: 'google', status: 'error', code: 'LOGIN_FAILED' })
    }
  })

  app.post('/auth/exchange', {
    schema: {
      operationId: 'auth_exchange',
      tags: ['Auth'],
      summary: 'Trocar código OAuth efêmero por access token',
      description: 'Troca um código de uso único (válido por 30s) emitido pelo callback OAuth pelo JWT de acesso. O código é invalidado após o primeiro uso.',
      body: z.object({ code: z.string().uuid() }),
      response: {
        200: z.object({ accessToken: z.string() }),
        400: errorResponseSchema,
      },
    },
    preHandler: [exchangeRateLimiter],
  }, async (request, reply) => {
    const { code } = request.body as { code: string }
    const entry = oauthCodes.get(code)
    if (!entry || Date.now() > entry.expiresAt) {
      oauthCodes.delete(code)
      return reply.status(400).send({ error: 'INVALID_OAUTH_CODE' })
    }
    oauthCodes.delete(code)
    return reply.send({ accessToken: entry.accessToken })
  })

  app.post('/auth/link-google', {
    schema: {
      operationId: 'auth_link_google',
      tags: ['Auth'],
      summary: 'Vincular conta Google à conta atual (autenticado)',
      description: 'Recebe authorization code e o state JWT gerado por /auth/google/link. Troca pelo profile, valida que o e-mail é verificado pelo Google e bate com o e-mail da conta autenticada, e salva o googleId. Falha se o googleId já estiver vinculado a outra conta.',
      security: [{ accessToken: [] }],
      body: z.object({
        code: z.string().min(1),
        // state JWT emitido por /auth/google/link — obrigatório para verificar CSRF OAuth.
        state: z.string().min(1),
        redirectUri: z.string().url().optional(),
      }),
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
    const { code, state, redirectUri: bodyRedirectUri } = request.body as { code: string; state: string; redirectUri?: string }

    // Verificar state JWT para prevenir CSRF OAuth (G1-27).
    let stateClaims: GoogleStateClaims
    try {
      stateClaims = app.jwt.verify(state) as GoogleStateClaims
    } catch {
      return reply.status(400).send({ error: 'INVALID_STATE' })
    }
    if (stateClaims.mode !== 'link' || stateClaims.userId !== userId) {
      return reply.status(400).send({ error: 'INVALID_STATE' })
    }

    const usedRedirectUri = bodyRedirectUri ?? redirectUri

    const exchangeUrl = new URL(usedRedirectUri)
    exchangeUrl.searchParams.set('code', code)
    exchangeUrl.searchParams.set('state', state)

    let tokens
    try {
      tokens = await openidClient.authorizationCodeGrant(oidcConfig, exchangeUrl, {
        expectedState: state,
      })
    } catch {
      return reply.status(400).send({ error: 'OAUTH_FAILED' })
    }

    const idClaims = tokens.claims()
    const sub = idClaims?.sub
    if (!sub) {
      return reply.status(400).send({ error: 'OAUTH_FAILED' })
    }

    let userinfo
    try {
      userinfo = await openidClient.fetchUserInfo(oidcConfig, tokens.access_token, sub)
    } catch {
      return reply.status(400).send({ error: 'OAUTH_FAILED' })
    }

    const email = (userinfo.email as string | undefined) ?? null
    if (!email) {
      return reply.status(400).send({ error: 'EMAIL_MISSING' })
    }
    const emailVerified = (userinfo.email_verified as boolean | undefined) === true
      || (idClaims?.email_verified as boolean | undefined) === true
    const avatarUrl = (userinfo.picture as string | undefined) ?? null

    try {
      await authService.linkGoogleAccount({
        userId,
        googleId: userinfo.sub,
        email,
        emailVerified,
        avatarUrl,
      })
      return reply.status(204).send()
    } catch (err) {
      if (err instanceof AuthError) {
        const status = err.code === 'GOOGLE_ALREADY_LINKED_TO_OTHER_USER' ? 409
          : err.code === 'OAUTH_EMAIL_NOT_VERIFIED' ? 400
          : err.code === 'OAUTH_EMAIL_MISMATCH' ? 400
          : err.code === 'USER_NOT_FOUND' ? 404
          : 400
        return reply.status(status).send({ error: err.code })
      }
      throw err
    }
  })

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
