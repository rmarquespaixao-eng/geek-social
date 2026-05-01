export type User = {
  id: string
  email: string
  passwordHash: string | null
  displayName: string
  bio: string | null
  avatarUrl: string | null
  coverUrl: string | null
  coverColor: string | null
  profileBackgroundUrl: string | null
  profileBackgroundColor: string | null
  privacy: 'public' | 'friends_only' | 'private'
  emailVerified: boolean
  showPresence: boolean
  showReadReceipts: boolean
  steamId: string | null
  steamLinkedAt: Date | null
  steamApiKey: string | null
  googleId: string | null
  googleLinkedAt: Date | null
  birthday: string | null
  interests: string[]
  pronouns: string | null
  location: string | null
  website: string | null
  tokenVersion: number
  createdAt: Date
  updatedAt: Date
}

export type CreateUserData = {
  email: string
  passwordHash?: string
  displayName: string
  googleId?: string
  emailVerified?: boolean
  avatarUrl?: string | null
}

export type UpdateProfileData = {
  displayName?: string
  bio?: string | null
  avatarUrl?: string | null
  coverUrl?: string | null
  coverColor?: string | null
  profileBackgroundUrl?: string | null
  profileBackgroundColor?: string | null
  privacy?: 'public' | 'friends_only' | 'private'
  showPresence?: boolean
  showReadReceipts?: boolean
  birthday?: string | null
  interests?: string[]
  pronouns?: string | null
  location?: string | null
  website?: string | null
}

export type RefreshToken = {
  id: string
  userId: string
  tokenHash: string
  familyId: string
  used: boolean
  expiresAt: Date
  createdAt: Date
}

export type PasswordResetToken = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
}

export type EmailVerificationToken = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findByGoogleId(googleId: string): Promise<User | null>
  linkGoogle(userId: string, googleId: string): Promise<User>
  unlinkGoogle(userId: string): Promise<User>
  create(data: CreateUserData): Promise<User>
  updateProfile(id: string, data: UpdateProfileData): Promise<User>
  updatePassword(userId: string, passwordHash: string): Promise<void>
  verifyEmail(userId: string): Promise<void>
  createRefreshToken(userId: string, tokenHash: string, expiresAt: Date, familyId?: string): Promise<void>
  findRefreshToken(tokenHash: string): Promise<RefreshToken | null>
  // Retorna true se ganhou a corrida (UPDATE ... WHERE used = false). Falso significa
  // que outra transação já marcou — sinal de reuso, caller deve revogar a família.
  markRefreshTokenAsUsed(id: string): Promise<boolean>
  revokeAllByFamilyId(familyId: string): Promise<void>
  deleteRefreshToken(tokenHash: string): Promise<void>
  deleteAllRefreshTokensByUserId(userId: string): Promise<void>
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>
  findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null>
  markPasswordResetTokenAsUsed(id: string): Promise<void>
  createEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>
  findEmailVerificationToken(tokenHash: string): Promise<EmailVerificationToken | null>
  markEmailVerificationTokenAsUsed(id: string): Promise<void>
  deleteEmailVerificationTokensByUserId(userId: string): Promise<void>
  deleteUser(userId: string): Promise<void>
  incrementTokenVersion(userId: string): Promise<void>
}
