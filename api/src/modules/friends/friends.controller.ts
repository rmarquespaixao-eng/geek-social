// src/modules/friends/friends.controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FriendsService } from './friends.service.js'
import { FriendsError } from './friends.service.js'
import type { SendFriendRequestInput } from './friends.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class FriendsController {
  constructor(private readonly service: FriendsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof FriendsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Não encontrado' })
      if (error.code === 'ALREADY_EXISTS') return reply.status(409).send({ error: 'Já existe uma relação entre os usuários' })
      if (error.code === 'SELF_REQUEST') return reply.status(400).send({ error: 'Não é possível adicionar a si mesmo' })
      if (error.code === 'SELF_BLOCK') return reply.status(400).send({ error: 'Não é possível bloquear a si mesmo' })
      if (error.code === 'NOT_PENDING') return reply.status(409).send({ error: 'Pedido não está pendente' })
    }
    throw error
  }

  async sendRequest(request: FastifyRequest<{ Body: SendFriendRequestInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const friendship = await this.service.sendRequest(userId, request.body.receiverId)
      return reply.status(201).send(friendship)
    } catch (error) { return this.handleError(error, reply) }
  }

  async listReceivedRequests(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const requests = await this.service.listReceivedRequests(userId)
    return reply.send(requests)
  }

  async listSentRequests(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const requests = await this.service.listSentRequests(userId)
    return reply.send(requests)
  }

  async acceptRequest(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const friendship = await this.service.acceptRequest(userId, request.params.id)
      return reply.send(friendship)
    } catch (error) { return this.handleError(error, reply) }
  }

  async rejectRequest(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.rejectRequest(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async cancelRequest(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.cancelRequest(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async listFriends(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const friends = await this.service.listFriends(userId)
    return reply.send(friends)
  }

  async removeFriend(request: FastifyRequest<{ Params: { friendId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.removeFriend(userId, request.params.friendId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async blockUser(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.block(userId, request.params.userId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async unblockUser(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.unblock(userId, request.params.userId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async listBlocks(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const blocks = await this.service.listBlocks(userId)
    return reply.send(blocks)
  }
}
