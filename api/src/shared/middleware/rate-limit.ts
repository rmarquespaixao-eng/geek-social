import type { FastifyRequest, FastifyReply } from 'fastify'
import type { RedisClient } from '../infra/redis/redis.client.js'

// Auditoria #5: rate-limit em Redis. Sem fallback in-memory — em deploy multi-pod
// um fallback levaria a N×limit e mascararia falhas de infra. Se Redis está down,
// o middleware fail-closes (bloqueia a requisição com 503), forçando o operador
// a tratar a indisponibilidade.

let redisClient: RedisClient | null = null

export function setRateLimitRedis(client: RedisClient) {
  redisClient = client
}

function getRedis(): RedisClient {
  if (!redisClient) {
    throw new Error('rate-limit: Redis client não inicializado (chame setRateLimitRedis em buildApp)')
  }
  return redisClient
}

class RateLimitError extends Error {
  statusCode = 429
  constructor() {
    super('RATE_LIMIT_EXCEEDED')
    this.name = 'RateLimitError'
  }
}

class RateLimitUnavailableError extends Error {
  statusCode = 503
  constructor() {
    super('RATE_LIMIT_UNAVAILABLE')
    this.name = 'RateLimitUnavailableError'
  }
}

// INCR + PEXPIRE atômico via pipeline. O bucket é fixo por janela (Math.floor),
// então o EXPIRE só tem efeito na primeira request da janela; nas subsequentes
// o TTL já está setado. Aceitamos a borda de janela (até 2× limit no instante
// do rollover) — algoritmo "fixed window counter" clássico.
async function incrementBucket(key: string, windowMs: number): Promise<number> {
  const redis = getRedis()
  let result: Array<[Error | null, unknown]> | null
  try {
    result = await redis.multi().incr(key).pexpire(key, windowMs).exec()
  } catch {
    throw new RateLimitUnavailableError()
  }
  if (!result || result[0][0]) {
    throw new RateLimitUnavailableError()
  }
  return Number(result[0][1])
}

export function createIpRateLimiter(maxRequests: number, windowMs: number) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const ip = request.ip
    const bucket = Math.floor(Date.now() / windowMs)
    const key = `rl:ip:${ip}:${bucket}`
    const count = await incrementBucket(key, windowMs)
    if (count > maxRequests) throw new RateLimitError()
  }
}

export function createUserRateLimiter(maxRequests: number, windowMs: number) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = request.user as { userId: string } | undefined
    if (!user) {
      const err = new Error('UNAUTHORIZED') as Error & { statusCode: number }
      err.statusCode = 401
      throw err
    }
    const bucket = Math.floor(Date.now() / windowMs)
    const key = `rl:user:${user.userId}:${bucket}`
    const count = await incrementBucket(key, windowMs)
    if (count > maxRequests) throw new RateLimitError()
  }
}
