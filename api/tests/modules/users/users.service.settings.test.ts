import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsersService } from '../../../src/modules/users/users.service.js'
import type { UsersRepository } from '../../../src/modules/users/users.repository.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'
import type { User } from '../../../src/shared/contracts/user.repository.contract.js'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1', email: 'a@a.com', passwordHash: null, displayName: 'A',
    bio: null, avatarUrl: null, coverUrl: null, privacy: 'public',
    keycloakId: null, emailVerified: true,
    showPresence: true, showReadReceipts: true,
    steamId: null, steamLinkedAt: null, steamApiKey: null,
    googleId: null, googleLinkedAt: null,
    birthday: null, interests: [], pronouns: null, location: null, website: null,
    profileBackgroundUrl: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

describe('UsersService.updateSettings', () => {
  let repo: UsersRepository
  let storage: IStorageService
  let service: UsersService

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      updateSettings: vi.fn(),
    } as unknown as UsersRepository
    storage = {} as IStorageService
    service = new UsersService(repo, storage)
  })

  it('atualiza showPresence', async () => {
    vi.mocked(repo.updateSettings).mockResolvedValue(makeUser({ showPresence: false }))
    const result = await service.updateSettings('u1', { showPresence: false })
    expect(repo.updateSettings).toHaveBeenCalledWith('u1', { showPresence: false })
    expect(result.showPresence).toBe(false)
  })

  it('atualiza showReadReceipts', async () => {
    vi.mocked(repo.updateSettings).mockResolvedValue(makeUser({ showReadReceipts: false }))
    const result = await service.updateSettings('u1', { showReadReceipts: false })
    expect(repo.updateSettings).toHaveBeenCalledWith('u1', { showReadReceipts: false })
    expect(result.showReadReceipts).toBe(false)
  })
})
