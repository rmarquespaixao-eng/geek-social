import type { FastifyRequest, FastifyReply } from 'fastify'
import type { TopicsService } from './topics.service.js'
import { mapCommunitiesError } from './communities.controller.js'
import { serializeTopicSummary } from './communities.serializer.js'
import type { CreateTopicInput } from './communities.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class TopicsController {
  constructor(private readonly service: TopicsService) {}

  async createTopic(
    request: FastifyRequest<{ Params: { id: string }; Body: CreateTopicInput }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const topic = await this.service.createTopic(userId, request.params.id, request.body)
      return reply.status(201).send({ topic: serializeTopicSummary(topic) })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async listTopics(
    request: FastifyRequest<{ Params: { id: string }; Querystring: { cursor?: string; limit?: number } }>,
    reply: FastifyReply,
  ) {
    const viewer = (request.user as AccessTokenClaims | undefined)
    const viewerId = viewer?.userId ?? null
    try {
      const { cursor, limit } = request.query
      const result = await this.service.listTopics(request.params.id, viewerId, {
        cursor,
        limit: limit ?? 20,
      })
      return reply.send({
        topics: result.topics.map(serializeTopicSummary),
        nextCursor: result.nextCursor,
      })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async deleteTopic(
    request: FastifyRequest<{ Params: { id: string; topicId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.deleteTopic(userId, request.params.id, request.params.topicId)
      return reply.status(204).send()
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }

  async getTopicWithMeta(
    request: FastifyRequest<{ Params: { id: string; topicId: string } }>,
    reply: FastifyReply,
  ) {
    const viewer = (request.user as AccessTokenClaims | undefined)
    const viewerId = viewer?.userId ?? null
    try {
      const { topic, meta } = await this.service.getTopicWithMeta(request.params.topicId, viewerId)
      return reply.send({
        topic: serializeTopicSummary(topic),
        meta: {
          postId: meta.postId,
          communityId: meta.communityId,
          pinned: meta.pinned,
          locked: meta.locked,
          movedFromCommunityId: meta.movedFromCommunityId,
          pinnedAt: meta.pinnedAt ? meta.pinnedAt.toISOString() : null,
          lockedAt: meta.lockedAt ? meta.lockedAt.toISOString() : null,
        },
      })
    } catch (e) {
      return mapCommunitiesError(e, reply)
    }
  }
}
