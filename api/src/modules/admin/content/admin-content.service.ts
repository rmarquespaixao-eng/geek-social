import type { FastifyRequest } from 'fastify'
import type { AdminContentRepository } from './admin-content.repository.js'
import type { AdminAuditLogService } from '../audit-log.service.js'

export class AdminContentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AdminContentError'
  }
}

export class AdminContentService {
  constructor(
    private readonly repo: AdminContentRepository,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async deletePost(request: FastifyRequest, id: string): Promise<void> {
    const ok = await this.repo.softDeletePost(id)
    if (!ok) throw new AdminContentError('POST_NOT_FOUND', 'Post não encontrado', 404)
    await this.auditLog.recordFromRequest(request, 'content_post_delete', { targetType: 'post', targetId: id })
  }

  async deleteComment(request: FastifyRequest, id: string): Promise<void> {
    const ok = await this.repo.deleteComment(id)
    if (!ok) throw new AdminContentError('COMMENT_NOT_FOUND', 'Comentário não encontrado', 404)
    await this.auditLog.recordFromRequest(request, 'content_comment_delete', { targetType: 'comment', targetId: id })
  }
}
