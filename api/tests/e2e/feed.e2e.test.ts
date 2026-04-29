import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, truncateAll, createUser, authedRequest } from './setup/helpers.js'

describe('Feed E2E', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await truncateAll()
  })

  async function makeFriends(app: FastifyInstance, userA: { token: string; id: string }, userB: { token: string; id: string }) {
    const req = JSON.parse(
      (await authedRequest(app, userA.token, 'POST', '/friends/requests', { receiverId: userB.id })).body
    )
    await authedRequest(app, userB.token, 'POST', `/friends/requests/${req.id}/accept`)
  }

  it('Feed vazio retorna { posts: [], nextCursor: null }', async () => {
    const { token } = await createUser(app)
    const res = await authedRequest(app, token, 'GET', '/feed')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.posts).toEqual([])
    expect(body.nextCursor).toBeNull()
  })

  it('Post próprio aparece no feed', async () => {
    const user = await createUser(app)
    await authedRequest(app, user.token, 'POST', '/posts', {
      content: 'Post próprio',
      visibility: 'public',
    })
    const res = await authedRequest(app, user.token, 'GET', '/feed')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.posts.length).toBeGreaterThan(0)
    expect(body.posts.some((p: { content: string }) => p.content === 'Post próprio')).toBe(true)
  })

  it('Post público de amigo aparece no feed', async () => {
    const userA = await createUser(app, { email: 'feed-a@test.com' })
    const userB = await createUser(app, { email: 'feed-b@test.com' })
    await makeFriends(app, userA, userB)

    await authedRequest(app, userB.token, 'POST', '/posts', {
      content: 'Post do amigo',
      visibility: 'public',
    })

    const res = await authedRequest(app, userA.token, 'GET', '/feed')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.posts.some((p: { content: string }) => p.content === 'Post do amigo')).toBe(true)
  })

  it('Post privado de não-amigo NÃO aparece no feed', async () => {
    const userA = await createUser(app, { email: 'priv-a@test.com' })
    const stranger = await createUser(app, { email: 'priv-str@test.com' })

    await authedRequest(app, stranger.token, 'POST', '/posts', {
      content: 'Post privado do estranho',
      visibility: 'private',
    })

    const res = await authedRequest(app, userA.token, 'GET', '/feed')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.posts.every((p: { content: string }) => p.content !== 'Post privado do estranho')).toBe(true)
  })

  it('Paginação via cursor funciona', async () => {
    const user = await createUser(app, { email: 'page@test.com' })
    for (let i = 0; i < 7; i++) {
      await authedRequest(app, user.token, 'POST', '/posts', {
        content: `Post ${i}`,
        visibility: 'public',
      })
    }
    const first = JSON.parse((await authedRequest(app, user.token, 'GET', '/feed?limit=5')).body)
    expect(first.posts.length).toBe(5)
    expect(first.nextCursor).toBeTruthy()

    const second = JSON.parse(
      (await authedRequest(app, user.token, 'GET', `/feed?limit=5&cursor=${first.nextCursor}`)).body
    )
    expect(second.posts.length).toBeGreaterThan(0)
    const firstIds = first.posts.map((p: { id: string }) => p.id)
    const secondIds = second.posts.map((p: { id: string }) => p.id)
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false)
  })
})
