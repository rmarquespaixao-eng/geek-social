import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import fastifyMultipart from '@fastify/multipart'
import fastifyCors from '@fastify/cors'
import fastifySwagger from '@fastify/swagger'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { env } from './config/env.js'
import { createDatabaseClient } from './shared/infra/database/postgres.client.js'
import { UserRepository } from './modules/auth/auth.repository.js'
import { UsersRepository } from './modules/users/users.repository.js'
import { FieldDefinitionRepository } from './modules/field-definitions/field-definitions.repository.js'
import { seedFieldDefinitions } from './shared/infra/database/seeds/field-definitions.seed.js'
import { S3Adapter } from './shared/infra/storage/s3.adapter.js'
import { SESAdapter } from './shared/infra/email/ses.adapter.js'
import { ConsoleEmailAdapter } from './shared/infra/email/console.adapter.js'
import { AuthService } from './modules/auth/auth.service.js'
import { UsersService } from './modules/users/users.service.js'
import { FieldDefinitionsService } from './modules/field-definitions/field-definitions.service.js'
import { fieldDefinitionsRoutes } from './modules/field-definitions/field-definitions.routes.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { usersRoutes } from './modules/users/users.routes.js'
import { CollectionsRepository } from './modules/collections/collections.repository.js'
import { CollectionsService } from './modules/collections/collections.service.js'
import { collectionsRoutes, collectionsPublicRoutes } from './modules/collections/collections.routes.js'
import { ItemsRepository } from './modules/items/items.repository.js'
import { ItemsService } from './modules/items/items.service.js'
import { itemsRoutes, itemsPublicRoutes } from './modules/items/items.routes.js'
import { ListingsRepository } from './modules/listings/listings.repository.js'
import { ListingsService } from './modules/listings/listings.service.js'
import { listingsRoutes, marketplaceRoutes } from './modules/listings/listings.routes.js'
import { ListingRatingsRepository } from './modules/listing-ratings/listing-ratings.repository.js'
import { ListingRatingsService } from './modules/listing-ratings/listing-ratings.service.js'
import { listingRatingsRoutes } from './modules/listing-ratings/listing-ratings.routes.js'
import { FriendsRepository } from './modules/friends/friends.repository.js'
import { FriendsService } from './modules/friends/friends.service.js'
import { friendsRoutes, blocksRoutes } from './modules/friends/friends.routes.js'
import { PostsRepository } from './modules/posts/posts.repository.js'
import { PostsService } from './modules/posts/posts.service.js'
import { CommentsRepository } from './modules/posts/comments.repository.js'
import { CommentsService } from './modules/posts/comments.service.js'
import { ReactionsRepository } from './modules/posts/reactions.repository.js'
import { ReactionsService } from './modules/posts/reactions.service.js'
import { FeedRepository } from './modules/posts/feed.repository.js'
import { FeedService } from './modules/posts/feed.service.js'
import { postsRoutes } from './modules/posts/posts.routes.js'
import { commentsRoutes } from './modules/posts/comments.routes.js'
import { reactionsRoutes } from './modules/posts/reactions.routes.js'
import { feedRoutes, profilePostsRoutes } from './modules/posts/feed.routes.js'
import { ConversationsRepository } from './modules/chat/conversations.repository.js'
import { ConversationsService } from './modules/chat/conversations.service.js'
import { MessagesRepository } from './modules/chat/messages.repository.js'
import { MessagesService } from './modules/chat/messages.service.js'
import { DmRequestsRepository } from './modules/chat/dm-requests.repository.js'
import { DmRequestsService } from './modules/chat/dm-requests.service.js'
import { PresenceRepository } from './modules/chat/presence.repository.js'
import { PresenceService } from './modules/chat/presence.service.js'
import { PushRepository } from './modules/chat/push.repository.js'
import { PushService } from './modules/chat/push.service.js'
import { ChatGateway } from './modules/chat/chat.gateway.js'
import { chatRoutes } from './modules/chat/chat.routes.js'
import { NotificationsRepository } from './modules/notifications/notifications.repository.js'
import { NotificationsService } from './modules/notifications/notifications.service.js'
import { notificationsRoutes } from './modules/notifications/notifications.routes.js'
import { ReportsRepository } from './modules/reports/reports.repository.js'
import { ReportsService } from './modules/reports/reports.service.js'
import { reportsRoutes } from './modules/reports/reports.routes.js'
import { OffersRepository } from './modules/offers/offers.repository.js'
import { OffersService } from './modules/offers/offers.service.js'
import { OfferProposalsRepository } from './modules/offers/offer-proposals.repository.js'
import { offersRoutes } from './modules/offers/offers.routes.js'
import { PgBossAdapter } from './shared/infra/jobs/pgboss.adapter.js'
import { runTemporaryCleanupRead, runTemporaryCleanupTtl } from './shared/infra/jobs/temporary-cleanup.cron.js'
import { runOffersExpire } from './shared/infra/jobs/offers-expire.cron.js'
import { SteamApiClient } from './modules/integrations/steam/steam.api.client.js'
import { SteamOpenIdAdapter } from './modules/integrations/steam/steam.openid.adapter.js'
import { SteamService } from './modules/integrations/steam/steam.service.js'
import { SteamController, steamRoutes } from './modules/integrations/steam/steam.controller.js'
import { ImportBatchFinalizationRepository } from './modules/integrations/steam/import-batch-finalization.repository.js'
import { createSteamImportGameWorker } from './shared/infra/jobs/workers/steam-import-game.worker.js'
import { createSteamEnrichGameWorker } from './shared/infra/jobs/workers/steam-enrich-game.worker.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Geek Social API',
        version: '1.0.0',
        description: 'API REST do Geek Social — rede social para gamers e colecionadores.',
      },
      servers: [
        { url: 'http://localhost:3003', description: 'Dev local' },
      ],
      tags: [
        { name: 'Auth', description: 'Autenticação, registro, OAuth, recuperação de senha' },
      ],
      components: {
        securitySchemes: {
          accessToken: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token enviado no header Authorization. Obtido via /auth/login.',
          },
          refreshCookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'refreshToken',
            description: 'HttpOnly cookie usado em /auth/refresh.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  })

  if (process.env.NODE_ENV !== 'production') {
    app.get('/docs/json', async () => app.swagger())
  }

  await app.register(fastifyCors, {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  await app.register(fastifyJwt, { secret: env.JWT_SECRET })
  await app.register(fastifyCookie)
  await app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024, files: 10 } })

  const db = createDatabaseClient(env.DATABASE_URL)

  await migrate(db, { migrationsFolder: join(__dirname, 'shared/infra/database/migrations') })

  const fieldDefinitionRepository = new FieldDefinitionRepository(db)
  await seedFieldDefinitions(fieldDefinitionRepository)
  const fieldDefinitionsService = new FieldDefinitionsService(fieldDefinitionRepository)

  const userRepository = new UserRepository(db)
  const usersRepository = new UsersRepository(db)
  const storageService = new S3Adapter({
    bucketName: env.S3_BUCKET_NAME,
    region: env.AWS_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    endpoint: env.STORAGE_ENDPOINT,
    publicUrl: env.STORAGE_PUBLIC_URL,
  })
  const emailService = env.AWS_ACCESS_KEY_ID && !env.STORAGE_ENDPOINT
    ? new SESAdapter(env.SES_FROM_EMAIL, env.AWS_REGION, env.AWS_ACCESS_KEY_ID, env.AWS_SECRET_ACCESS_KEY)
    : new ConsoleEmailAdapter()
  const authService = new AuthService(userRepository, emailService, {
    appUrl: env.APP_URL,
    jwtSecret: env.JWT_SECRET,
    refreshTokenExpiresDays: env.REFRESH_TOKEN_EXPIRES_DAYS,
  })

  const friendsRepository = new FriendsRepository(db)
  const friendsService = new FriendsService(friendsRepository)

  const presenceRepository = new PresenceRepository(db)
  const presenceService = new PresenceService(presenceRepository)

  const usersService = new UsersService(usersRepository, storageService, friendsRepository, presenceService)

  const collectionsRepository = new CollectionsRepository(db)
  const collectionsService = new CollectionsService(
    collectionsRepository,
    fieldDefinitionRepository,
    storageService,
    friendsRepository,
    usersRepository,
  )

  const postsRepository = new PostsRepository(db)
  const feedRepository = new FeedRepository(db)
  const postsService = new PostsService(postsRepository, storageService, friendsRepository, feedRepository)

  const commentsRepository = new CommentsRepository(db)
  const commentsService = new CommentsService(commentsRepository, postsRepository, friendsRepository)

  const reactionsRepository = new ReactionsRepository(db)
  const reactionsService = new ReactionsService(reactionsRepository, postsRepository, friendsRepository)

  const feedService = new FeedService(feedRepository, friendsRepository, usersRepository)

  const itemsRepository = new ItemsRepository(db)
  const itemsService = new ItemsService(itemsRepository, collectionsRepository, storageService, friendsRepository, postsService)

  await app.register(authRoutes, { prefix: '/auth', authService })
  await app.register(usersRoutes, { prefix: '/users', usersService })
  await app.register(fieldDefinitionsRoutes, { prefix: '/field-definitions', fieldDefinitionsService })
  await app.register(collectionsRoutes, { prefix: '/collections', collectionsService })
  await app.register(collectionsPublicRoutes, { prefix: '/users', collectionsService })
  await app.register(itemsRoutes, { prefix: '/collections', itemsService })
  await app.register(itemsPublicRoutes, { prefix: '/users', itemsService })
  await app.register(friendsRoutes, { prefix: '/friends', friendsService })
  await app.register(blocksRoutes, { prefix: '/blocks', friendsService })
  await app.register(postsRoutes, { prefix: '/posts', postsService })
  await app.register(commentsRoutes, { prefix: '/posts', commentsService })
  await app.register(reactionsRoutes, { prefix: '/posts', reactionsService })
  await app.register(feedRoutes, { prefix: '/feed', feedService })
  await app.register(profilePostsRoutes, { prefix: '/users', feedService })

  // Chat
  PushService.configure(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_CONTACT)

  const conversationsRepository = new ConversationsRepository(db)
  const conversationsService = new ConversationsService(
    conversationsRepository,
    friendsRepository,
    storageService,
    presenceService,
    usersRepository,
  )

  const messagesRepository = new MessagesRepository(db)
  const messagesService = new MessagesService(messagesRepository, conversationsRepository, storageService, friendsRepository)

  // Notifications precisa existir antes de DmRequestsService (que recebe como dep)
  const notificationsRepository = new NotificationsRepository(db)
  const notificationsService = new NotificationsService(notificationsRepository)

  const dmRequestsRepository = new DmRequestsRepository(db)
  const dmRequestsService = new DmRequestsService(dmRequestsRepository, conversationsRepository, friendsRepository, notificationsService)

  const pushRepository = new PushRepository(db)
  const pushService = new PushService(pushRepository)

  const chatGateway = new ChatGateway(
    app.server,
    conversationsService,
    messagesService,
    presenceService,
    pushService,
    friendsRepository,
    usersRepository,
    (token: string) => app.jwt.verify(token) as { userId: string },
  )

  await app.register(chatRoutes, {
    prefix: '/chat',
    conversationsService,
    messagesService,
    dmRequestsService,
    pushService,
    chatGateway,
    usersRepository,
    friendsService,
  })

  const reportsRepository = new ReportsRepository(db)
  const reportsService = new ReportsService(reportsRepository)

  const listingsRepository = new ListingsRepository(db)
  const listingsService = new ListingsService(listingsRepository, itemsRepository, friendsRepository)

  const offersRepository = new OffersRepository(db)
  const offerProposalsRepository = new OfferProposalsRepository(db)
  const offersService = new OffersService(offersRepository, itemsRepository, collectionsRepository, friendsRepository, notificationsService, listingsService, offerProposalsRepository, collectionsService)
  // Quebra a dependência circular: ListingsService precisa rejeitar ofertas pendentes ao encerrar/excluir
  listingsService.setOffersIntegration(offersRepository, notificationsService)

  const listingRatingsRepository = new ListingRatingsRepository(db)
  const listingRatingsService = new ListingRatingsService(listingRatingsRepository, offersRepository, notificationsService)
  notificationsService.setEmitter((userId, notification) => chatGateway.emitNotification(userId, notification))

  // Cron de limpeza do chat temporário (DMs)
  const tempCleanupDeps = { conversationsService, messagesService, chatGateway }
  const tempReadInterval = setInterval(() => {
    runTemporaryCleanupRead(tempCleanupDeps).catch(err => app.log.error({ err }, 'temporary-cleanup-read failed'))
  }, 60 * 1000)
  const tempTtlInterval = setInterval(() => {
    runTemporaryCleanupTtl(tempCleanupDeps).catch(err => app.log.error({ err }, 'temporary-cleanup-ttl failed'))
  }, 60 * 60 * 1000)
  // Cron de expiração de ofertas accepted (7 dias) — roda a cada 1h
  const offersExpireInterval = setInterval(() => {
    runOffersExpire({ offersService }).catch(err => app.log.error({ err }, 'offers-expire failed'))
  }, 60 * 60 * 1000)
  app.addHook('onClose', async () => {
    clearInterval(tempReadInterval)
    clearInterval(tempTtlInterval)
    clearInterval(offersExpireInterval)
  })

  // Hook notifications into friends events
  const originalSendRequest = friendsService.sendRequest.bind(friendsService)
  friendsService.sendRequest = async (requesterId, receiverId) => {
    const result = await originalSendRequest(requesterId, receiverId)
    notificationsService.notify({ recipientId: receiverId, actorId: requesterId, type: 'friend_request', entityId: result.id }).catch(() => {})
    return result
  }

  const originalAcceptRequest = friendsService.acceptRequest.bind(friendsService)
  friendsService.acceptRequest = async (userId, requestId) => {
    const result = await originalAcceptRequest(userId, requestId)
    notificationsService.notify({ recipientId: result.requesterId, actorId: userId, type: 'friend_accepted', entityId: result.id }).catch(() => {})
    chatGateway.linkFriendship(result.requesterId, userId).catch(() => {})
    return result
  }

  // Hook notifications into comments
  const originalAddComment = commentsService.addComment.bind(commentsService)
  commentsService.addComment = async (userId, postId, content) => {
    const comment = await originalAddComment(userId, postId, content)
    const post = await postsRepository.findById(postId)
    if (post && post.userId !== userId) {
      notificationsService.notify({ recipientId: post.userId, actorId: userId, type: 'post_comment', entityId: postId }).catch(() => {})
    }
    return comment
  }

  // Hook notifications into reactions
  const originalReact = reactionsService.react.bind(reactionsService)
  reactionsService.react = async (userId, postId, type) => {
    const counts = await originalReact(userId, postId, type)
    const post = await postsRepository.findById(postId)
    if (post && post.userId !== userId) {
      notificationsService.notify({ recipientId: post.userId, actorId: userId, type: 'post_reaction', entityId: postId }).catch(() => {})
    }
    return counts
  }

  // Hook block/unblock para sinalizar atualização das conversas dos dois lados
  const originalBlock = friendsService.block.bind(friendsService)
  friendsService.block = async (blockerId, blockedId) => {
    await originalBlock(blockerId, blockedId)
    chatGateway.emitConversationsRefresh([blockerId, blockedId])
    chatGateway.unlinkFriendship(blockerId, blockedId).catch(() => {})
  }

  const originalUnblock = friendsService.unblock.bind(friendsService)
  friendsService.unblock = async (blockerId, blockedId) => {
    await originalUnblock(blockerId, blockedId)
    chatGateway.emitConversationsRefresh([blockerId, blockedId])
  }

  // Hook usersService.updateSettings para sinalizar mudanças de presença e leitura
  const originalUpdateSettings = usersService.updateSettings.bind(usersService)
  usersService.updateSettings = async (userId, patch) => {
    const before = await usersRepository.findById(userId)
    const result = await originalUpdateSettings(userId, patch)
    if (before) {
      if (patch.showPresence !== undefined && patch.showPresence !== before.showPresence) {
        const isOnline = patch.showPresence ? presenceService.isOnline(userId) : false
        chatGateway.emitPresenceUpdate(userId, isOnline, null)
      }
      if (patch.showReadReceipts !== undefined && patch.showReadReceipts !== before.showReadReceipts) {
        chatGateway.refreshConversationsForUserAndPeers(userId).catch(() => {})
      }
    }
    return result
  }

  const originalRemoveFriend = friendsService.removeFriend.bind(friendsService)
  friendsService.removeFriend = async (userId, friendId) => {
    await originalRemoveFriend(userId, friendId)
    chatGateway.unlinkFriendship(userId, friendId).catch(() => {})
  }

  await app.register(notificationsRoutes, { prefix: '/notifications', notificationsService })
  await app.register(reportsRoutes, { prefix: '/reports', reportsService })
  await app.register(offersRoutes, { prefix: '/offers', offersService })
  await app.register(listingsRoutes, { prefix: '/listings', listingsService })
  await app.register(marketplaceRoutes, { prefix: '/marketplace', listingsService })
  await app.register(listingRatingsRoutes, { prefix: '/ratings', listingRatingsService })

  // Steam integration (opcional — exige fila; STEAM_WEB_API_KEY pode estar vazia (link funciona, import falha com STEAM_AUTH_FAILED))
  if (env.JOBS_DATABASE_URL) {
    const jobsQueue = new PgBossAdapter(env.JOBS_DATABASE_URL)
    await jobsQueue.start()

    const steamApiClient = new SteamApiClient()
    const openIdVerifier = new SteamOpenIdAdapter()
    const finalizationRepo = new ImportBatchFinalizationRepository(db)

    const steamService = new SteamService(
      usersRepository,
      collectionsRepository,
      itemsRepository,
      fieldDefinitionRepository,
      steamApiClient,
      openIdVerifier,
      jobsQueue,
    )

    const importEmitter = {
      emitProgress: (uid: string, payload: unknown) => chatGateway.emitImportProgress(uid, payload),
      emitDone: (uid: string, payload: unknown) => chatGateway.emitImportDone(uid, payload),
    }

    const importHandler = createSteamImportGameWorker({
      jobs: jobsQueue,
      steamApi: steamApiClient,
      itemsRepo: itemsRepository,
      collectionsRepo: collectionsRepository,
      usersRepo: usersRepository,
      storage: storageService,
      emitter: importEmitter,
    })
    await jobsQueue.registerWorker('steam.import-game', importHandler, { teamConcurrency: 4 })

    const enrichHandler = createSteamEnrichGameWorker({
      jobs: jobsQueue,
      steamApi: steamApiClient,
      itemsRepo: itemsRepository,
      emitter: importEmitter,
      finalizationRepo,
      notifyOnDone: async ({ userId, collectionId, failed }) => {
        await notificationsService.notifySelf({
          userId,
          type: failed === 0 ? 'steam_import_done' : 'steam_import_partial',
          entityId: collectionId,
        })
      },
      batchStartedAtMs: () => Date.now(),
    })
    // Throttle global do appdetails: 1 worker, 1 concorrente.
    await jobsQueue.registerWorker('steam.enrich-game', enrichHandler, { teamConcurrency: 1 })

    const steamController = new SteamController(
      steamService,
      openIdVerifier,
      finalizationRepo,
      jobsQueue,
      {
        apiUrl: env.APP_URL,
        frontendUrl: env.FRONTEND_URL,
        jwtSign: (payload, options) => app.jwt.sign(payload, options),
        jwtVerify: (token) => app.jwt.verify(token),
      },
    )
    await app.register(steamRoutes, { prefix: '/integrations/steam', controller: steamController })

    app.addHook('onClose', async () => { await jobsQueue.stop() })
  }

  if (env.GOOGLE_OAUTH_ENABLED && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const { registerGoogleRoutes } = await import('./modules/auth/google.strategy.js')
    await registerGoogleRoutes(app, authService, {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      appUrl: env.APP_URL,
      frontendUrl: env.FRONTEND_URL,
    })
  }

  return app
}
