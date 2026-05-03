import type { FastifyRequest, FastifyReply } from 'fastify'
import type { DatabaseClient } from '../infra/database/postgres.client.js'
import { eq, and } from 'drizzle-orm'
import { featureFlags, userFeatureFlags } from '../infra/database/schema.js'

const CACHE_TTL_MS = 30_000
const cache = new Map<string, { enabled: boolean; expiresAt: number }>()

async function resolveFlag(db: DatabaseClient, key: string, userId?: string): Promise<boolean> {
  const now = Date.now()
  const cacheKey = userId ? `${key}:${userId}` : key
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.enabled

  let enabled: boolean

  if (userId) {
    const [row] = await db
      .select({
        globalEnabled: featureFlags.enabled,
        userEnabled: userFeatureFlags.enabled,
      })
      .from(featureFlags)
      .leftJoin(
        userFeatureFlags,
        and(
          eq(userFeatureFlags.flagId, featureFlags.id),
          eq(userFeatureFlags.userId, userId),
        ),
      )
      .where(eq(featureFlags.key, key))
      .limit(1)
    enabled = row ? (row.userEnabled ?? row.globalEnabled) : false
  } else {
    const [row] = await db
      .select({ enabled: featureFlags.enabled })
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1)
    enabled = row?.enabled ?? false
  }

  cache.set(cacheKey, { enabled, expiresAt: now + CACHE_TTL_MS })
  return enabled
}

export function requireFlag(db: DatabaseClient, key: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { userId?: string } | undefined)?.userId
    const enabled = await resolveFlag(db, key, userId)
    if (!enabled) {
      return reply.status(403).send({ error: 'FEATURE_DISABLED', message: `Feature '${key}' está desabilitada` })
    }
  }
}

/** Invalida cache de uma flag. Sem userId: limpa apenas o cache global. Com userId: limpa o cache do usuário. */
export function invalidateFlagCache(key: string, userId?: string) {
  if (userId) {
    cache.delete(`${key}:${userId}`)
  } else {
    cache.delete(key)
  }
}
