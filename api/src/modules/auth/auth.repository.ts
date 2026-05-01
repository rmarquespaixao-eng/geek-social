import { eq, and, isNull, sql } from 'drizzle-orm'
// Erro de violação de unique constraint no Postgres (23505).
const PG_UNIQUE_VIOLATION = '23505'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { users, refreshTokens, passwordResetTokens, emailVerificationTokens } from '../../shared/infra/database/schema.js'
import type {
  IUserRepository, User, CreateUserData, UpdateProfileData,
  RefreshToken, PasswordResetToken, EmailVerificationToken,
} from '../../shared/contracts/user.repository.contract.js'

export class UserRepository implements IUserRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findById(id: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return result[0] ?? null
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1)
    return result[0] ?? null
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.googleId, googleId)).limit(1)
    return result[0] ?? null
  }

  async linkGoogle(userId: string, googleId: string): Promise<User> {
    try {
      const result = await this.db.update(users)
        .set({ googleId, googleLinkedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning()
      return result[0]
    } catch (err: unknown) {
      // Race lost: outro request já vinculou esse googleId. Traduz pra erro de domínio
      // pra service/controller mapear pra 409 sem expor detalhes do Postgres.
      const e = err as { code?: string }
      if (e?.code === PG_UNIQUE_VIOLATION) {
        throw new Error('GOOGLE_ALREADY_LINKED_TO_OTHER_USER')
      }
      throw err
    }
  }

  async unlinkGoogle(userId: string): Promise<User> {
    const result = await this.db.update(users)
      .set({ googleId: null, googleLinkedAt: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    return result[0]
  }

  async create(data: CreateUserData): Promise<User> {
    const result = await this.db.insert(users).values({
      email: data.email,
      passwordHash: data.passwordHash ?? null,
      displayName: data.displayName,
      googleId: data.googleId ?? null,
      googleLinkedAt: data.googleId ? new Date() : null,
      avatarUrl: data.avatarUrl ?? null,
      emailVerified: data.emailVerified ?? false,
    }).returning()
    return result[0]
  }

  async updateProfile(id: string, data: UpdateProfileData): Promise<User> {
    const result = await this.db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()
    return result[0]
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.db.update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
  }

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date, familyId?: string): Promise<void> {
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash,
      expiresAt,
      ...(familyId ? { familyId } : {}),
    })
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    const result = await this.db.select().from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash)).limit(1)
    return result[0] ?? null
  }

  async markRefreshTokenAsUsed(id: string): Promise<boolean> {
    const result = await this.db.update(refreshTokens)
      .set({ used: true })
      .where(and(eq(refreshTokens.id, id), eq(refreshTokens.used, false)))
      .returning({ id: refreshTokens.id })
    return result.length > 0
  }

  async revokeAllByFamilyId(familyId: string): Promise<void> {
    await this.db.delete(refreshTokens).where(eq(refreshTokens.familyId, familyId))
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    await this.db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash))
  }

  async deleteAllRefreshTokensByUserId(userId: string): Promise<void> {
    await this.db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
  }

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt })
  }

  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null> {
    const result = await this.db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
      )).limit(1)
    return result[0] ?? null
  }

  async markPasswordResetTokenAsUsed(id: string): Promise<void> {
    await this.db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id))
  }

  async createEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.insert(emailVerificationTokens).values({ userId, tokenHash, expiresAt })
  }

  async findEmailVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null> {
    const result = await this.db.select().from(emailVerificationTokens)
      .where(and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.usedAt),
      )).limit(1)
    return result[0] ?? null
  }

  async markEmailVerificationTokenAsUsed(id: string): Promise<void> {
    await this.db.update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, id))
  }

  async deleteEmailVerificationTokensByUserId(userId: string): Promise<void> {
    await this.db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId))
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId))
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    await this.db.update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, userId))
  }
}
