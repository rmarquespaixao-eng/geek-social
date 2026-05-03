import type { FastifyRequest, FastifyReply } from 'fastify'
import type { DatabaseClient } from '../infra/database/postgres.client.js'
import { eq } from 'drizzle-orm'
import { featureFlags } from '../infra/database/schema.js'

export function requireFlag(db: DatabaseClient, key: string) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    const [row] = await db.select({ enabled: featureFlags.enabled })
      .from(featureFlags)
      .where(eq(featureFlags.key, key))
      .limit(1)
    if (!row?.enabled) {
      return reply.status(403).send({ error: 'FEATURE_DISABLED', message: `Feature '${key}' está desabilitada` })
    }
  }
}
