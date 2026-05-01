import type {
  CryptoRepository,
  IdentityRow,
  PrekeyRow,
  OneTimePrekeyRow,
  SenderKeyDistributionRow,
} from './crypto.repository.js'
import type { IConversationsRepository } from '../../shared/contracts/conversations.repository.contract.js'

export type IdentityPayload = {
  identityKey: Uint8Array
  registrationId: number
}

export type SignedPrekeyPayload = {
  prekeyId: number
  publicKey: Uint8Array
  signature: Uint8Array
}

export type KyberPrekeyPayload = {
  prekeyId: number
  publicKey: Uint8Array
  signature: Uint8Array
}

export type OneTimePrekeyPayload = {
  prekeyId: number
  publicKey: Uint8Array
}

export type PrekeyBundle = {
  userId: string
  registrationId: number
  identityKey: Uint8Array
  signedPrekey: { prekeyId: number; publicKey: Uint8Array; signature: Uint8Array }
  kyberPrekey: { prekeyId: number; publicKey: Uint8Array; signature: Uint8Array }
  oneTimePrekey: { prekeyId: number; publicKey: Uint8Array } | null
}

export type BackupPayload = {
  encryptedBackup: Uint8Array
  backupSalt: Uint8Array
  backupIv: Uint8Array
}

export type SenderKeyDistributionPayload = {
  recipientUserId: string
  ciphertext: Uint8Array
}

export class CryptoService {
  constructor(
    private readonly repo: CryptoRepository,
    private readonly conversationsRepo: IConversationsRepository,
  ) {}

  async putIdentity(userId: string, payload: IdentityPayload): Promise<IdentityRow> {
    return this.repo.putIdentity(userId, payload)
  }

  async getIdentity(userId: string): Promise<IdentityRow | null> {
    return this.repo.getIdentity(userId)
  }

  async putSignedPrekey(userId: string, payload: SignedPrekeyPayload): Promise<void> {
    await this.repo.putSignedPrekey(userId, payload)
  }

  async putKyberPrekey(userId: string, payload: KyberPrekeyPayload): Promise<void> {
    await this.repo.putKyberPrekey(userId, payload)
  }

  async putOneTimePrekeys(userId: string, keys: OneTimePrekeyPayload[]): Promise<void> {
    await this.repo.putOneTimePrekeys(userId, keys)
  }

  async countOneTimePrekeys(userId: string): Promise<number> {
    return this.repo.countOneTimePrekeys(userId)
  }

  /**
   * Builds a PreKeyBundle for an initiator running X3DH/PQXDH against `userId`.
   * Atomically pops one OTP if available; if not, returns bundle without OTP
   * (libsignal still completes session — slightly weaker forward secrecy on the very first message).
   */
  async fetchPrekeyBundle(userId: string): Promise<PrekeyBundle | null> {
    const identity = await this.repo.getIdentity(userId)
    if (!identity) return null
    const [signed, kyber] = await Promise.all([
      this.repo.getLatestSignedPrekey(userId),
      this.repo.getLatestKyberPrekey(userId),
    ])
    if (!signed || !kyber) return null
    const otp = await this.repo.popOneTimePrekey(userId)
    return {
      userId,
      registrationId: identity.registrationId,
      identityKey: identity.identityKey,
      signedPrekey: {
        prekeyId: signed.prekeyId,
        publicKey: signed.publicKey,
        signature: signed.signature,
      },
      kyberPrekey: {
        prekeyId: kyber.prekeyId,
        publicKey: kyber.publicKey,
        signature: kyber.signature,
      },
      oneTimePrekey: otp ? { prekeyId: otp.prekeyId, publicKey: otp.publicKey } : null,
    }
  }

  async upsertBackup(userId: string, data: BackupPayload): Promise<void> {
    await this.repo.upsertBackup(userId, data)
  }

  async getBackup(userId: string): Promise<BackupPayload | null> {
    const identity = await this.repo.getIdentity(userId)
    if (!identity || !identity.encryptedBackup || !identity.backupSalt || !identity.backupIv) {
      return null
    }
    return {
      encryptedBackup: identity.encryptedBackup,
      backupSalt: identity.backupSalt,
      backupIv: identity.backupIv,
    }
  }

  async putSenderKeyDistributions(
    callerUserId: string,
    conversationId: string,
    distributions: SenderKeyDistributionPayload[],
  ): Promise<void> {
    const member = await this.conversationsRepo.findMember(conversationId, callerUserId)
    if (!member) throw new Error('FORBIDDEN')

    const members = await this.conversationsRepo.findMembers(conversationId)
    const memberIds = new Set(members.map(m => m.userId))
    for (const d of distributions) {
      if (!memberIds.has(d.recipientUserId)) throw new Error('MEMBER_NOT_FOUND')
    }

    await this.repo.putSenderKeyDistributions(
      distributions.map(d => ({
        conversationId,
        senderUserId: callerUserId,
        recipientUserId: d.recipientUserId,
        ciphertext: d.ciphertext,
      })),
    )
  }

  async getSenderKeyDistribution(
    callerUserId: string,
    conversationId: string,
    senderUserId: string,
  ): Promise<SenderKeyDistributionRow | null> {
    const member = await this.conversationsRepo.findMember(conversationId, callerUserId)
    if (!member) throw new Error('FORBIDDEN')
    return this.repo.getSenderKeyDistribution(conversationId, senderUserId, callerUserId)
  }
}
