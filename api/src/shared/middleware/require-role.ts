import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AccessTokenClaims } from '../../modules/auth/auth.service.js'

type PlatformRole = 'user' | 'moderator' | 'admin'

const ROLE_HIERARCHY: Record<PlatformRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
}

/**
 * Guard de papel administrativo. Deve ser usado após `authenticate`.
 * Aceita uma role string ou array de roles permitidas.
 * Responde 403 se o papel do usuário autenticado não estiver na lista.
 */
export function requireRole(allowed: PlatformRole | PlatformRole[]) {
  const allowedRoles = Array.isArray(allowed) ? allowed : [allowed]

  return async function requireRoleHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const claims = request.user as (AccessTokenClaims & { platformRole?: PlatformRole }) | undefined

    if (!claims) {
      reply.status(401).send({ error: 'Não autenticado' })
      return
    }

    const role: PlatformRole = claims.platformRole ?? 'user'

    if (!allowedRoles.includes(role)) {
      reply.status(403).send({ error: 'Acesso negado' })
      return
    }
  }
}

export type { PlatformRole }
export { ROLE_HIERARCHY }
