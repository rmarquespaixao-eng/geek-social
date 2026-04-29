import { vi } from 'vitest'
import type { IUserRepository } from '../../src/shared/contracts/user.repository.contract.js'
import type { IEmailService } from '../../src/shared/contracts/email.service.contract.js'
import type { IStorageService } from '../../src/shared/contracts/storage.service.contract.js'

export function createMockUserRepository(): IUserRepository {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByKeycloakId: vi.fn(),
    findByGoogleId: vi.fn(),
    linkGoogle: vi.fn(),
    unlinkGoogle: vi.fn(),
    create: vi.fn(),
    updateProfile: vi.fn(),
    updatePassword: vi.fn(),
    verifyEmail: vi.fn(),
    createRefreshToken: vi.fn(),
    findRefreshToken: vi.fn(),
    deleteRefreshToken: vi.fn(),
    deleteAllRefreshTokensByUserId: vi.fn(),
    createPasswordResetToken: vi.fn(),
    findPasswordResetToken: vi.fn(),
    markPasswordResetTokenAsUsed: vi.fn(),
  }
}

export function createMockEmailService(): IEmailService {
  return {
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  }
}

export function createMockStorageService(): IStorageService {
  return {
    upload: vi.fn().mockResolvedValue('https://s3.amazonaws.com/bucket/key'),
    delete: vi.fn().mockResolvedValue(undefined),
    keyFromUrl: vi.fn().mockReturnValue(null),
  }
}

export function createMockUser(overrides = {}) {
  return {
    id: 'user-uuid-1234',
    email: 'test@example.com',
    passwordHash: '$2b$12$hashedpassword',
    displayName: 'Test User',
    bio: null,
    avatarUrl: null,
    coverUrl: null,
    privacy: 'public' as const,
    keycloakId: null,
    emailVerified: false,
    showPresence: true,
    showReadReceipts: true,
    steamId: null,
    steamLinkedAt: null,
    steamApiKey: null,
    googleId: null,
    googleLinkedAt: null,
    birthday: null,
    interests: [],
    pronouns: null,
    location: null,
    website: null,
    profileBackgroundUrl: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}
