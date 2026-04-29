import type { FastifyRequest, FastifyReply } from 'fastify'
import type { UsersService } from './users.service.js'
import { UsersError } from './users.service.js'
import type { UpdateProfileInput } from './users.schema.js'
import { updateSettingsSchema, setColorSchema } from './users.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const profile = await this.usersService.getProfile(userId, userId)
      return reply.send(profile)
    } catch (error) {
      if (error instanceof UsersError && error.code === 'USER_NOT_FOUND') {
        return reply.status(404).send({ error: 'Usuário não encontrado' })
      }
      throw error
    }
  }

  async getProfile(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const viewerId = request.user ? (request.user as AccessTokenClaims).userId : null
    try {
      const profile = await this.usersService.getProfile(request.params.id, viewerId)
      return reply.send(profile)
    } catch (error) {
      if (error instanceof UsersError && error.code === 'USER_NOT_FOUND') {
        return reply.status(404).send({ error: 'Usuário não encontrado' })
      }
      throw error
    }
  }

  async searchUsers(request: FastifyRequest<{ Querystring: { q?: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const results = await this.usersService.searchUsers(request.query.q ?? '', userId)
    return reply.send(results)
  }

  async getPublicFriends(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const viewerId = request.user ? (request.user as AccessTokenClaims).userId : null
    try {
      const friends = await this.usersService.getPublicFriends(request.params.id, viewerId)
      return reply.send(friends)
    } catch (error) {
      if (error instanceof UsersError && error.code === 'USER_NOT_FOUND') {
        return reply.status(404).send({ error: 'Usuário não encontrado' })
      }
      throw error
    }
  }

  async updateProfile(request: FastifyRequest<{ Body: UpdateProfileInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const updated = await this.usersService.updateProfile(userId, request.body)
    return reply.send(updated)
  }

  async updateSettings(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const body = updateSettingsSchema.parse(request.body)
    const updated = await this.usersService.updateSettings(userId, body)
    return reply.send({ showPresence: updated.showPresence, showReadReceipts: updated.showReadReceipts })
  }

  async uploadAvatar(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    const buffer = await data.toBuffer()
    const result = await this.usersService.uploadAvatar(userId, buffer, data.mimetype)
    return reply.send({ avatarUrl: result.avatarUrl })
  }

  async deleteAvatar(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    await this.usersService.deleteAvatar(userId)
    return reply.status(204).send()
  }

  async uploadCover(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    const buffer = await data.toBuffer()
    const result = await this.usersService.uploadCover(userId, buffer, data.mimetype)
    return reply.send({ coverUrl: result.coverUrl })
  }

  async deleteCover(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    await this.usersService.deleteCover(userId)
    return reply.status(204).send()
  }

  async uploadProfileBackground(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })

    const buffer = await data.toBuffer()
    const result = await this.usersService.uploadProfileBackground(userId, buffer, data.mimetype)
    return reply.send({ profileBackgroundUrl: result.profileBackgroundUrl })
  }

  async deleteProfileBackground(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    await this.usersService.deleteProfileBackground(userId)
    return reply.status(204).send()
  }

  async setCoverColor(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = setColorSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
    const result = await this.usersService.setCoverColor(userId, parsed.data.color)
    return reply.send({ coverUrl: result.coverUrl, coverColor: result.coverColor })
  }

  async setProfileBackgroundColor(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const parsed = setColorSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
    const result = await this.usersService.setProfileBackgroundColor(userId, parsed.data.color)
    return reply.send({ profileBackgroundUrl: result.profileBackgroundUrl, profileBackgroundColor: result.profileBackgroundColor })
  }

  async deleteAccount(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    await this.usersService.deleteAccount(userId)
    reply.clearCookie('refreshToken', { path: '/' })
    return reply.status(204).send()
  }
}
