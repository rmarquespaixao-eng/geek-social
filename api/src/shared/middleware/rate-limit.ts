import type { FastifyRequest, FastifyReply } from 'fastify'

type RateLimitEntry = {
  count: number
  resetAt: number
}

// ATENÇÃO: estado em memória do processo. Implicações conhecidas:
// (1) Em deploy multi-instância (>1 réplica), o limite efetivo é N×limit.
// (2) Restart zera os contadores.
// (3) Sem cleanup, entries com chaves únicas (ex: IPs rotativos) acumulariam.
// O cleanup periódico abaixo mitiga (3); (1) e (2) só são resolvidos com store
// distribuído (Redis). Documentado em docs/security/2026-04-30-auth-audit.md (#5).
const ipLimits = new Map<string, RateLimitEntry>()
const userLimits = new Map<string, RateLimitEntry>()

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

function pruneExpired(map: Map<string, RateLimitEntry>) {
  const now = Date.now()
  for (const [key, entry] of map.entries()) {
    if (entry.resetAt <= now) map.delete(key)
  }
}

const cleanupHandle = setInterval(() => {
  pruneExpired(ipLimits)
  pruneExpired(userLimits)
}, CLEANUP_INTERVAL_MS)
// Não bloquear o event loop em teste/serverless.
if (typeof cleanupHandle.unref === 'function') cleanupHandle.unref()

// Exposto para testes/teardown — chamar em onClose se quiser determinismo.
export function stopRateLimitCleanup() {
  clearInterval(cleanupHandle)
}

export function createIpRateLimiter(maxRequests: number, windowMs: number) {
  return (request: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
    const ip = request.ip
    const now = Date.now()

    let entry = ipLimits.get(ip)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      ipLimits.set(ip, entry)
    }

    entry.count++
    if (entry.count > maxRequests) {
      return done(new Error('RATE_LIMIT_EXCEEDED'))
    }

    done()
  }
}

export function createUserRateLimiter(maxRequests: number, windowMs: number) {
  return (request: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
    const user = request.user as { userId: string } | undefined
    if (!user) {
      return done(new Error('UNAUTHORIZED'))
    }

    const userId = user.userId
    const now = Date.now()

    let entry = userLimits.get(userId)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      userLimits.set(userId, entry)
    }

    entry.count++
    if (entry.count > maxRequests) {
      return done(new Error('RATE_LIMIT_EXCEEDED'))
    }

    done()
  }
}
