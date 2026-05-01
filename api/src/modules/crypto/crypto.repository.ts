import { eq, and, inArray, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import {
  signalIdentityKeys,
  signalSignedPrekeys,
  signalKyberPrekeys,
  signalOneTimePrekeys,
  signalSenderKeyDistributions,
} from '../../shared/infra/database/schema.js'

export type IdentityRow = {
  userId: string
  identityKey: Uint8Array
  registrationId: number
  encryptedBackup: Uint8Array | null
  backupSalt: Uint8Array | null
  backupIv: Uint8Array | null
  createdAt: Date
  updatedAt: Date
}

export type PrekeyRow = {
  userId: string
  prekeyId: number
  publicKey: Uint8Array
  signature: Uint8Array
  createdAt: Date
}

export type OneTimePrekeyRow = {
  userId: string
  prekeyId: number
  publicKey: Uint8Array
  createdAt: Date
}

export type SenderKeyDistributionRow = {
  conversationId: string
  senderUserId: string
  recipientUserId: string
  ciphertext: Uint8Array
  createdAt: Date
}

export class CryptoRepository {
  constructor(private readonly db: DatabaseClient) {}

  async putIdentity(
    userId: string,
    data: { identityKey: Uint8Array; registrationId: number },
  ): Promise<IdentityRow> {
    const [row] = await this.db
      .insert(signalIdentityKeys)
      .values({
        userId,
        identityKey: data.identityKey,
        registrationId: data.registrationId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: signalIdentityKeys.userId,
        set: {
          identityKey: data.identityKey,
          registrationId: data.registrationId,
          updatedAt: new Date(),
        },
      })
      .returning()
    return row as IdentityRow
  }

  async getIdentity(userId: string): Promise<IdentityRow | null> {
    const [row] = await this.db
      .select()
      .from(signalIdentityKeys)
      .where(eq(signalIdentityKeys.userId, userId))
    return (row as IdentityRow | undefined) ?? null
  }

  async getIdentitiesBatch(userIds: string[]): Promise<IdentityRow[]> {
    if (userIds.length === 0) return []
    const rows = await this.db
      .select()
      .from(signalIdentityKeys)
      .where(inArray(signalIdentityKeys.userId, userIds))
    return rows as IdentityRow[]
  }

  async upsertBackup(
    userId: string,
    data: { encryptedBackup: Uint8Array; backupSalt: Uint8Array; backupIv: Uint8Array },
  ): Promise<void> {
    await this.db
      .update(signalIdentityKeys)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(signalIdentityKeys.userId, userId))
  }

  async putSignedPrekey(
    userId: string,
    data: { prekeyId: number; publicKey: Uint8Array; signature: Uint8Array },
  ): Promise<void> {
    await this.db
      .insert(signalSignedPrekeys)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: [signalSignedPrekeys.userId, signalSignedPrekeys.prekeyId],
        set: { publicKey: data.publicKey, signature: data.signature, createdAt: new Date() },
      })
  }

  async getLatestSignedPrekey(userId: string): Promise<PrekeyRow | null> {
    const rows = await this.db
      .select()
      .from(signalSignedPrekeys)
      .where(eq(signalSignedPrekeys.userId, userId))
      .orderBy(sql`${signalSignedPrekeys.createdAt} DESC`)
      .limit(1)
    return (rows[0] as PrekeyRow | undefined) ?? null
  }

  async putKyberPrekey(
    userId: string,
    data: { prekeyId: number; publicKey: Uint8Array; signature: Uint8Array },
  ): Promise<void> {
    await this.db
      .insert(signalKyberPrekeys)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: [signalKyberPrekeys.userId, signalKyberPrekeys.prekeyId],
        set: { publicKey: data.publicKey, signature: data.signature, createdAt: new Date() },
      })
  }

  async getLatestKyberPrekey(userId: string): Promise<PrekeyRow | null> {
    const rows = await this.db
      .select()
      .from(signalKyberPrekeys)
      .where(eq(signalKyberPrekeys.userId, userId))
      .orderBy(sql`${signalKyberPrekeys.createdAt} DESC`)
      .limit(1)
    return (rows[0] as PrekeyRow | undefined) ?? null
  }

  async putOneTimePrekeys(
    userId: string,
    keys: { prekeyId: number; publicKey: Uint8Array }[],
  ): Promise<void> {
    if (keys.length === 0) return
    await this.db
      .insert(signalOneTimePrekeys)
      .values(keys.map(k => ({ userId, prekeyId: k.prekeyId, publicKey: k.publicKey })))
      .onConflictDoNothing({
        target: [signalOneTimePrekeys.userId, signalOneTimePrekeys.prekeyId],
      })
  }

  /**
   * Atomically pops one OTP via DELETE ... RETURNING (single row, FOR UPDATE SKIP LOCKED-equivalent).
   * Returns null if user has no remaining OTPs (initiator should fall back to no-OTP bundle).
   */
  async popOneTimePrekey(userId: string): Promise<OneTimePrekeyRow | null> {
    const result = await this.db.execute(sql`
      DELETE FROM ${signalOneTimePrekeys}
      WHERE (${signalOneTimePrekeys.userId}, ${signalOneTimePrekeys.prekeyId}) = (
        SELECT ${signalOneTimePrekeys.userId}, ${signalOneTimePrekeys.prekeyId}
        FROM ${signalOneTimePrekeys}
        WHERE ${signalOneTimePrekeys.userId} = ${userId}
        ORDER BY ${signalOneTimePrekeys.prekeyId} ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING ${signalOneTimePrekeys.userId} as "userId",
                ${signalOneTimePrekeys.prekeyId} as "prekeyId",
                ${signalOneTimePrekeys.publicKey} as "publicKey",
                ${signalOneTimePrekeys.createdAt} as "createdAt"
    `)
    const rows = (result as unknown as { rows: OneTimePrekeyRow[] }).rows
    return rows[0] ?? null
  }

  async countOneTimePrekeys(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(signalOneTimePrekeys)
      .where(eq(signalOneTimePrekeys.userId, userId))
    return row?.c ?? 0
  }

  async putSenderKeyDistributions(
    entries: {
      conversationId: string
      senderUserId: string
      recipientUserId: string
      ciphertext: Uint8Array
    }[],
  ): Promise<void> {
    if (entries.length === 0) return
    await this.db
      .insert(signalSenderKeyDistributions)
      .values(entries)
      .onConflictDoUpdate({
        target: [
          signalSenderKeyDistributions.conversationId,
          signalSenderKeyDistributions.senderUserId,
          signalSenderKeyDistributions.recipientUserId,
        ],
        set: {
          ciphertext: sql`excluded.ciphertext`,
          createdAt: new Date(),
        },
      })
  }

  async getSenderKeyDistribution(
    conversationId: string,
    senderUserId: string,
    recipientUserId: string,
  ): Promise<SenderKeyDistributionRow | null> {
    const [row] = await this.db
      .select()
      .from(signalSenderKeyDistributions)
      .where(
        and(
          eq(signalSenderKeyDistributions.conversationId, conversationId),
          eq(signalSenderKeyDistributions.senderUserId, senderUserId),
          eq(signalSenderKeyDistributions.recipientUserId, recipientUserId),
        ),
      )
    return (row as SenderKeyDistributionRow | undefined) ?? null
  }

  async listSenderKeyDistributionsForRecipient(
    conversationId: string,
    recipientUserId: string,
  ): Promise<SenderKeyDistributionRow[]> {
    const rows = await this.db
      .select()
      .from(signalSenderKeyDistributions)
      .where(
        and(
          eq(signalSenderKeyDistributions.conversationId, conversationId),
          eq(signalSenderKeyDistributions.recipientUserId, recipientUserId),
        ),
      )
    return rows as SenderKeyDistributionRow[]
  }
}
