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
    authService = new AuthService(userRepository, emailService, {
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
    it('deve emitir novo accessToken e rotacionar refresh token', async () => {
      const user = createMockUser()
      const storedToken = {
        id: 'token-id',
        userId: user.id,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      }
      vi.mocked(userRepository.findRefreshToken).mockResolvedValue(storedToken)
      vi.mocked(userRepository.findById).mockResolvedValue(user)
      vi.mocked(userRepository.deleteRefreshToken).mockResolvedValue(undefined)
      vi.mocked(userRepository.createRefreshToken).mockResolvedValue(undefined)

      const result = await authService.refreshToken('hashed-token')

      expect(result.accessTokenClaims).toHaveProperty('userId', user.id)
      expect(result.newRefreshToken).toBeDefined()
      expect(userRepository.deleteRefreshToken).toHaveBeenCalledWith('hashed-token')
      expect(userRepository.createRefreshToken).toHaveBeenCalledOnce()
    })

    it('deve lançar erro para token expirado', async () => {
      vi.mocked(userRepository.findRefreshToken).mockResolvedValue({
        id: 'token-id',
        userId: 'user-id',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      })

      await expect(authService.refreshToken('hash'))
        .rejects.toThrow('INVALID_REFRESH_TOKEN')
    })

    it('deve lançar erro para token inexistente', async () => {
      vi.mocked(userRepository.findRefreshToken).mockResolvedValue(null)

      await expect(authService.refreshToken('nao-existe'))
        .rejects.toThrow('INVALID_REFRESH_TOKEN')
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
})
