import type { CryptoRepository, UserCryptoKey, ConversationGroupKey } from './crypto.repository.js'
import type { IConversationsRepository } from '../../shared/contracts/conversations.repository.contract.js'

export class CryptoService {
  constructor(
    private readonly repo: CryptoRepository,
    private readonly conversationsRepo: IConversationsRepository,
  ) {}

  async upsertPublicKey(userId: string, publicKey: string): Promise<UserCryptoKey> {
    return this.repo.upsertPublicKey(userId, publicKey)
  }

  async getPublicKey(userId: string): Promise<{ userId: string; publicKey: string } | null> {
    const key = await this.repo.findByUserId(userId)
    if (!key || !key.publicKey) return null
    return { userId: key.userId, publicKey: key.publicKey }
  }

  async getPublicKeysBatch(userIds: string[]): Promise<{ userId: string; publicKey: string }[]> {
    return this.repo.findPublicKeysByUserIds(userIds)
  }

  async upsertBackup(
    userId: string,
    data: { encryptedBackup: string; backupSalt: string; backupIv: string },
  ): Promise<void> {
    return this.repo.upsertBackup(userId, data)
  }

  async getBackup(userId: string): Promise<{ encryptedBackup: string; backupSalt: string; backupIv: string } | null> {
    const key = await this.repo.findByUserId(userId)
    if (!key || !key.encryptedBackup || !key.backupSalt || !key.backupIv) return null
    return {
      encryptedBackup: key.encryptedBackup,
      backupSalt: key.backupSalt,
      backupIv: key.backupIv,
    }
  }

  async setGroupKeys(
    callerUserId: string,
    conversationId: string,
    keys: { userId: string; encryptedKey: string; keyVersion: number }[],
  ): Promise<void> {
    const member = await this.conversationsRepo.findMember(conversationId, callerUserId)
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      throw new Error('FORBIDDEN')
    }

    const members = await this.conversationsRepo.findMembers(conversationId)
    const memberIds = new Set(members.map(m => m.userId))
    for (const k of keys) {
      if (!memberIds.has(k.userId)) throw new Error('MEMBER_NOT_FOUND')
    }

    await this.repo.upsertGroupKeys(
      keys.map(k => ({ conversationId, ...k })),
    )
  }

  async getGroupKey(callerUserId: string, conversationId: string): Promise<ConversationGroupKey | null> {
    const member = await this.conversationsRepo.findMember(conversationId, callerUserId)
    if (!member) throw new Error('FORBIDDEN')
    return this.repo.findGroupKey(conversationId, callerUserId)
  }
}
