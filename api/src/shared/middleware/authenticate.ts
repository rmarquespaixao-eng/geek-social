// src/shared/middleware/authenticate.ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { IUserRepository } from '../contracts/user.repository.contract.js'

declare module 'fastify' {
  interface FastifyInstance {
    userRepository: IUserRepository
  }
}

/**
 * Verifica o JWT e revalida `tokenVersion` contra o DB. Bloqueia JWTs emitidos
 * antes de eventos que invalidam sessão (deleteAccount, changePassword,
 * setInitialPassword) — mesmo que o token ainda esteja dentro do TTL de 15 min.
 *
 * Custo: 1 SELECT por PK (~1ms). Aceitável para uma checagem de segurança crítica.
 * Popula também `platformRole` no request.user para uso por requireRole guard.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: 'Não autorizado' })
    return
  }

  const claims = request.user as { userId?: string; tokenVersion?: number } | undefined
  if (!claims || typeof claims.userId !== 'string') {
    reply.status(401).send({ error: 'Não autorizado' })
    return
  }

  const repo = request.server.userRepository
  if (!repo) {
    // Defensivo: se o app não decorou (cenário de teste), falha fechado.
    reply.status(401).send({ error: 'Não autorizado' })
    return
  }

  const user = await repo.findById(claims.userId)
  if (!user) {
    reply.status(401).send({ error: 'Não autorizado' })
    return
  }

  // tokenVersion ausente = JWT antigo (pré-fix); rejeita para forçar reautenticação.
  if (typeof claims.tokenVersion !== 'number' || user.tokenVersion !== claims.tokenVersion) {
    reply.status(401).send({ error: 'Não autorizado' })
    return
  }

  // Injeta platformRole no request.user para o requireRole guard poder ler sem
  // nova query ao DB — reutiliza o objeto já buscado acima.
  ;(request.user as Record<string, unknown>).platformRole = user.platformRole
}

/**
 * Variante para rotas públicas com auth opcional. Se o JWT for válido e
 * tokenVersion bater, popula `request.user`; caso contrário, segue como anônimo.
 */
export async function optionalAuthenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return
  }

  const claims = request.user as { userId?: string; tokenVersion?: number } | undefined
  if (!claims || typeof claims.userId !== 'string') {
    request.user = undefined as unknown as typeof request.user
    return
  }

  const repo = request.server.userRepository
  if (!repo) {
    request.user = undefined as unknown as typeof request.user
    return
  }

  const user = await repo.findById(claims.userId)
  if (!user || typeof claims.tokenVersion !== 'number' || user.tokenVersion !== claims.tokenVersion) {
    // Token inválido por versão — trata como anônimo (não falha a request).
    request.user = undefined as unknown as typeof request.user
    return
  }

  ;(request.user as Record<string, unknown>).platformRole = user.platformRole
}
