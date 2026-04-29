/**
 * E2E tests for Communities US1.
 *
 * These tests require a live Postgres DB with the 0036_communities.sql migration applied.
 * To run: `npm run db:migrate && npm run test:e2e`
 *
 * re-enable after db:migrate runs
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  buildTestApp,
  truncateAll,
  createUser,
  TINY_PNG,
  type UserFixture,
} from './setup/helpers.js'

// Mock S3 to avoid MinIO dependency in CI
vi.mock('../../src/shared/infra/storage/s3.adapter.js', () => {
  class S3Adapter {
    constructor() {}
    async upload(key: string, _buffer: Buffer, _mime: string) {
      return `https://test.local/${key}`
    }
    async delete() { /* noop */ }
    keyFromUrl(url: string) {
      const prefix = 'https://test.local/'
      return url.startsWith(prefix) ? url.slice(prefix.length) : null
    }
  }
  return { S3Adapter }
})

vi.mock('sharp', () => {
  const factory = (_buf: Buffer) => ({
    resize() { return this },
    webp() { return this },
    toBuffer: async () => Buffer.from('fakewebp'),
  })
  return { default: factory }
})

// ─── helpers ────────────────────────────────────────────────────────
type CreateCommunityOpts = {
  name?: string
  description?: string
  category?: string
  visibility?: 'public' | 'private' | 'restricted'
}

async function createCommunity(
  app: FastifyInstance,
  user: UserFixture,
  opts: CreateCommunityOpts = {},
): Promise<{ statusCode: number; body: any }> {
  const boundary = '----E2EBoundaryCommunities'
  const fields: Record<string, string> = {
    name: opts.name ?? 'Comunidade Teste',
    description: opts.description ?? 'Descrição da comunidade de teste',
    category: opts.category ?? 'rpg-mesa',
    visibility: opts.visibility ?? 'public',
  }

  const segments: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    segments.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    )
  }
  // cover
  segments.push(
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`),
  )
  segments.push(TINY_PNG)
  segments.push(Buffer.from('\r\n'))
  // icon
  segments.push(
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="icon"; filename="icon.png"\r\nContent-Type: image/png\r\n\r\n`),
  )
  segments.push(TINY_PNG)
  segments.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  const body = Buffer.concat(segments)

  const res = await app.inject({
    method: 'POST',
    url: '/communities',
    headers: {
      authorization: `Bearer ${user.token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  return { statusCode: res.statusCode, body: JSON.parse(res.body) }
}

// ────────────────────────────────────────────────────────────────────
// Skip the entire suite if DB is not reachable — this is expected in CI
// without a migrated DB. Remove the `describe.skip` once db:migrate runs.
// ────────────────────────────────────────────────────────────────────
describe.skip('Communities E2E — US1', () => {
  let app: FastifyInstance
  let owner: UserFixture
  let member: UserFixture

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await truncateAll()
    owner = await createUser(app, { displayName: 'Owner User' })
    member = await createUser(app, { displayName: 'Member User' })
  })

  // ── Scenario 1: Create community ──────────────────────────────────
  it('AC1 — owner creates a public community (201 with slug + coverUrl + iconUrl)', async () => {
    const { statusCode, body } = await createCommunity(app, owner)

    expect(statusCode).toBe(201)
    expect(body.community).toBeDefined()
    expect(body.community.slug).toMatch(/^[a-z0-9-]+$/)
    expect(body.community.coverUrl).toBeTruthy()
    expect(body.community.iconUrl).toBeTruthy()
    expect(body.community.ownerId).toBe(owner.id)
    expect(body.community.visibility).toBe('public')
    expect(body.community.memberCount).toBe(1)
  })

  // ── Scenario 2: Discover / list communities ───────────────────────
  it('AC2 — another user can list the public community', async () => {
    await createCommunity(app, owner)

    const res = await app.inject({
      method: 'GET',
      url: '/communities',
      headers: { authorization: `Bearer ${member.token}` },
    })

    const body = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(body.communities.length).toBeGreaterThanOrEqual(1)
    expect(body.communities[0].visibility).toBe('public')
  })

  // ── Scenario 3: Join community ────────────────────────────────────
  it('AC3 — member joins public community (status=active)', async () => {
    const { body: createBody } = await createCommunity(app, owner)
    const communityId = createBody.community.id

    const res = await app.inject({
      method: 'POST',
      url: `/communities/${communityId}/members`,
      headers: { authorization: `Bearer ${member.token}` },
    })

    const body = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(body.status).toBe('active')
    expect(body.membership.userId).toBe(member.id)
  })

  // ── Scenario 4: Create topic ──────────────────────────────────────
  it('AC4 — member creates topic in community (201 with postId)', async () => {
    const { body: createBody } = await createCommunity(app, owner)
    const communityId = createBody.community.id

    // member joins first
    await app.inject({
      method: 'POST',
      url: `/communities/${communityId}/members`,
      headers: { authorization: `Bearer ${member.token}` },
    })

    const res = await app.inject({
      method: 'POST',
      url: `/communities/${communityId}/topics`,
      headers: { authorization: `Bearer ${member.token}`, 'content-type': 'application/json' },
      payload: { content: 'Primeiro tópico da comunidade!', visibility: 'public' },
    })

    const body = JSON.parse(res.body)
    expect(res.statusCode).toBe(201)
    expect(body.topic.postId).toBeTruthy()
    expect(body.topic.communityId).toBe(communityId)
  })

  // ── Scenario 5: List topics ───────────────────────────────────────
  it('AC5 — list topics returns created topic with pinned first ordering', async () => {
    const { body: createBody } = await createCommunity(app, owner)
    const communityId = createBody.community.id

    await app.inject({
      method: 'POST',
      url: `/communities/${communityId}/topics`,
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
      payload: { content: 'Topic A', visibility: 'public' },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/communities/${communityId}/topics`,
      headers: { authorization: `Bearer ${owner.token}` },
    })

    const body = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(body.topics.length).toBeGreaterThanOrEqual(1)
  })

  // ── Scenario 6: Get community detail ─────────────────────────────
  it('AC6 — GET /communities/:id returns detail with viewerMembership', async () => {
    const { body: createBody } = await createCommunity(app, owner)
    const communityId = createBody.community.id

    const res = await app.inject({
      method: 'GET',
      url: `/communities/${communityId}`,
      headers: { authorization: `Bearer ${owner.token}` },
    })

    const body = JSON.parse(res.body)
    expect(res.statusCode).toBe(200)
    expect(body.community).toBeDefined()
    expect(body.viewerMembership).toBeDefined()
    expect(body.viewerMembership.role).toBe('owner')
  })

  // ── Scenario 7: Slug uniqueness ───────────────────────────────────
  it('AC7 — two communities with same name get different slugs', async () => {
    const { body: body1 } = await createCommunity(app, owner, { name: 'Slug Test' })
    const { body: body2 } = await createCommunity(app, owner, { name: 'Slug Test' })

    expect(body1.community.slug).not.toBe(body2.community.slug)
    expect(body2.community.slug).toMatch(/-\d+$/)
  })

  // ── Scenario 8: Restricted community flow ────────────────────────
  it('AC8 — restricted community: member requests join → owner approves → topic visible', async () => {
    const { body: createBody } = await createCommunity(app, owner, { visibility: 'restricted' })
    const communityId = createBody.community.id

    // Member requests to join
    const joinRes = await app.inject({
      method: 'POST',
      url: `/communities/${communityId}/members`,
      headers: { authorization: `Bearer ${member.token}` },
    })
    const joinBody = JSON.parse(joinRes.body)
    expect(joinBody.status).toBe('pending')

    // Owner approves
    const approveRes = await app.inject({
      method: 'POST',
      url: `/communities/${communityId}/join-requests/${member.id}/approve`,
      headers: { authorization: `Bearer ${owner.token}` },
    })
    expect(approveRes.statusCode).toBe(200)
    const approveBody = JSON.parse(approveRes.body)
    expect(approveBody.membership.status).toBe('active')

    // Member can now create topic
    const topicRes = await app.inject({
      method: 'POST',
      url: `/communities/${communityId}/topics`,
      headers: { authorization: `Bearer ${member.token}`, 'content-type': 'application/json' },
      payload: { content: 'Finalmente posso postar!', visibility: 'public' },
    })
    expect(topicRes.statusCode).toBe(201)

    // Topics visible to member
    const topicsRes = await app.inject({
      method: 'GET',
      url: `/communities/${communityId}/topics`,
      headers: { authorization: `Bearer ${member.token}` },
    })
    const topicsBody = JSON.parse(topicsRes.body)
    expect(topicsRes.statusCode).toBe(200)
    expect(topicsBody.topics.length).toBeGreaterThanOrEqual(1)
  })

  // ── Scenario 9: Owner cannot leave ────────────────────────────────
  it('AC9 — owner cannot leave their own community', async () => {
    const { body: createBody } = await createCommunity(app, owner)
    const communityId = createBody.community.id

    const res = await app.inject({
      method: 'DELETE',
      url: `/communities/${communityId}/members/me`,
      headers: { authorization: `Bearer ${owner.token}` },
    })

    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body)
    expect(body.error).toBe('OWNER_CANNOT_LEAVE')
  })

  // ── Scenario 10: Soft delete ──────────────────────────────────────
  it('AC10 — owner soft-deletes community (204), not visible in list', async () => {
    const { body: createBody } = await createCommunity(app, owner)
    const communityId = createBody.community.id

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/communities/${communityId}`,
      headers: { authorization: `Bearer ${owner.token}` },
    })
    expect(deleteRes.statusCode).toBe(204)

    // Community should not appear in list
    const listRes = await app.inject({
      method: 'GET',
      url: '/communities',
      headers: { authorization: `Bearer ${owner.token}` },
    })
    const listBody = JSON.parse(listRes.body)
    const found = listBody.communities.find((c: any) => c.id === communityId)
    expect(found).toBeUndefined()
  })
})
