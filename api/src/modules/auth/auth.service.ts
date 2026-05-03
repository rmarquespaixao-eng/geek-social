import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { IUserRepository } from '../../shared/contracts/user.repository.contract.js'
import type { IEmailService } from '../../shared/contracts/email.service.contract.js'
import type { RegisterInput, LoginInput, ForgotPasswordInput, ResetPasswordInput, ChangePasswordInput, SetPasswordInput } from './auth.schema.js'

// Hash bcrypt fixo de uma senha conhecida arbitrária. Usado pra rodar bcrypt.compare
// quando o e-mail não existe, mantendo o tempo de resposta constante e evitando
// enumeração de usuário via timing oracle (#10).
const DUMMY_BCRYPT_HASH = '$2b$12$sBTavKQa0/6HhDIuyUjI/uS3Y4yTrPB5LPB3v3rnZ2WaUkbdKC.MS'

type AuthServiceConfig = {
  appUrl: string
  jwtSecret: string
  refreshTokenExpiresDays: number
}

export type AccessTokenClaims = {
  userId: string
  email: string
  tokenVersion: number
  platformRole: 'user' | 'moderator' | 'admin'
}

export type AuthResult = {
  user: { id: string; email: string; displayName: string; platformRole: 'user' | 'moderator' | 'admin' }
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
  // Callback opcional disparado após eventos que invalidam sessão (changePassword,
  // setInitialPassword, deleteAccount, logout-all). Permite que o app desconecte
  // WebSockets ativos do usuário em vez de só bloquear novos requests HTTP (#6).
  // Wiring fica em app.ts: authService.afterSessionInvalidation = (uid) => chat.disconnectUser(uid)
  public afterSessionInvalidation?: (userId: string) => void

  constructor(
    private readonly db: DatabaseClient,
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

    await this.issueEmailVerification(user.id, user.email)

    return this.buildAuthResult(user)
  }

  async confirmEmailVerification(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const stored = await this.userRepository.findEmailVerificationToken(tokenHash)

    if (!stored || stored.expiresAt < new Date() || stored.usedAt) {
      throw new AuthError('INVALID_VERIFICATION_TOKEN')
    }

    await this.userRepository.verifyEmail(stored.userId)
    await this.userRepository.markEmailVerificationTokenAsUsed(stored.id)
  }

  // Service awaitable (testável). Controller despacha em fire-and-forget (#10).
  async resendEmailVerification(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email)
    if (!user) return
    if (user.emailVerified) return

    await this.userRepository.deleteEmailVerificationTokensByUserId(user.id)
    await this.issueEmailVerification(user.id, user.email)
  }

  private async issueEmailVerification(userId: string, email: string): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await this.userRepository.createEmailVerificationToken(userId, tokenHash, expiresAt)

    const verificationUrl = `${this.config.appUrl}/verify-email#token=${token}`
    await this.emailService.sendEmailVerification(email, verificationUrl)
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(input.email)
    // Roda bcrypt.compare contra um hash dummy quando user/passwordHash não existem
    // pra equalizar o tempo de resposta. Sem isso, login com e-mail inexistente
    // retorna em ~1ms vs ~100ms quando existe — vetor de enumeração.
    const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH
    const isValid = await bcrypt.compare(input.password, hashToCompare)
    if (!user || !user.passwordHash || !isValid) {
      throw new AuthError('INVALID_CREDENTIALS')
    }
    return this.buildAuthResult(user)
  }

  async refreshToken(tokenHash: string): Promise<{ accessTokenClaims: AccessTokenClaims; newRefreshToken: string; expiresAt: Date }> {
    const stored = await this.userRepository.findRefreshToken(tokenHash)
    if (!stored || stored.expiresAt < new Date()) {
      throw new AuthError('INVALID_REFRESH_TOKEN')
    }

    // Reuso óbvio: já estava marcado como usado quando lemos. Revoga a família.
    if (stored.used) {
      await this.userRepository.revokeAllByFamilyId(stored.familyId)
      throw new AuthError('TOKEN_REUSE_DETECTED')
    }

    // Atomicidade: só uma das requisições concorrentes ganha o UPDATE ... WHERE used=false.
    // Sem isso, dois requests com o mesmo refresh passam pela checagem `stored.used`
    // antes de qualquer um marcar — ambos rotacionariam, derrotando a detecção de reuso.
    const won = await this.userRepository.markRefreshTokenAsUsed(stored.id)
    if (!won) {
      await this.userRepository.revokeAllByFamilyId(stored.familyId)
      throw new AuthError('TOKEN_REUSE_DETECTED')
    }

    const user = await this.userRepository.findById(stored.userId)
    if (!user) throw new AuthError('INVALID_REFRESH_TOKEN')

    const newToken = crypto.randomBytes(32).toString('hex')
    const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex')
    const expiresAt = this.buildRefreshTokenExpiry()

    await this.userRepository.createRefreshToken(user.id, newTokenHash, expiresAt, stored.familyId)

    return {
      accessTokenClaims: { userId: user.id, email: user.email, tokenVersion: user.tokenVersion, platformRole: user.platformRole },
      newRefreshToken: newToken,
      expiresAt,
    }
  }

  // Service awaitable (testável). Controller despacha em fire-and-forget pra
  // não vazar timing oracle de enumeração (auditoria #10).
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.userRepository.findByEmail(input.email)
    if (!user) return

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await this.userRepository.createPasswordResetToken(user.id, tokenHash, expiresAt)

    const resetUrl = `${this.config.appUrl}/reset-password#token=${token}`
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
    emailVerified: boolean
    displayName: string
    avatarUrl?: string | null
  }): Promise<{ result: AuthResult; created: boolean }> {
    if (!input.emailVerified) {
      throw new AuthError('OAUTH_EMAIL_NOT_VERIFIED')
    }

    let user = await this.userRepository.findByGoogleId(input.googleId)
    let created = false

    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(input.email)
      if (existingByEmail) {
        throw new AuthError('ACCOUNT_EXISTS_WITH_PASSWORD')
      }
      user = await this.userRepository.create({
        email: input.email,
        displayName: input.displayName,
        googleId: input.googleId,
        emailVerified: true,
        avatarUrl: input.avatarUrl ?? null,
      })
      created = true
    } else if (!user.avatarUrl && input.avatarUrl) {
      user = await this.userRepository.updateProfile(user.id, { avatarUrl: input.avatarUrl })
    }

    const result = await this.buildAuthResult(user)
    return { result, created }
  }

  async linkGoogleAccount(input: {
    userId: string
    googleId: string
    email: string
    emailVerified: boolean
    avatarUrl?: string | null
  }): Promise<void> {
    if (!input.emailVerified) {
      throw new AuthError('OAUTH_EMAIL_NOT_VERIFIED')
    }

    // Atomicidade entre linkGoogle e updateProfile (avatar). A *segurança* contra
    // race de "dois users vinculando o mesmo googleId" depende da UNIQUE constraint
    // em users.google_id — o repo.linkGoogle traduz violação 23505 em
    // 'GOOGLE_ALREADY_LINKED_TO_OTHER_USER' (capturado abaixo). A transação aqui
    // garante que se algo falhar entre linkGoogle e updateProfile, nem avatar nem
    // googleId ficam pela metade.
    try {
      await this.db.transaction(async () => {
        const user = await this.userRepository.findById(input.userId)
        if (!user) throw new AuthError('USER_NOT_FOUND')
        if (user.email.toLowerCase() !== input.email.toLowerCase()) {
          throw new AuthError('OAUTH_EMAIL_MISMATCH')
        }
        const ownedBy = await this.userRepository.findByGoogleId(input.googleId)
        if (ownedBy && ownedBy.id !== input.userId) {
          throw new AuthError('GOOGLE_ALREADY_LINKED_TO_OTHER_USER')
        }
        if (ownedBy && ownedBy.id === input.userId) return
        await this.userRepository.linkGoogle(input.userId, input.googleId)
        if (input.avatarUrl && !user.avatarUrl) {
          await this.userRepository.updateProfile(input.userId, { avatarUrl: input.avatarUrl })
        }
      })
    } catch (err) {
      if (err instanceof Error && err.message === 'GOOGLE_ALREADY_LINKED_TO_OTHER_USER') {
        throw new AuthError('GOOGLE_ALREADY_LINKED_TO_OTHER_USER')
      }
      throw err
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

  private async buildAuthResult(user: { id: string; email: string; displayName: string; tokenVersion: number; platformRole: 'user' | 'moderator' | 'admin' }): Promise<AuthResult> {
    const refreshToken = crypto.randomBytes(32).toString('hex')
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const refreshTokenExpiresAt = this.buildRefreshTokenExpiry()

    await this.userRepository.createRefreshToken(user.id, refreshTokenHash, refreshTokenExpiresAt)

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, platformRole: user.platformRole },
      accessTokenClaims: { userId: user.id, email: user.email, tokenVersion: user.tokenVersion, platformRole: user.platformRole },
      refreshToken,
      refreshTokenExpiresAt,
    }
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.userRepository.findById(userId)
    // Para evitar timing oracle, rodar bcrypt mesmo quando user/hash não existem.
    const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH
    const isValid = await bcrypt.compare(input.currentPassword, hashToCompare)
    if (!user || !user.passwordHash || !isValid) {
      throw new AuthError('INVALID_CREDENTIALS')
    }

    const newHash = await bcrypt.hash(input.newPassword, 12)
    await this.userRepository.updatePassword(userId, newHash)
    await this.userRepository.deleteAllRefreshTokensByUserId(userId)
    // Invalida JWTs já emitidos (sessões paralelas ficam inutilizáveis até o próximo refresh).
    await this.userRepository.incrementTokenVersion(userId)
    this.afterSessionInvalidation?.(userId)
  }

  // Logout só do dispositivo atual. Mantém JWT da sessão válido pelos próximos ≤15min
  // (TTL do access token); UX padrão (Twitter, GitHub) — outros dispositivos seguem.
  // Pra revogar todos os dispositivos, usar logoutAllSessions.
  async logout(tokenHash: string): Promise<void> {
    await this.userRepository.deleteRefreshToken(tokenHash)
  }

  // Logout global: revoga todos os refresh tokens E incrementa tokenVersion para
  // invalidar JWTs ativos em todos os dispositivos imediatamente. Endpoint separado
  // pra usuário escolher entre "sair daqui" e "sair de todos os lugares" (#9).
  async logoutAllSessions(userId: string): Promise<void> {
    await this.userRepository.deleteAllRefreshTokensByUserId(userId)
    await this.userRepository.incrementTokenVersion(userId)
    this.afterSessionInvalidation?.(userId)
  }

  async setInitialPassword(userId: string, input: SetPasswordInput): Promise<void> {
    const user = await this.userRepository.findById(userId)
    if (!user) throw new AuthError('USER_NOT_FOUND')

    // Conta com senha: rejeitar imediatamente. Não usar bcrypt aqui — diferenciar
    // status code entre "senha errada" e "senha correta" criava oracle binário
    // de validação de senha (#1). Quem quer trocar senha usa /change-password.
    if (user.passwordHash) {
      throw new AuthError('PASSWORD_ALREADY_SET')
    }

    // Conta Google-only (sem senha): exige token de verificação de e-mail para
    // confirmar que o titular da conta está no controle do endereço.
    if (!input.emailVerificationToken) throw new AuthError('EMAIL_VERIFICATION_REQUIRED')
    const tokenHash = crypto.createHash('sha256').update(input.emailVerificationToken).digest('hex')
    const stored = await this.userRepository.findEmailVerificationToken(tokenHash)
    if (!stored || stored.userId !== userId || stored.expiresAt < new Date() || stored.usedAt) {
      throw new AuthError('INVALID_VERIFICATION_TOKEN')
    }

    const newHash = await bcrypt.hash(input.newPassword, 12)
    await this.userRepository.updatePassword(userId, newHash)
    await this.userRepository.markEmailVerificationTokenAsUsed(stored.id)
    // Invalida JWTs já emitidos: definir senha cria um novo fator de autenticação;
    // sessões antigas (emitidas só com OAuth) devem ser revalidadas.
    await this.userRepository.deleteAllRefreshTokensByUserId(userId)
    await this.userRepository.incrementTokenVersion(userId)
    this.afterSessionInvalidation?.(userId)
  }

  private buildRefreshTokenExpiry(): Date {
    return new Date(Date.now() + this.config.refreshTokenExpiresDays * 24 * 60 * 60 * 1000)
  }
}
