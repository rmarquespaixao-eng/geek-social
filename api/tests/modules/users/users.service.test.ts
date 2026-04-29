// tests/modules/users/users.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-webp')),
  })),
}))

import { UsersService } from '../../../src/modules/users/users.service.js'
import { createMockStorageService, createMockUser } from '../../helpers/mock-repositories.js'
import type { UsersRepository } from '../../../src/modules/users/users.repository.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockFriendsRepository(): IFriendsRepository {
  return {
    createRequest: vi.fn(),
    findRequestById: vi.fn(),
    findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(),
    findSentRequests: vi.fn(),
    updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(),
    areFriends: vi.fn(),
    removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(),
    deleteBlock: vi.fn(),
    isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(),
    findBlocksByBlocker: vi.fn(),
    findAllBlockRelationUserIds: vi.fn(),
  }
}

describe('UsersService', () => {
  let storageService: ReturnType<typeof createMockStorageService>
  let usersRepository: { findById: ReturnType<typeof vi.fn>; updateProfile: ReturnType<typeof vi.fn> }
  let friendsRepository: ReturnType<typeof createMockFriendsRepository>
  let usersService: UsersService

  beforeEach(() => {
    storageService = createMockStorageService()
    usersRepository = { findById: vi.fn(), updateProfile: vi.fn() }
    friendsRepository = createMockFriendsRepository()
    usersService = new UsersService(usersRepository as unknown as UsersRepository, storageService, friendsRepository)
    vi.clearAllMocks()
  })

  describe('getProfile', () => {
    it('deve retornar o perfil público completo', async () => {
      const user = createMockUser({ privacy: 'public' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(false)

      const profile = await usersService.getProfile(user.id, null)

      expect(profile).toMatchObject({ id: user.id, displayName: user.displayName })
      expect(profile).toHaveProperty('bio')
    })

    it('deve retornar apenas nome e avatar para perfil friends_only (visitante anônimo)', async () => {
      const user = createMockUser({ privacy: 'friends_only', bio: 'minha bio' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)

      const profile = await usersService.getProfile(user.id, null)

      expect(profile.displayName).toBe(user.displayName)
      expect((profile as any).bio).toBeUndefined()
    })

    it('deve retornar perfil completo para friends_only quando viewer é amigo', async () => {
      const user = createMockUser({ privacy: 'friends_only', bio: 'minha bio' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepository.areFriends).mockResolvedValue(true)

      const profile = await usersService.getProfile(user.id, 'viewer-id')

      expect((profile as any).bio).toBe('minha bio')
    })

    it('deve retornar apenas nome e avatar para friends_only quando viewer não é amigo', async () => {
      const user = createMockUser({ privacy: 'friends_only', bio: 'minha bio' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepository.areFriends).mockResolvedValue(false)

      const profile = await usersService.getProfile(user.id, 'viewer-id')

      expect((profile as any).bio).toBeUndefined()
    })

    it('deve lançar USER_NOT_FOUND para perfil private (visitante anônimo)', async () => {
      const user = createMockUser({ privacy: 'private' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)

      await expect(usersService.getProfile(user.id, null))
        .rejects.toThrow('USER_NOT_FOUND')
    })

    it('deve lançar USER_NOT_FOUND para perfil private quando viewer não é amigo', async () => {
      const user = createMockUser({ privacy: 'private', bio: 'bio secreta' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(false)
      vi.mocked(friendsRepository.areFriends).mockResolvedValue(false)

      await expect(usersService.getProfile(user.id, 'viewer-id'))
        .rejects.toThrow('USER_NOT_FOUND')
    })

    it('deve lançar USER_NOT_FOUND se usuário não existir', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(null)

      await expect(usersService.getProfile('nao-existe', null))
        .rejects.toThrow('USER_NOT_FOUND')
    })

    it('dono do perfil sempre vê tudo mesmo com privacy private', async () => {
      const user = createMockUser({ privacy: 'private', bio: 'bio secreta' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)

      const profile = await usersService.getProfile(user.id, user.id)

      expect((profile as any).bio).toBe('bio secreta')
    })

    it('deve lançar USER_NOT_FOUND se o viewer foi bloqueado pelo dono do perfil', async () => {
      const user = createMockUser({ privacy: 'public' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(friendsRepository.isBlockedBy).mockResolvedValue(true)

      await expect(usersService.getProfile(user.id, 'viewer-id'))
        .rejects.toThrow('USER_NOT_FOUND')
    })
  })

  describe('uploadAvatar', () => {
    it('deve fazer upload, atualizar URL e retornar usuário atualizado', async () => {
      const user = createMockUser()
      const updatedUser = createMockUser({ avatarUrl: 'https://s3.amazonaws.com/bucket/avatars/user-uuid-1234/avatar.webp' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(usersRepository.updateProfile).mockResolvedValue(updatedUser)

      const result = await usersService.uploadAvatar(user.id, Buffer.from('fake-image-data'), 'image/jpeg')

      expect(storageService.upload).toHaveBeenCalledWith(
        `avatars/${user.id}/avatar.webp`,
        expect.any(Buffer),
        'image/webp',
      )
      expect(result.avatarUrl).toContain('avatar.webp')
    })
  })

  describe('uploadCover', () => {
    it('deve fazer upload da capa e retornar usuário atualizado', async () => {
      const user = createMockUser()
      const updatedUser = createMockUser({ coverUrl: 'https://s3.amazonaws.com/bucket/covers/user-uuid-1234/cover.webp' })
      vi.mocked(usersRepository.findById).mockResolvedValue(user)
      vi.mocked(usersRepository.updateProfile).mockResolvedValue(updatedUser)

      const result = await usersService.uploadCover(user.id, Buffer.from('fake-image-data'), 'image/jpeg')

      expect(storageService.upload).toHaveBeenCalledWith(
        `covers/${user.id}/cover.webp`,
        expect.any(Buffer),
        'image/webp',
      )
      expect(result.coverUrl).toContain('cover.webp')
    })
  })

  describe('updateProfile', () => {
    it('deve atualizar os campos do perfil', async () => {
      const updatedUser = createMockUser({ displayName: 'Novo Nome', bio: 'Nova bio' })
      vi.mocked(usersRepository.updateProfile).mockResolvedValue(updatedUser)

      const result = await usersService.updateProfile('user-uuid-1234', {
        displayName: 'Novo Nome',
        bio: 'Nova bio',
      })

      expect(result.displayName).toBe('Novo Nome')
      expect(usersRepository.updateProfile).toHaveBeenCalledWith('user-uuid-1234', {
        displayName: 'Novo Nome',
        bio: 'Nova bio',
      })
    })
  })
})
