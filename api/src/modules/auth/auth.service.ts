import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import type { IUserRepository } from '../../shared/contracts/user.repository.contract.js'
import type { IEmailService } from '../../shared/contracts/email.service.contract.js'
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput, ChangePasswordInput, SetPasswordInput } from './auth.schema.js'

type AuthServiceConfig = {
  appUrl: string
  jwtSecret: string
  refreshTokenExpiresDays: number
}

export type AccessTokenClaims = {
  userId: string
  email: string
}

export type AuthResult = {
  user: { id: string; email: string; displayName: string }
  accessTokenClaims: AccessTokenClaims
  refreshToken: string
  refreshTokenExpiresAt: Date
}

export class AuthError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'AuthError'
  }
}

export class AuthService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService: IEmailService,
    private readonly config: AuthServiceConfig,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.userRepository.findByEmail(input.email)
    if (existing) throw new AuthError('EMAIL_ALREADY_EXISTS')

    const passwordHash = await bcrypt.hash(input.password, 12)
    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    })

    const verificationToken = crypto.randomBytes(32).toString('hex')
    const verificationUrl = `${this.config.appUrl}/auth/verify-email?token=${verificationToken}`
    await this.emailService.sendEmailVerification(user.email, verificationUrl)

    return this.buildAuthResult(user)
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(input.email)
    if (!user) throw new AuthError('INVALID_CREDENTIALS')
    if (!user.passwordHash) throw new AuthError('INVALID_CREDENTIALS')

    const isValid = await bcrypt.compare(input.password, user.passwordHash)
    if (!isValid) throw new AuthError('INVALID_CREDENTIALS')

    return this.buildAuthResult(user)
  }

  async refreshToken(tokenHash: string): Promise<{ accessTokenClaims: AccessTokenClaims; newRefreshToken: string; expiresAt: Date }> {
    const stored = await this.userRepository.findRefreshToken(tokenHash)
    if (!stored || stored.expiresAt < new Date()) {
      throw new AuthError('INVALID_REFRESH_TOKEN')
    }

    const user = await this.userRepository.findById(stored.userId)
    if (!user) throw new AuthError('INVALID_REFRESH_TOKEN')

    await this.userRepository.deleteRefreshToken(tokenHash)

    const newToken = crypto.randomBytes(32).toString('hex')
    const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex')
    const expiresAt = this.buildRefreshTokenExpiry()

    await this.userRepository.createRefreshToken(user.id, newTokenHash, expiresAt)

    return {
      accessTokenClaims: { userId: user.id, email: user.email },
      newRefreshToken: newToken,
      expiresAt,
    }
  }

  async logout(tokenHash: string): Promise<void> {
    await this.userRepository.deleteRefreshToken(tokenHash)
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.userRepository.findByEmail(input.email)
    if (!user) return

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await this.userRepository.createPasswordResetToken(user.id, tokenHash, expiresAt)

    const resetUrl = `${this.config.appUrl}/auth/reset-password?token=${token}`
    await this.emailService.sendPasswordResetEmail(user.email, resetUrl)
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex')
    const stored = await this.userRepository.findPasswordResetToken(tokenHash)

    if (!stored || stored.expiresAt < new Date() || stored.usedAt) {
      throw new AuthError('INVALID_RESET_TOKEN')
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12)
    await this.userRepository.updatePassword(stored.userId, passwordHash)
    await this.userRepository.markPasswordResetTokenAsUsed(stored.id)
    await this.userRepository.deleteAllRefreshTokensByUserId(stored.userId)
  }

  async loginWithGoogle(input: {
    googleId: string
    email: string
    displayName: string
    avatarUrl?: string | null
  }): Promise<{ result: AuthResult; created: boolean; linked: boolean }> {
    let user = await this.userRepository.findByGoogleId(input.googleId)
    let created = false
    let linked = false

    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(input.email)
      if (existingByEmail) {
        user = await this.userRepository.linkGoogle(existingByEmail.id, input.googleId)
        linked = true
        // Aplica a foto do Google se o user ainda não tem avatar próprio
        if (!existingByEmail.avatarUrl && input.avatarUrl) {
          user = await this.userRepository.updateProfile(user.id, { avatarUrl: input.avatarUrl })
        }
      } else {
        user = await this.userRepository.create({
          email: input.email,
          displayName: input.displayName,
          googleId: input.googleId,
          emailVerified: true,
          avatarUrl: input.avatarUrl ?? null,
        })
        created = true
      }
    } else if (!user.avatarUrl && input.avatarUrl) {
      // Já vinculado, mas sem avatar — sincroniza a partir do Google
      user = await this.userRepository.updateProfile(user.id, { avatarUrl: input.avatarUrl })
    }

    const result = await this.buildAuthResult(user)
    return { result, created, linked }
  }

  async linkGoogleAccount(userId: string, googleId: string, avatarUrl?: string | null): Promise<void> {
    const ownedBy = await this.userRepository.findByGoogleId(googleId)
    if (ownedBy && ownedBy.id !== userId) {
      throw new AuthError('GOOGLE_ALREADY_LINKED_TO_OTHER_USER')
    }
    if (ownedBy && ownedBy.id === userId) return
    await this.userRepository.linkGoogle(userId, googleId)
    // Aplica avatar do Google se o user ainda não tem foto
    if (avatarUrl) {
      const user = await this.userRepository.findById(userId)
      if (user && !user.avatarUrl) {
        await this.userRepository.updateProfile(userId, { avatarUrl })
      }
    }
  }

  async unlinkGoogleAccount(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (!user) throw new AuthError('USER_NOT_FOUND')
    if (!user.googleId) throw new AuthError('GOOGLE_NOT_LINKED')
    if (!user.passwordHash) {
      throw new AuthError('PASSWORD_REQUIRED_BEFORE_UNLINK')
    }
    await this.userRepository.unlinkGoogle(userId)
  }

  private async buildAuthResult(user: { id: string; email: string; displayName: string }): Promise<AuthResult> {
    const refreshToken = crypto.randomBytes(32).toString('hex')
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const refreshTokenExpiresAt = this.buildRefreshTokenExpiry()

    await this.userRepository.createRefreshToken(user.id, refreshTokenHash, refreshTokenExpiresAt)

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      accessTokenClaims: { userId: user.id, email: user.email },
      refreshToken,
      refreshTokenExpiresAt,
    }
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (!user || !user.passwordHash) throw new AuthError('INVALID_CREDENTIALS')

    const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash)
    if (!isValid) throw new AuthError('INVALID_CREDENTIALS')

    const newHash = await bcrypt.hash(input.newPassword, 12)
    await this.userRepository.updatePassword(userId, newHash)
  }

  async setInitialPassword(userId: string, input: SetPasswordInput): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (!user) throw new AuthError('USER_NOT_FOUND')
    if (user.passwordHash) throw new AuthError('PASSWORD_ALREADY_SET')

    const newHash = await bcrypt.hash(input.newPassword, 12)
    await this.userRepository.updatePassword(userId, newHash)
  }

  private buildRefreshTokenExpiry(): Date {
    return new Date(Date.now() + this.config.refreshTokenExpiresDays * 24 * 60 * 60 * 1000)
  }
}
