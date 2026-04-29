import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import type { IPostsRepository, Post } from '../../shared/contracts/posts.repository.contract.js'
import type { TopicsRepository, TopicMetaRow } from './topics.repository.js'
import type { CommunitiesService } from './communities.service.js'
import type { TopicRow } from './communities.repository.js'
import type { CreateTopicInput } from './communities.schema.js'
import { CommunitiesError } from './communities.errors.js'

export class TopicsService {
  constructor(
    private readonly db: DatabaseClient,
    private readonly topicsRepo: TopicsRepository,
    private readonly postsRepo: IPostsRepository,
    private readonly communitiesService: CommunitiesService,
  ) {}

  async createTopic(
    viewerId: string,
    communityId: string,
    input: CreateTopicInput,
  ): Promise<{ post: Post; meta: TopicMetaRow }> {
    const community = await this.communitiesService.getForViewer(communityId, viewerId)

    // Visibility check — must be a member of private/restricted
    await this.communitiesService.assertCanView(viewerId, community)
    await this.communitiesService.assertNotBanned(viewerId, communityId)

    return this.db.transaction(async (tx) => {
      const exec = tx as unknown as DatabaseClient
      const post = await this.postsRepo.create({
        userId: viewerId,
        type: 'manual',
        content: input.content ?? null,
        visibility: input.visibility ?? 'public',
        communityId,
      }, exec)
      const meta = await this.topicsRepo.insertMeta(post.id, communityId, exec)
      await this.communitiesService.incrementTopicCount(communityId, exec)
      return { post, meta }
    })
  }

  async listTopics(
    communityId: string,
    viewerId: string | null,
    opts: { cursor?: string; limit: number },
  ): Promise<{ topics: TopicRow[]; nextCursor: string | null }> {
    const community = await this.communitiesService.getForViewer(communityId, viewerId)
    await this.communitiesService.assertCanView(viewerId, community)

    const cursor = opts.cursor ? decodeCursor(opts.cursor) : null
    const result = await this.topicsRepo.findByCommunity(communityId, {
      cursor,
      limit: opts.limit,
    })

    const nextCursor = result.nextCursor ? encodeCursor(result.nextCursor) : null
    return { topics: result.topics, nextCursor }
  }

  async getTopicWithMeta(
    topicId: string,
    viewerId: string | null,
  ): Promise<{ topic: TopicRow; meta: TopicMetaRow }> {
    const topic = await this.topicsRepo.findTopicById(topicId)
    if (!topic) throw new CommunitiesError('TOPIC_NOT_FOUND')

    const community = await this.communitiesService.getForViewer(topic.communityId, viewerId)
    await this.communitiesService.assertCanView(viewerId, community)

    const meta = await this.topicsRepo.findMetaByPostId(topicId)
    if (!meta) throw new CommunitiesError('TOPIC_NOT_FOUND')

    return { topic, meta }
  }
}

function encodeCursor(c: { createdAt: Date; postId: string }): string {
  return Buffer.from(JSON.stringify({ t: c.createdAt.toISOString(), p: c.postId })).toString('base64url')
}

function decodeCursor(token: string): { createdAt: Date; postId: string } | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8')
    const parsed = JSON.parse(raw) as { t: string; p: string }
    return { createdAt: new Date(parsed.t), postId: parsed.p }
  } catch {
    return null
  }
}
