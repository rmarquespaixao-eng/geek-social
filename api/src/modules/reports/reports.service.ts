import type { ReportsRepository, Report } from './reports.repository.js'
import type { CreateReportInput } from './reports.schema.js'

export class ReportsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ReportsError'
  }
}

export class ReportsService {
  constructor(private readonly repo: ReportsRepository) {}

  async create(reporterId: string, input: CreateReportInput): Promise<Report> {
    if (input.targetType === 'conversation') {
      // Conversas são compartilhadas (DM ou grupo); só checamos membership.
      const isMember = await this.repo.isConversationMember(input.targetId, reporterId)
      if (!isMember) throw new ReportsError('TARGET_NOT_FOUND')
    } else {
      const ownerId = await this.repo.getTargetOwnerId(input.targetType, input.targetId)
      if (!ownerId) throw new ReportsError('TARGET_NOT_FOUND')
      if (ownerId === reporterId) throw new ReportsError('CANNOT_REPORT_OWN')
    }

    const existing = await this.repo.findExisting(reporterId, input.targetType, input.targetId)
    if (existing) throw new ReportsError('ALREADY_REPORTED')

    return this.repo.create({
      reporterId,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      description: input.description?.trim() || null,
    })
  }
}
