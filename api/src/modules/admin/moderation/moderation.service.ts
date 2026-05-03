import { encryptSecret, decryptSecret } from '../../../shared/infra/crypto/secret-cipher.js'
import type { ModerationRepository } from './moderation.repository.js'
import type { AdminAuditLogService } from '../audit-log.service.js'
import type { FastifyRequest } from 'fastify'
import type { AccessTokenClaims } from '../../auth/auth.service.js'
import type { AiConfigInput, AgeConfigInput } from './moderation.schema.js'

export class ModerationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message)
    this.name = 'ModerationError'
  }
}

export class ModerationService {
  constructor(
    private readonly repo: ModerationRepository,
    private readonly auditLog: AdminAuditLogService,
  ) {}

  async getAiConfig() {
    const row = await this.repo.getOrSeedAi()
    return this.toAiResponse(row)
  }

  async updateAiConfig(request: FastifyRequest, input: AiConfigInput) {
    const claims = request.user as AccessTokenClaims

    const update: Parameters<typeof this.repo.upsertAi>[0] = {
      updatedBy: claims.userId,
    }

    if (input.provider !== undefined) update.provider = input.provider
    if (input.model !== undefined) update.model = input.model
    if (input.endpoint !== undefined) update.endpoint = input.endpoint
    if (input.enabled !== undefined) update.enabled = input.enabled
    if (input.moderateText !== undefined) update.moderateText = input.moderateText
    if (input.moderateImages !== undefined) update.moderateImages = input.moderateImages
    if (input.moderateVideos !== undefined) update.moderateVideos = input.moderateVideos
    if (input.textThreshold !== undefined) update.textThreshold = String(input.textThreshold)
    if (input.imageThreshold !== undefined) update.imageThreshold = String(input.imageThreshold)
    if (input.autoRemove !== undefined) update.autoRemove = input.autoRemove
    if (input.autoFlag !== undefined) update.autoFlag = input.autoFlag
    if (input.notifyModerators !== undefined) update.notifyModerators = input.notifyModerators

    // Cifra apiKey se fornecida
    if (input.apiKey) {
      try {
        const bundle = encryptSecret(input.apiKey)
        update.apiKeyCiphertext = bundle.ciphertext
        update.apiKeyIv = bundle.iv
        update.apiKeyTag = bundle.tag
      } catch (err) {
        // Propagar erros não relacionados à chave mestra (ex: DB, rede)
        if (err instanceof Error && err.message.includes('ADMIN_SECRETS_ENC_KEY')) {
          throw new ModerationError('MASTER_KEY_MISSING', 'Chave mestra de criptografia não configurada ou inválida', 500)
        }
        throw err
      }
    }

    const row = await this.repo.upsertAi(update)

    const auditAction = input.apiKey ? 'ai_apikey_set' : 'ai_config_update'
    await this.auditLog.recordFromRequest(request, auditAction, {
      targetType: 'ai_moderation_config',
    })

    return this.toAiResponse(row)
  }

  async clearApiKey(request: FastifyRequest) {
    await this.repo.clearApiKey()
    await this.auditLog.recordFromRequest(request, 'ai_apikey_clear', {
      targetType: 'ai_moderation_config',
    })
  }

  async getAgeConfig() {
    return this.repo.getOrSeedAge()
  }

  async updateAgeConfig(request: FastifyRequest, input: AgeConfigInput) {
    const claims = request.user as AccessTokenClaims

    const update: Parameters<typeof this.repo.upsertAge>[0] = {
      updatedBy: claims.userId,
    }
    if (input.enabled !== undefined) update.enabled = input.enabled
    if (input.minimumAge !== undefined) update.minimumAge = input.minimumAge
    if (input.method !== undefined) update.method = input.method
    if (input.requireVerification !== undefined) update.requireVerification = input.requireVerification

    const row = await this.repo.upsertAge(update)

    await this.auditLog.recordFromRequest(request, 'age_config_update', {
      targetType: 'age_moderation_config',
    })

    return row
  }

  private toAiResponse(row: NonNullable<Awaited<ReturnType<ModerationRepository['getAi']>>>) {
    return {
      provider: row.provider,
      model: row.model,
      endpoint: row.endpoint,
      enabled: row.enabled,
      moderateText: row.moderateText,
      moderateImages: row.moderateImages,
      moderateVideos: row.moderateVideos,
      textThreshold: row.textThreshold,
      imageThreshold: row.imageThreshold,
      autoRemove: row.autoRemove,
      autoFlag: row.autoFlag,
      notifyModerators: row.notifyModerators,
      apiKeyConfigured: Boolean(row.apiKeyCiphertext),
      updatedAt: row.updatedAt,
    }
  }
}
