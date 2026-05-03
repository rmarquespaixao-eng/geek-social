import type { FastifyRequest, FastifyReply } from 'fastify'
import type { DatabaseClient } from '../infra/database/postgres.client.js'
import { eq } from 'drizzle-orm'
import { featureFlags } from '../infra/database/schema.js'

const CACHE_TTL_MS = 30_000
const cache = new Map<string, { enabled: boolean; expiresAt: number }>()

export function requireFlag(db: DatabaseClient, key: string) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    const now = Date.now()
    const cached = cache.get(key)
    let enabled: boolean

    if (cached && cached.expiresAt > now) {
      enabled = cached.enabled
    } else {
      const [row] = await db.select({ enabled: featureFlags.enabled })
        .from(featureFlags)
        .where(eq(featureFlags.key, key))
        .limit(1)
      enabled = row?.enabled ?? false
      cache.set(key, { enabled, expiresAt: now + CACHE_TTL_MS })
    }

    if (!enabled) {
      return reply.status(403).send({ error: 'FEATURE_DISABLED', message: `Feature '${key}' está desabilitada` })
    }
  }
}

/** Invalida cache de um flag (chamar após toggle no admin). */
export function invalidateFlagCache(key: string) {
  cache.delete(key)
}
