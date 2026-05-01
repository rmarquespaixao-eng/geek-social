import { eq, and, inArray } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { userCryptoKeys, conversationGroupKeys } from '../../shared/infra/database/schema.js'

export type UserCryptoKey = {
  userId: string
  publicKey: string
  encryptedBackup: string | null
  backupSalt: string | null
  backupIv: string | null
  createdAt: Date
  updatedAt: Date
}

export type ConversationGroupKey = {
  id: string
  conversationId: string
  userId: string
  encryptedKey: string
  keyVersion: number
  createdAt: Date
}

export class CryptoRepository {
  constructor(private readonly db: DatabaseClient) {}

  async upsertPublicKey(userId: string, publicKey: string): Promise<UserCryptoKey> {
    const [row] = await this.db
      .insert(userCryptoKeys)
      .values({ userId, publicKey, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userCryptoKeys.userId,
        set: { publicKey, updatedAt: new Date() },
      })
      .returning()
    return this.mapKey(row)
  }

  async upsertBackup(
    userId: string,
    data: { encryptedBackup: string; backupSalt: string; backupIv: string },
  ): Promise<void> {
    await this.db
      .insert(userCryptoKeys)
      .values({ userId, publicKey: '', ...data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userCryptoKeys.userId,
        set: { ...data, updatedAt: new Date() },
      })
  }

  async findByUserId(userId: string): Promise<UserCryptoKey | null> {
    const [row] = await this.db
      .select()
      .from(userCryptoKeys)
      .where(eq(userCryptoKeys.userId, userId))
    return row ? this.mapKey(row) : null
  }

  async findPublicKeysByUserIds(userIds: string[]): Promise<{ userId: string; publicKey: string }[]> {
    if (userIds.length === 0) return []
    const rows = await this.db
      .select({ userId: userCryptoKeys.userId, publicKey: userCryptoKeys.publicKey })
      .from(userCryptoKeys)
      .where(inArray(userCryptoKeys.userId, userIds))
    return rows.filter(r => r.publicKey !== '')
  }

  async upsertGroupKeys(
    entries: { conversationId: string; userId: string; encryptedKey: string; keyVersion: number }[],
  ): Promise<void> {
    if (entries.length === 0) return
    await this.db
      .insert(conversationGroupKeys)
      .values(entries)
      .onConflictDoUpdate({
        target: [
          conversationGroupKeys.conversationId,
          conversationGroupKeys.userId,
          conversationGroupKeys.keyVersion,
        ],
        set: { encryptedKey: conversationGroupKeys.encryptedKey },
      })
  }

  async findGroupKey(conversationId: string, userId: string): Promise<ConversationGroupKey | null> {
    const rows = await this.db
      .select()
      .from(conversationGroupKeys)
      .where(
        and(
          eq(conversationGroupKeys.conversationId, conversationId),
          eq(conversationGroupKeys.userId, userId),
        ),
      )
      .orderBy(conversationGroupKeys.keyVersion)
    const latest = rows[rows.length - 1]
    return latest ? this.mapGroupKey(latest) : null
  }

  private mapKey(row: typeof userCryptoKeys.$inferSelect): UserCryptoKey {
    return {
      userId: row.userId,
      publicKey: row.publicKey,
      encryptedBackup: row.encryptedBackup ?? null,
      backupSalt: row.backupSalt ?? null,
      backupIv: row.backupIv ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private mapGroupKey(row: typeof conversationGroupKeys.$inferSelect): ConversationGroupKey {
    return {
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      encryptedKey: row.encryptedKey,
      keyVersion: row.keyVersion,
      createdAt: row.createdAt,
    }
  }
}
