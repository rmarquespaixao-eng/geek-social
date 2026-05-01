import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import { SteamService, SteamError } from './steam.service.js'
import type { IOpenIdVerifier } from '../../../shared/contracts/openid-verifier.contract.js'
import type { IImportBatchFinalizationRepository } from '../../../shared/contracts/import-batch-finalization.repository.contract.js'
import type { IJobsQueue } from '../../../shared/contracts/jobs-queue.contract.js'
import { startImportSchema } from './steam.schema.js'
import type { AccessTokenClaims } from '../../auth/auth.service.js'

const STATE_TTL = '5m'

export type SteamControllerConfig = {
  apiUrl: string
  frontendUrl: string
  jwtSign: (payload: object, options?: { expiresIn?: string }) => string
  jwtVerify: (token: string) => unknown
}

function mapErrorToHttp(err: unknown): { status: number; code: string } {
  if (err instanceof SteamError) {
    const map: Record<string, number> = {
      USER_NOT_FOUND: 404,
      STEAM_NOT_LINKED: 400,
      STEAM_API_KEY_MISSING: 400,
      STEAM_API_KEY_INVALID_FORMAT: 422,
      STEAM_ALREADY_LINKED_TO_OTHER_USER: 409,
      STEAM_REPLACE_REQUIRES_UNLINK: 409,
      STEAM_PROFILE_PRIVATE: 422,
      STEAM_AUTH_FAILED: 502,
      IMPORT_NO_GAMES_SELECTED: 400,
      IMPORT_DESTINATION_REQUIRED: 400,
      IMPORT_INVALID_COLLECTION_NAME: 400,
      IMPORT_COLLECTION_NOT_FOUND: 404,
      IMPORT_COLLECTION_NOT_OWNED: 403,
      IMPORT_COLLECTION_NOT_GAMES_TYPE: 400,
      IMPORT_ALREADY_IN_PROGRESS: 409,
    }
    return { status: map[err.code] ?? 500, code: err.code }
  }
  return { status: 500, code: 'INTERNAL_ERROR' }
}

export class SteamController {
  constructor(
    private readonly service: SteamService,
    private readonly openId: IOpenIdVerifier,
    private readonly finalizationRepo: IImportBatchFinalizationRepository,
    private readonly jobs: IJobsQueue,
    private readonly cfg: SteamControllerConfig,
  ) {}

  async login(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const state = this.cfg.jwtSign({ userId, type: 'steam-link' }, { expiresIn: STATE_TTL })
    const returnTo = `${this.cfg.apiUrl}/integrations/steam/callback?state=${encodeURIComponent(state)}`
    const authUrl = this.openId.buildAuthUrl(returnTo, this.cfg.apiUrl)
    return reply.send({ url: authUrl })
  }

  async callback(request: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
    const query = request.query
    const state = query.state
    const redirectError = (code: string) =>
      reply.redirect(`${this.cfg.frontendUrl}/settings?steam=error&code=${code}`)

    if (!state) return redirectError('MISSING_STATE')
    let claims: { userId?: string; type?: string }
    try {
      claims = this.cfg.jwtVerify(state) as { userId?: string; type?: string }
    } catch {
      return redirectError('STEAM_OPENID_INVALID')
    }
    if (!claims.userId || claims.type !== 'steam-link') return redirectError('STEAM_OPENID_INVALID')

    const verified = await this.openId.verifyResponse(query)
    if (!verified) return redirectError('STEAM_OPENID_INVALID')

    try {
      await this.service.linkAccount(claims.userId, verified.steamId)
      return reply.redirect(`${this.cfg.frontendUrl}/settings?steam=connected`)
    } catch (err) {
      const mapped = mapErrorToHttp(err)
      return redirectError(mapped.code)
    }
  }

  async unlink(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    await this.service.unlinkAccount(userId)
    return reply.status(204).send()
  }

  async setApiKey(request: FastifyRequest<{ Body: { apiKey: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const apiKey = (request.body?.apiKey ?? '').toString()
    try {
      await this.service.setApiKey(userId, apiKey)
      return reply.status(204).send()
    } catch (err) {
      const m = mapErrorToHttp(err)
      return reply.status(m.status).send({ error: m.code })
    }
  }

  async clearApiKey(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    await this.service.clearApiKey(userId)
    return reply.status(204).send()
  }

  async listGames(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const games = await this.service.listOwnedGames(userId)
      return reply.send({ games })
    } catch (err) {
      const mapped = mapErrorToHttp(err)
      return reply.status(mapped.status).send({ error: mapped.code })
    }
  }

  async startImport(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = startImportSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'INVALID_BODY', details: parsed.error.flatten() })
    }
    const body = parsed.data
    const destination = body.collectionId
      ? { collectionId: body.collectionId }
      : { newCollectionName: body.newCollectionName! }

    try {
      const result = await this.service.startImport(
        userId,
        destination,
        body.appIds,
        body.gamesSnapshot,
      )
      return reply.send(result)
    } catch (err) {
      const mapped = mapErrorToHttp(err)
      return reply.status(mapped.status).send({ error: mapped.code })
    }
  }

  async getImportStatus(request: FastifyRequest<{ Params: { batchId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const { batchId } = request.params
    const finalized = await this.finalizationRepo.findByBatchId(batchId)
    if (finalized) {
      if (finalized.userId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN' })
      }
      return reply.send({
        batchId, total: finalized.total,
        completed: finalized.imported + finalized.updated,
        failed: finalized.failed,
        stage: 'done', collectionId: finalized.collectionId,
        finishedAt: finalized.finalizedAt.toISOString(),
      })
    }
    const stats = await this.jobs.getBatchStats(batchId)
    if (stats.totalImports === 0) {
      return reply.status(404).send({ error: 'BATCH_NOT_FOUND' })
    }
    if (stats.userId && stats.userId !== userId) {
      return reply.status(403).send({ error: 'FORBIDDEN' })
    }
    const totalDone = stats.completedImports + stats.failedImports
    const stillImporting = totalDone < stats.totalImports
    return reply.send({
      batchId,
      total: stats.totalImports,
      completed: stats.completedImports,
      failed: stats.failedImports,
      stage: stillImporting ? 'importing' : 'done',
      collectionId: null,
      finishedAt: null,
    })
  }
}

import { authenticate } from '../../../shared/middleware/authenticate.js'
import { z } from 'zod'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

const noContent = z.void()
const setApiKeyBody = z.object({ apiKey: z.string().length(32, 'Chave inválida (Steam Web API key tem 32 chars)') })
const importBatchParam = z.object({ batchId: z.string().uuid() })

export const steamRoutes: FastifyPluginAsyncZod<{ controller: SteamController }> = async (app, opts) => {
  app.post('/login', {
    schema: {
      operationId: 'steam_login',
      tags: ['Steam'],
      summary: 'Iniciar vínculo Steam (OpenID)',
      description: 'Retorna URL de autenticação OpenID. Frontend redireciona usuário pra ela. Callback faz o link.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
  }, opts.controller.login.bind(opts.controller))

  app.get('/callback', {
    schema: {
      operationId: 'steam_callback',
      tags: ['Steam'],
      summary: 'Callback OpenID Steam (não chamar diretamente)',
      description: 'Endpoint chamado pelo Steam após autenticação OpenID. Vincula steam_id à conta + redireciona pro frontend com status.',
    },
  }, opts.controller.callback.bind(opts.controller))

  app.delete('/link', {
    schema: {
      operationId: 'steam_unlink',
      tags: ['Steam'],
      summary: 'Desvincular Steam',
      description: 'Limpa users.steam_id, steam_linked_at e steam_api_key. Itens já importados ficam preservados nas coleções.',
      security: [{ accessToken: [] }],
      response: { 204: noContent },
    },
    preHandler: [authenticate],
  }, opts.controller.unlink.bind(opts.controller))

  app.put('/api-key', {
    schema: {
      operationId: 'steam_set_api_key',
      tags: ['Steam'],
      summary: 'Definir Steam Web API key do user',
      description: 'Necessária pra importação (api.steampowered.com não permite consultas anônimas). User obtém em https://steamcommunity.com/dev/apikey. 32 chars hex.',
      security: [{ accessToken: [] }],
      body: setApiKeyBody,
    },
    preHandler: [authenticate],
  }, opts.controller.setApiKey.bind(opts.controller))

  app.delete('/api-key', {
    schema: {
      operationId: 'steam_clear_api_key',
      tags: ['Steam'],
      summary: 'Limpar API key salva',
      description: 'Remove steam_api_key. Importação fica indisponível até nova key ser setada.',
      security: [{ accessToken: [] }],
      response: { 204: noContent },
    },
    preHandler: [authenticate],
  }, opts.controller.clearApiKey.bind(opts.controller))

  app.get('/games', {
    schema: {
      operationId: 'steam_list_games',
      tags: ['Steam'],
      summary: 'Listar jogos owned pelo usuário no Steam',
      description: 'Chama GetOwnedGames da Steam Web API com a key salva. Resposta inclui appId, name, playtimeForever, iconUrl. Falha com STEAM_PROFILE_PRIVATE se perfil não público.',
      security: [{ accessToken: [] }],
    },
    preHandler: [authenticate],
  }, opts.controller.listGames.bind(opts.controller))

  app.post('/import', {
    schema: {
      operationId: 'steam_import_start',
      tags: ['Steam'],
      summary: 'Iniciar importação de jogos selecionados',
      description: 'Recebe appIds + collection destino (existente ou nova). Cria batch_id, enfileira jobs steam.import-game (1 por appId), e enrich-game subsequente. Retorna { batchId } pra polling.',
      security: [{ accessToken: [] }],
      body: startImportSchema,
    },
    preHandler: [authenticate],
  }, opts.controller.startImport.bind(opts.controller))

  app.get('/import/:batchId/status', {
    schema: {
      operationId: 'steam_import_status',
      tags: ['Steam'],
      summary: 'Status da importação',
      description: 'Polling: retorna { total, processed, failed, finalized, finalizedAt? }. Frontend usa pra progress bar — recomenda-se também observar socket events import:progress / import:done.',
      security: [{ accessToken: [] }],
      params: importBatchParam,
    },
    preHandler: [authenticate],
  }, opts.controller.getImportStatus.bind(opts.controller))
}
