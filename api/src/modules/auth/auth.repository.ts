import { eq, and, isNull } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { users, refreshTokens, passwordResetTokens } from '../../shared/infra/database/schema.js'
import type {
  IUserRepository, User, CreateUserData, UpdateProfileData,
  RefreshToken, PasswordResetToken,
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
    const result = await this.db.update(users)
      .set({ googleId, googleLinkedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning()
    return result[0]
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

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.insert(refreshTokens).values({ userId, tokenHash, expiresAt })
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    const result = await this.db.select().from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash)).limit(1)
    return result[0] ?? null
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

  async deleteUser(userId: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, userId))
  }
}
