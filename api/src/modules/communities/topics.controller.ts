import type { FastifyRequest, FastifyReply } from 'fastify'
import type { TopicsService } from './topics.service.js'
import { mapCommunitiesError } from './communities.controller.js'
import { serializeTopicSummary } from './communities.serializer.js'
import { createTopicSchema } from './communities.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class TopicsController {
  constructor(private readonly service: TopicsService) {}

  async createTopic(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const parsed = createTopicSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'INVALID_INPUT', issues: parsed.error.issues })
      }
      const { post, meta } = await this.service.createTopic(userId, request.params.id, parsed.data)
      return reply.status(201).send({
        topic: {
          postId: post.id,
          communityId: request.params.id,
          authorId: post.userId,
          content: post.content,
          pinned: meta.pinned,
          locked: meta.locked,
          movedFromCommunityId: meta.movedFromCommunityId,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
        },
      })
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
