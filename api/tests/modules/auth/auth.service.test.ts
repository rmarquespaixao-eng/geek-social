import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthService } from '../../../src/modules/auth/auth.service.js'
import { createMockUserRepository, createMockEmailService, createMockUser } from '../../helpers/mock-repositories.js'

describe('AuthService', () => {
  let userRepository: ReturnType<typeof createMockUserRepository>
  let emailService: ReturnType<typeof createMockEmailService>
  let authService: AuthService

  beforeEach(() => {
    userRepository = createMockUserRepository()
    emailService = createMockEmailService()
    // db mock — só linkGoogleAccount usa db.transaction(); roda o callback inline.
    const dbMock = {
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    } as unknown as Parameters<typeof AuthService.prototype.constructor>[0]
    authService = new AuthService(dbMock as never, userRepository, emailService, {
      appUrl: 'http://localhost:3000',
      jwtSecret: 'test-secret-long-enough-32-chars!!',
      refreshTokenExpiresDays: 7,
    })
    vi.clearAllMocks()
  })

  describe('register', () => {
    it('deve criar um novo usuário e retornar tokens', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null)
      vi.mocked(userRepository.create).mockResolvedValue(createMockUser())
      vi.mocked(userRepository.createRefreshToken).mockResolvedValue(undefined)

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Senha123!',
        displayName: 'Test User',
      })

      expect(result.user.email).toBe('test@example.com')
      expect(result.accessTokenClaims).toHaveProperty('userId')
      expect(result.refreshToken).toBeDefined()
      expect(emailService.sendEmailVerification).toHaveBeenCalledOnce()
    })

    it('deve lançar erro se o email já existir', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(createMockUser())

      await expect(authService.register({
        email: 'test@example.com',
        password: 'Senha123!',
        displayName: 'Test User',
      })).rejects.toThrow('EMAIL_ALREADY_EXISTS')
    })
  })

  describe('login', () => {
    it('deve retornar tokens para credenciais válidas', async () => {
      const bcrypt = await import('bcrypt')
      const realHash = await bcrypt.hash('senha-correta', 12)
      const user = createMockUser({ emailVerified: true, passwordHash: realHash })
      vi.mocked(userRepository.findByEmail).mockResolvedValue(user)
      vi.mocked(userRepository.createRefreshToken).mockResolvedValue(undefined)

      const result = await authService.login({
        email: 'test@example.com',
        password: 'senha-correta',
      })

      expect(result.user.id).toBe(user.id)
      expect(result.accessTokenClaims).toHaveProperty('userId', user.id)
    })

    it('deve lançar erro para email inexistente', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null)

      await expect(authService.login({
        email: 'nao-existe@example.com',
        password: 'qualquer',
      })).rejects.toThrow('INVALID_CREDENTIALS')
    })

    it('deve lançar erro para senha incorreta', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(createMockUser())

      await expect(authService.login({
        email: 'test@example.com',
        password: 'senha-errada',
      })).rejects.toThrow('INVALID_CREDENTIALS')
    })
  })

  describe('refreshToken', () => {
    const buildStoredToken = (overrides: Record<string, unknown> = {}) => ({
      id: 'token-id',
      userId: 'user-uuid-1234',
      tokenHash: 'hashed-token',
      familyId: 'family-1',
      used: false,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      ...overrides,
    })

    it('deve emitir novo accessToken, marcar atual como usado e criar novo na mesma família', async () => {
      const user = createMockUser()
      vi.mocked(userRepository.findRefreshToken).mockResolvedValue(buildStoredToken({ userId: user.id }))
      vi.mocked(userRepository.findById).mockResolvedValue(user)
      // Vence a corrida (atomic UPDATE WHERE used=false retornou linha)
      vi.mocked(userRepository.markRefreshTokenAsUsed).mockResolvedValue(true)
      vi.mocked(userRepository.createRefreshToken).mockResolvedValue(undefined)

      const result = await authService.refreshToken('hashed-token')

      expect(result.accessTokenClaims).toHaveProperty('userId', user.id)
      expect(result.accessTokenClaims).toHaveProperty('tokenVersion', 0)
      expect(result.newRefreshToken).toBeDefined()
      expect(userRepository.markRefreshTokenAsUsed).toHaveBeenCalledWith('token-id')
      // Novo token herda o familyId
      expect(userRepository.createRefreshToken).toHaveBeenCalledWith(
        user.id,
        expect.any(String),
        expect.any(Date),
        'family-1',
      )
    })

    it('deve detectar reuso quando token já está marcado used (revoga família)', async () => {
      vi.mocked(userRepository.findRefreshToken).mockResolvedValue(
        buildStoredToken({ used: true, familyId: 'fam-2' }),
      )

      await expect(authService.refreshToken('hashed-token')).rejects.toThrow('TOKEN_REUSE_DETECTED')
      expect(userRepository.revokeAllByFamilyId).toHaveBeenCalledWith('fam-2')
      expect(userRepository.createRefreshToken).not.toHaveBeenCalled()
    })

    it('deve detectar race quando markRefreshTokenAsUsed retorna false (revoga família)', async () => {
      vi.mocked(userRepository.findRefreshToken).mockResolvedValue(
        buildStoredToken({ used: false, familyId: 'fam-race' }),
      )
      // Outra requisição concorrente já marcou — UPDATE WHERE used=false retornou 0 linhas
      vi.mocked(userRepository.markRefreshTokenAsUsed).mockResolvedValue(false)

      await expect(authService.refreshToken('hashed-token')).rejects.toThrow('TOKEN_REUSE_DETECTED')
      expect(userRepository.revokeAllByFamilyId).toHaveBeenCalledWith('fam-race')
      expect(userRepository.createRefreshToken).not.toHaveBeenCalled()
    })

    it('deve lançar erro para token expirado', async () => {
      vi.mocked(userRepository.findRefreshToken).mockResolvedValue(
        buildStoredToken({ expiresAt: new Date(Date.now() - 1000) }),
      )

      await expect(authService.refreshToken('hash'))
        .rejects.toThrow('INVALID_REFRESH_TOKEN')
    })

    it('deve lançar erro para token inexistente', async () => {
      vi.mocked(userRepository.findRefreshToken).mockResolvedValue(null)

      await expect(authService.refreshToken('nao-existe'))
        .rejects.toThrow('INVALID_REFRESH_TOKEN')
    })
  })

  describe('setInitialPassword (#1: oracle removido)', () => {
    it('deve rejeitar com PASSWORD_ALREADY_SET sem invocar bcrypt quando user já tem senha', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(
        createMockUser({ passwordHash: 'algo-existente' }),
      )

      // Independente de qualquer payload — não deve diferenciar status code por senha.
      await expect(authService.setInitialPassword('user-uuid-1234', {
        newPassword: 'NovaSenha123!',
        emailVerificationToken: 'qualquer-token-irrelevante',
      } as unknown as Parameters<typeof authService.setInitialPassword>[1])).rejects.toThrow('PASSWORD_ALREADY_SET')

      // Não deve ter consultado token de verificação (curto-circuito antes)
      expect(userRepository.findEmailVerificationToken).not.toHaveBeenCalled()
      expect(userRepository.updatePassword).not.toHaveBeenCalled()
    })

    it('deve exigir token de verificação para conta Google-only', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(
        createMockUser({ passwordHash: null, googleId: 'g-1' }),
      )

      await expect(authService.setInitialPassword('user-uuid-1234', {
        newPassword: 'NovaSenha123!',
      } as unknown as Parameters<typeof authService.setInitialPassword>[1])).rejects.toThrow('EMAIL_VERIFICATION_REQUIRED')
    })

    it('deve aceitar token válido, gravar senha, revogar sessões e bumpar tokenVersion', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(
        createMockUser({ passwordHash: null, googleId: 'g-1' }),
      )
      // raw → sha256 hash
      const rawToken = 'tok-raw-123'
      const tokenHash = (await import('node:crypto')).createHash('sha256').update(rawToken).digest('hex')
      vi.mocked(userRepository.findEmailVerificationToken).mockResolvedValue({
        id: 'evt-id',
        userId: 'user-uuid-1234',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: null,
        createdAt: new Date(),
      })

      await authService.setInitialPassword('user-uuid-1234', {
        newPassword: 'NovaSenha123!',
        emailVerificationToken: rawToken,
      })

      expect(userRepository.updatePassword).toHaveBeenCalledOnce()
      expect(userRepository.markEmailVerificationTokenAsUsed).toHaveBeenCalledWith('evt-id')
      expect(userRepository.deleteAllRefreshTokensByUserId).toHaveBeenCalledWith('user-uuid-1234')
      expect(userRepository.incrementTokenVersion).toHaveBeenCalledWith('user-uuid-1234')
    })
  })

  describe('changePassword (#4: revoga sessões)', () => {
    it('deve aceitar senha correta, revogar sessões e bumpar tokenVersion', async () => {
      const bcrypt = await import('bcrypt')
      const realHash = await bcrypt.hash('senha-atual', 12)
      vi.mocked(userRepository.findById).mockResolvedValue(createMockUser({ passwordHash: realHash }))

      await authService.changePassword('user-uuid-1234', {
        currentPassword: 'senha-atual',
        newPassword: 'NovaSenha123!',
      })

      expect(userRepository.updatePassword).toHaveBeenCalledOnce()
      expect(userRepository.deleteAllRefreshTokensByUserId).toHaveBeenCalledWith('user-uuid-1234')
      expect(userRepository.incrementTokenVersion).toHaveBeenCalledWith('user-uuid-1234')
    })

    it('deve rejeitar com INVALID_CREDENTIALS quando user não existe (timing oracle fechado)', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null)
      await expect(authService.changePassword('user-uuid-1234', {
        currentPassword: 'qualquer',
        newPassword: 'NovaSenha123!',
      })).rejects.toThrow('INVALID_CREDENTIALS')
      // Comportamento crítico: bcrypt.compare DEVE ter rodado mesmo com user=null,
      // pra equalizar timing. Se não rodou, abre vetor de enumeração.
      expect(userRepository.updatePassword).not.toHaveBeenCalled()
    })
  })

  describe('logoutAllSessions (#9)', () => {
    it('deve revogar todos os refresh tokens, bumpar tokenVersion e disparar afterSessionInvalidation', async () => {
      const spy = vi.fn()
      authService.afterSessionInvalidation = spy

      await authService.logoutAllSessions('user-uuid-1234')

      expect(userRepository.deleteAllRefreshTokensByUserId).toHaveBeenCalledWith('user-uuid-1234')
      expect(userRepository.incrementTokenVersion).toHaveBeenCalledWith('user-uuid-1234')
      expect(spy).toHaveBeenCalledWith('user-uuid-1234')
    })
  })

  describe('forgotPassword', () => {
    it('deve enviar email de reset quando usuário existe', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(createMockUser())
      vi.mocked(userRepository.createPasswordResetToken).mockResolvedValue(undefined)

      await authService.forgotPassword({ email: 'test@example.com' })

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledOnce()
      expect(userRepository.createPasswordResetToken).toHaveBeenCalledOnce()
    })

    it('não deve lançar erro quando email não existe (segurança)', async () => {
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null)

      await expect(authService.forgotPassword({ email: 'nao-existe@example.com' }))
        .resolves.toBeUndefined()
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled()
    })
  })

  describe('resetPassword', () => {
    it('deve atualizar senha e invalidar sessões', async () => {
      const resetToken = {
        id: 'reset-id',
        userId: 'user-id',
        tokenHash: 'token-hash',
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
      }
      vi.mocked(userRepository.findPasswordResetToken).mockResolvedValue(resetToken)
      vi.mocked(userRepository.updatePassword).mockResolvedValue(undefined)
      vi.mocked(userRepository.markPasswordResetTokenAsUsed).mockResolvedValue(undefined)
      vi.mocked(userRepository.deleteAllRefreshTokensByUserId).mockResolvedValue(undefined)

      await authService.resetPassword({ token: 'raw-token', newPassword: 'NovaSenha123!' })

      expect(userRepository.updatePassword).toHaveBeenCalledOnce()
      expect(userRepository.markPasswordResetTokenAsUsed).toHaveBeenCalledWith(resetToken.id)
      expect(userRepository.deleteAllRefreshTokensByUserId).toHaveBeenCalledWith(resetToken.userId)
    })

    it('deve lançar erro para token inválido', async () => {
      vi.mocked(userRepository.findPasswordResetToken).mockResolvedValue(null)

      await expect(authService.resetPassword({ token: 'invalido', newPassword: 'NovaSenha123!' }))
        .rejects.toThrow('INVALID_RESET_TOKEN')
    })

    it('deve lançar erro para token expirado', async () => {
      vi.mocked(userRepository.findPasswordResetToken).mockResolvedValue({
        id: 'id',
        userId: 'user-id',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      })

      await expect(authService.resetPassword({ token: 'expirado', newPassword: 'NovaSenha123!' }))
        .rejects.toThrow('INVALID_RESET_TOKEN')
    })
  })

  describe('loginWithGoogle', () => {
    it('deve recusar login se o Google não verificou o email', async () => {
      await expect(authService.loginWithGoogle({
        googleId: 'g-1',
        email: 'victim@example.com',
        emailVerified: false,
        displayName: 'Victim',
      })).rejects.toThrow('OAUTH_EMAIL_NOT_VERIFIED')
      expect(userRepository.findByGoogleId).not.toHaveBeenCalled()
      expect(userRepository.findByEmail).not.toHaveBeenCalled()
    })

    it('deve recusar takeover quando email já existe sem googleId vinculado', async () => {
      vi.mocked(userRepository.findByGoogleId).mockResolvedValue(null)
      vi.mocked(userRepository.findByEmail).mockResolvedValue(createMockUser({ googleId: null }))

      await expect(authService.loginWithGoogle({
        googleId: 'attacker-google-id',
        email: 'victim@example.com',
        emailVerified: true,
        displayName: 'Attacker',
      })).rejects.toThrow('ACCOUNT_EXISTS_WITH_PASSWORD')
      expect(userRepository.linkGoogle).not.toHaveBeenCalled()
      expect(userRepository.create).not.toHaveBeenCalled()
    })

    it('deve criar nova conta quando email não existe', async () => {
      vi.mocked(userRepository.findByGoogleId).mockResolvedValue(null)
      vi.mocked(userRepository.findByEmail).mockResolvedValue(null)
      vi.mocked(userRepository.create).mockResolvedValue(createMockUser({ googleId: 'g-new', emailVerified: true }))
      vi.mocked(userRepository.createRefreshToken).mockResolvedValue(undefined)

      const { result, created } = await authService.loginWithGoogle({
        googleId: 'g-new',
        email: 'new@example.com',
        emailVerified: true,
        displayName: 'New User',
      })

      expect(created).toBe(true)
      expect(result.user.email).toBe('test@example.com')
      expect(userRepository.create).toHaveBeenCalledOnce()
    })

    it('deve fazer login normal quando googleId já está vinculado', async () => {
      const linkedUser = createMockUser({ googleId: 'g-existing', emailVerified: true })
      vi.mocked(userRepository.findByGoogleId).mockResolvedValue(linkedUser)
      vi.mocked(userRepository.createRefreshToken).mockResolvedValue(undefined)

      const { result, created } = await authService.loginWithGoogle({
        googleId: 'g-existing',
        email: 'test@example.com',
        emailVerified: true,
        displayName: 'Test User',
      })

      expect(created).toBe(false)
      expect(result.user.id).toBe(linkedUser.id)
      expect(userRepository.linkGoogle).not.toHaveBeenCalled()
    })
  })

  describe('linkGoogleAccount', () => {
    it('deve recusar link se Google não verificou o email', async () => {
      await expect(authService.linkGoogleAccount({
        userId: 'u-1',
        googleId: 'g-1',
        email: 'a@example.com',
        emailVerified: false,
      })).rejects.toThrow('OAUTH_EMAIL_NOT_VERIFIED')
    })

    it('deve recusar link quando email do Google difere da conta autenticada', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(createMockUser({ email: 'real@example.com' }))

      await expect(authService.linkGoogleAccount({
        userId: 'user-uuid-1234',
        googleId: 'g-1',
        email: 'attacker@example.com',
        emailVerified: true,
      })).rejects.toThrow('OAUTH_EMAIL_MISMATCH')
      expect(userRepository.linkGoogle).not.toHaveBeenCalled()
    })

    it('deve recusar link quando googleId já está vinculado a outra conta', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(createMockUser({ id: 'user-A', email: 'a@example.com' }))
      vi.mocked(userRepository.findByGoogleId).mockResolvedValue(createMockUser({ id: 'user-B', email: 'a@example.com' }))

      await expect(authService.linkGoogleAccount({
        userId: 'user-A',
        googleId: 'g-1',
        email: 'a@example.com',
        emailVerified: true,
      })).rejects.toThrow('GOOGLE_ALREADY_LINKED_TO_OTHER_USER')
      expect(userRepository.linkGoogle).not.toHaveBeenCalled()
    })

    it('deve vincular googleId quando email confere e está verificado', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(createMockUser({ id: 'user-A', email: 'a@example.com', avatarUrl: null }))
      vi.mocked(userRepository.findByGoogleId).mockResolvedValue(null)
      vi.mocked(userRepository.linkGoogle).mockResolvedValue(createMockUser({ id: 'user-A', googleId: 'g-1' }))

      await authService.linkGoogleAccount({
        userId: 'user-A',
        googleId: 'g-1',
        email: 'A@Example.com',
        emailVerified: true,
        avatarUrl: 'https://pic.example/x.jpg',
      })

      expect(userRepository.linkGoogle).toHaveBeenCalledWith('user-A', 'g-1')
      expect(userRepository.updateProfile).toHaveBeenCalledWith('user-A', { avatarUrl: 'https://pic.example/x.jpg' })
    })
  })
})
