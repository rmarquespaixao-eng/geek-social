// src/modules/users/users.service.ts
import bcrypt from 'bcrypt'
import sharp from 'sharp'
import type { UsersRepository } from './users.repository.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { UpdateProfileInput } from './users.schema.js'
import type { User, IUserRepository } from '../../shared/contracts/user.repository.contract.js'

export class UsersError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'UsersError'
  }
}

type PublicProfile = {
  id: string
  displayName: string
  avatarUrl: string | null
  coverUrl?: string | null
  coverColor?: string | null
  profileBackgroundUrl?: string | null
  profileBackgroundColor?: string | null
  bio?: string | null
  privacy?: string
  createdAt?: Date
  collectionsCount?: number
  itemsCount?: number
  postsCount?: number
  friendsCount?: number
  restricted?: boolean
  showPresence?: boolean
  showReadReceipts?: boolean
  isOnline?: boolean
  lastSeenAt?: string | null
  steamId?: string | null
  steamLinkedAt?: string | null
  hasSteamApiKey?: boolean
  googleLinked?: boolean
  googleLinkedAt?: string | null
  hasPassword?: boolean
  birthday?: string | null
  interests?: string[]
  pronouns?: string | null
  location?: string | null
  website?: string | null
  platformRole?: 'user' | 'moderator' | 'admin'
}

export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly storageService: IStorageService,
    private readonly friendsRepository?: IFriendsRepository,
    private readonly presenceService?: import('../chat/presence.service.js').PresenceService,
    // Necessário para revogar refresh tokens em deleteAccount. Opcional para manter
    // compatibilidade com testes que constroem o serviço sem auth.
    private readonly authRepository?: IUserRepository,
  ) {}

  async getProfile(userId: string, viewerId: string | null): Promise<PublicProfile> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new UsersError('USER_NOT_FOUND')

    const isOwner = viewerId === userId

    if (!isOwner && viewerId && this.friendsRepository) {
      const blocked = await this.friendsRepository.isBlockedBy(userId, viewerId)
      if (blocked) throw new UsersError('USER_NOT_FOUND')
    }

    const isFriend = (!isOwner && viewerId && this.friendsRepository)
      ? await this.friendsRepository.areFriends(userId, viewerId)
      : false

    if ((user.privacy === 'private' || user.privacy === 'friends_only') && !isOwner && !isFriend) {
      return {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        coverColor: user.coverColor,
        profileBackgroundUrl: user.profileBackgroundUrl,
        profileBackgroundColor: user.profileBackgroundColor,
        privacy: user.privacy,
        restricted: true,
      }
    }

    const counts = await this.usersRepository.getProfileCounts(userId)

    let isOnline: boolean | undefined
    let lastSeenAt: string | null | undefined
    const canSeePresence = isOwner || (isFriend && user.showPresence)
    if (canSeePresence && this.presenceService) {
      isOnline = this.presenceService.isOnline(userId)
      const ls = await this.presenceService.getLastSeen(userId)
      lastSeenAt = ls ? ls.toISOString() : null
    }

    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      coverColor: user.coverColor,
      profileBackgroundUrl: user.profileBackgroundUrl,
      profileBackgroundColor: user.profileBackgroundColor,
      bio: user.bio,
      privacy: user.privacy,
      createdAt: user.createdAt,
      birthday: user.birthday,
      interests: user.interests ?? [],
      pronouns: user.pronouns,
      location: user.location,
      website: user.website,
      ...counts,
      ...(isOwner ? {
        showPresence: user.showPresence,
        showReadReceipts: user.showReadReceipts,
        steamId: user.steamId,
        steamLinkedAt: user.steamLinkedAt ? user.steamLinkedAt.toISOString() : null,
        hasSteamApiKey: Boolean(user.steamApiKey),
        googleLinked: Boolean(user.googleId),
        googleLinkedAt: user.googleLinkedAt ? user.googleLinkedAt.toISOString() : null,
        hasPassword: Boolean(user.passwordHash),
        platformRole: user.platformRole,
      } : {}),
      ...(isOnline !== undefined ? { isOnline, lastSeenAt: lastSeenAt ?? null } : {}),
    }
  }

  async searchUsers(query: string, viewerId: string): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]> {
    if (!query || query.trim().length < 2) return []
    // Filtros de privacy, bloqueio e escape de wildcards são aplicados no repositório (NEW-01/02/03).
    const results = await this.usersRepository.searchUsers(query.trim(), viewerId)
    return results.map(u => ({ id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl }))
  }

  async getPublicFriends(userId: string, viewerId: string | null): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new UsersError('USER_NOT_FOUND')
    const isOwner = viewerId === userId
    if (user.privacy === 'private' && !isOwner) return []
    if (user.privacy === 'friends_only' && !isOwner) {
      if (!viewerId || !this.friendsRepository) return []
      const isFriend = await this.friendsRepository.areFriends(userId, viewerId)
      if (!isFriend) return []
    }
    const friends = await this.usersRepository.getPublicFriends(userId)

    if (viewerId && this.friendsRepository) {
      const blockedIds = await this.friendsRepository.findAllBlockRelationUserIds(viewerId)
      return friends.filter(friend => !blockedIds.includes(friend.id))
    }

    return friends
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
    return this.usersRepository.updateProfile(userId, input)
  }

  async updateSettings(userId: string, patch: { showPresence?: boolean; showReadReceipts?: boolean }): Promise<User> {
    return this.usersRepository.updateSettings(userId, patch)
  }

  async uploadAvatar(userId: string, buffer: Buffer): Promise<User> {
    const webpBuffer = await sharp(buffer)
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()
    const key = `avatars/${userId}/avatar.webp`
    const avatarUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.usersRepository.updateProfile(userId, { avatarUrl })
  }

  async uploadCover(userId: string, buffer: Buffer): Promise<User> {
    const webpBuffer = await sharp(buffer)
      .resize(1200, 400, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()
    const key = `covers/${userId}/cover.webp`
    const coverUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.usersRepository.updateProfile(userId, { coverUrl, coverColor: null })
  }

  async setCoverColor(userId: string, color: string | null): Promise<User> {
    if (color !== null) {
      // Cor sólida cancela imagem (inclui apagar do storage)
      try { await this.storageService.delete(`covers/${userId}/cover.webp`) } catch {}
      return this.usersRepository.updateProfile(userId, { coverColor: color, coverUrl: null })
    }
    return this.usersRepository.updateProfile(userId, { coverColor: null })
  }

  async deleteAvatar(userId: string): Promise<User> {
    await this.storageService.delete(`avatars/${userId}/avatar.webp`)
    return this.usersRepository.updateProfile(userId, { avatarUrl: null })
  }

  async deleteCover(userId: string): Promise<User> {
    await this.storageService.delete(`covers/${userId}/cover.webp`)
    return this.usersRepository.updateProfile(userId, { coverUrl: null })
  }

  async uploadProfileBackground(userId: string, buffer: Buffer): Promise<User> {
    const webpBuffer = await sharp(buffer)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    const key = `profile-bg/${userId}/background.webp`
    const profileBackgroundUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.usersRepository.updateProfile(userId, { profileBackgroundUrl, profileBackgroundColor: null })
  }

  async deleteProfileBackground(userId: string): Promise<User> {
    await this.storageService.delete(`profile-bg/${userId}/background.webp`)
    return this.usersRepository.updateProfile(userId, { profileBackgroundUrl: null })
  }

  async setProfileBackgroundColor(userId: string, color: string | null): Promise<User> {
    if (color !== null) {
      try { await this.storageService.delete(`profile-bg/${userId}/background.webp`) } catch {}
      return this.usersRepository.updateProfile(userId, { profileBackgroundColor: color, profileBackgroundUrl: null })
    }
    return this.usersRepository.updateProfile(userId, { profileBackgroundColor: null })
  }

  /**
   * Apaga conta + arquivos conhecidos do usuário. Cascades de FK removem dados relacionados.
   * Requer confirmação de senha para contas com senha local (NEW-10).
   * Contas Google-only aceitam exclusão sem senha — o Google já atua como fator implícito.
   */
  async deleteAccount(userId: string, password?: string): Promise<void> {
    const user = await this.usersRepository.findById(userId)
    if (!user) throw new UsersError('USER_NOT_FOUND')

    if (user.passwordHash) {
      // Conta com senha: exige confirmação para evitar exclusão por JWT vazado.
      if (!password) throw new UsersError('PASSWORD_REQUIRED')
      const isValid = await bcrypt.compare(password, user.passwordHash)
      if (!isValid) throw new UsersError('INVALID_CREDENTIALS')
    }
    // Conta Google-only: sem senha local, o Google OAuth é o fator implícito.
    // Risco residual aceito: JWT vazado permite exclusão. Rate-limit de 1/24h mitiga força bruta.
    else {
      console.warn({ userId }, 'google-only account deletion requested — no password confirmation')
    }

    // Invalida JWTs já emitidos ANTES de deletar (G1-22). Caso o DELETE CASCADE em
    // refresh_tokens demore ou falhe, os JWTs de até 15 min de TTL ainda assim
    // passam a falhar no middleware authenticate (token_version mismatch).
    await this.usersRepository.incrementTokenVersion(userId)
    if (this.authRepository) {
      await this.authRepository.deleteAllRefreshTokensByUserId(userId)
    }

    // Best-effort: limpa arquivos conhecidos (avatar, cover, background) do storage.
    // Outros arquivos (items, posts, chat) ficarão órfãos mas não causam erro.
    const keys = [
      `avatars/${userId}/avatar.webp`,
      `covers/${userId}/cover.webp`,
      `profile-bg/${userId}/background.webp`,
    ]
    for (const k of keys) {
      try { await this.storageService.delete(k) } catch {}
    }
    await this.usersRepository.deleteUser(userId)
  }
}
