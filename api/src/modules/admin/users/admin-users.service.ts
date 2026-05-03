import type { AdminUsersRepository } from './admin-users.repository.js'
import type { AdminAuditLogService } from '../audit-log.service.js'
import type { FastifyRequest } from 'fastify'
import type { AccessTokenClaims } from '../../auth/auth.service.js'
import type { PlatformRole } from '../../../shared/middleware/require-role.js'
import type { ListUsersQuery, SetUserStatusBody, SetUserRoleBody } from './admin-users.schema.js'

export class AdminUsersError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AdminUsersError'
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***@***'
  return `${local[0]}***@${domain}`
}

export class AdminUsersService {
  constructor(
    private readonly repo: AdminUsersRepository,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async list(request: FastifyRequest, filters: ListUsersQuery) {
    const claims = request.user as (AccessTokenClaims & { platformRole?: PlatformRole }) | undefined
    const isAdmin = claims?.platformRole === 'admin'

    const { rows, total } = await this.repo.list(filters, isAdmin)

    const items = rows.map(u => ({
      id: u.id,
      displayName: u.displayName,
      // Moderador vê e-mail mascarado; admin vê completo
      email: isAdmin ? u.email : maskEmail(u.email),
      avatarUrl: u.avatarUrl,
      platformRole: u.platformRole,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      // IP nunca é exposto na listagem — só nos logs para admin
    }))

    return { items, total, page: filters.page, pageSize: filters.pageSize }
  }

  async setStatus(request: FastifyRequest, targetId: string, body: SetUserStatusBody): Promise<void> {
    const claims = request.user as (AccessTokenClaims & { platformRole?: PlatformRole }) | undefined
    const actorRole = claims?.platformRole ?? 'user'
    const actorId = claims?.userId ?? ''

    if (actorRole !== 'admin') {
      throw new AdminUsersError('FORBIDDEN', 'Apenas administradores podem alterar status de usuário', 403)
    }

    const target = await this.repo.findById(targetId)
    if (!target) throw new AdminUsersError('NOT_FOUND', 'Usuário não encontrado', 404)

    if (body.status === 'banned') {
      await this.repo.bumpTokenVersion(targetId)
      await this.auditLog.recordFromRequest(request, 'user_ban', {
        targetType: 'user',
        targetId,
        metadata: { reason: body.reason ?? null },
      })
    } else if (body.status === 'active') {
      // F-28: unban/reactivate não tem suporte completo enquanto não houver coluna status dedicada no DB.
      throw new AdminUsersError(
        'STATUS_NOT_SUPPORTED',
        'Gerenciamento de status "active" depende de implementação futura (coluna status no DB). Use suspensão/ban por tokenVersion.',
        400,
      )
    } else if (body.status === 'suspended') {
      await this.repo.bumpTokenVersion(targetId)
      await this.auditLog.recordFromRequest(request, 'user_suspend', {
        targetType: 'user',
        targetId,
        metadata: { reason: body.reason ?? null },
      })
    }
  }

  async setRole(request: FastifyRequest, targetId: string, body: SetUserRoleBody): Promise<void> {
    const claims = request.user as (AccessTokenClaims & { platformRole?: PlatformRole }) | undefined
    const actorRole = claims?.platformRole ?? 'user'
    const actorId = claims?.userId ?? ''

    if (actorRole !== 'admin') {
      throw new AdminUsersError('FORBIDDEN', 'Apenas administradores podem alterar papel de usuário', 403)
    }

    // F-24: Bloquear auto-alteração de papel
    if (actorId === targetId) {
      throw new AdminUsersError('SELF_ROLE_CHANGE', 'Não é possível alterar o próprio papel', 422)
    }

    const target = await this.repo.findById(targetId)
    if (!target) throw new AdminUsersError('NOT_FOUND', 'Usuário não encontrado', 404)

    // Proteção: não pode rebaixar o último admin (com FOR UPDATE para evitar race condition)
    if (target.platformRole === 'admin' && body.role !== 'admin') {
      const isLast = await this.repo.isLastAdmin(targetId)
      if (isLast) {
        throw new AdminUsersError('LAST_ADMIN', 'Não é possível rebaixar o último administrador da plataforma', 422)
      }
      // Role-down invalida sessões imediatamente
      await this.repo.bumpTokenVersion(targetId)
    }

    await this.repo.updateRole(targetId, body.role)
    await this.auditLog.recordFromRequest(request, 'user_role_change', {
      targetType: 'user',
      targetId,
      metadata: { from: target.platformRole, to: body.role },
    })
  }

  async anonymize(request: FastifyRequest, targetId: string): Promise<void> {
    const claims = request.user as (AccessTokenClaims & { platformRole?: PlatformRole }) | undefined
    const actorRole = claims?.platformRole ?? 'user'

    if (actorRole !== 'admin') {
      throw new AdminUsersError('FORBIDDEN', 'Apenas administradores podem anonimizar contas', 403)
    }

    const target = await this.repo.findById(targetId)
    if (!target) throw new AdminUsersError('NOT_FOUND', 'Usuário não encontrado', 404)

    await this.repo.anonymize(targetId)
    await this.auditLog.recordFromRequest(request, 'user_anonymize', {
      targetType: 'user',
      targetId,
    })
  }
}
