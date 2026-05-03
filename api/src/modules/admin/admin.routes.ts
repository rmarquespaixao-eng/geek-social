import type { FastifyInstance } from 'fastify'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { AdminAuditLogRepository } from './audit-log.repository.js'
import { AdminAuditLogService } from './audit-log.service.js'
import { StatsRepository } from './stats/stats.repository.js'
import { StatsService } from './stats/stats.service.js'
import { statsRoutes } from './stats/stats.routes.js'
import { AdminUsersRepository } from './users/admin-users.repository.js'
import { AdminUsersService } from './users/admin-users.service.js'
import { adminUsersRoutes } from './users/admin-users.routes.js'
import { AdminReportsRepository } from './reports/admin-reports.repository.js'
import { AdminReportsService } from './reports/admin-reports.service.js'
import { adminReportsRoutes } from './reports/admin-reports.routes.js'
import { AdminCommunitiesRepository } from './communities/admin-communities.repository.js'
import { AdminCommunitiesService } from './communities/admin-communities.service.js'
import { adminCommunitiesRoutes } from './communities/admin-communities.routes.js'
import { adminLogsRoutes } from './logs/admin-logs.routes.js'
import { FeatureFlagsRepository } from './feature-flags/feature-flags.repository.js'
import { FeatureFlagsService } from './feature-flags/feature-flags.service.js'
import { featureFlagsRoutes } from './feature-flags/feature-flags.routes.js'
import { LgpdRepository } from './lgpd/lgpd.repository.js'
import { LgpdService } from './lgpd/lgpd.service.js'
import { lgpdRoutes } from './lgpd/lgpd.routes.js'
import { ModerationRepository } from './moderation/moderation.repository.js'
import { ModerationService } from './moderation/moderation.service.js'
import { moderationRoutes } from './moderation/moderation.routes.js'
import { CollectionTypesRepository } from './collection-types/collection-types.repository.js'
import { CollectionTypesService } from './collection-types/collection-types.service.js'
import { collectionTypesRoutes } from './collection-types/collection-types.routes.js'

export async function adminRoutes(app: FastifyInstance, opts: { db: DatabaseClient }) {
  const { db } = opts

  // Shared audit log
  const auditLogRepo = new AdminAuditLogRepository(db)
  const auditLogService = new AdminAuditLogService(auditLogRepo)

  // Stats
  const statsRepo = new StatsRepository(db)
  const statsService = new StatsService(statsRepo)
  await app.register(statsRoutes, { prefix: '/stats', statsService })

  // Users
  const adminUsersRepo = new AdminUsersRepository(db)
  const adminUsersService = new AdminUsersService(adminUsersRepo, auditLogService)
  await app.register(adminUsersRoutes, { prefix: '/users', adminUsersService })

  // Reports
  const adminReportsRepo = new AdminReportsRepository(db)
  const adminReportsService = new AdminReportsService(adminReportsRepo, auditLogService)
  await app.register(adminReportsRoutes, { prefix: '/reports', adminReportsService })

  // Communities
  const adminCommunitiesRepo = new AdminCommunitiesRepository(db)
  const adminCommunitiesService = new AdminCommunitiesService(adminCommunitiesRepo, auditLogService)
  await app.register(adminCommunitiesRoutes, { prefix: '/communities', adminCommunitiesService })

  // Audit logs
  await app.register(adminLogsRoutes, { prefix: '/logs', auditLogService })

  // Feature flags
  const featureFlagsRepo = new FeatureFlagsRepository(db)
  const featureFlagsService = new FeatureFlagsService(featureFlagsRepo, auditLogService)
  await app.register(featureFlagsRoutes, { prefix: '/feature-flags', featureFlagsService })

  // LGPD
  const lgpdRepo = new LgpdRepository(db)
  const lgpdService = new LgpdService(lgpdRepo, auditLogService)
  await app.register(lgpdRoutes, { prefix: '/lgpd', lgpdService })

  // Moderation
  const moderationRepo = new ModerationRepository(db)
  const moderationService = new ModerationService(moderationRepo, auditLogService)
  await app.register(moderationRoutes, { prefix: '/moderation', moderationService })

  // Collection types
  const collectionTypesRepo = new CollectionTypesRepository(db)
  const collectionTypesService = new CollectionTypesService(collectionTypesRepo, auditLogService)
  await app.register(collectionTypesRoutes, { prefix: '/collection-types', collectionTypesService })
}
