import { Redis } from 'ioredis'

export function createRedisClient(connectionString: string): Redis {
  // enableOfflineQueue=false faz comandos falharem imediatamente quando o Redis
  // está down, em vez de empilhar e estourar memória. Rate-limit fail-closed
  // no error handler.
  const client = new Redis(connectionString, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    lazyConnect: false,
  })
  return client
}

export type RedisClient = Redis
