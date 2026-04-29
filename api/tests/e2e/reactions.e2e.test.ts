import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, truncateAll, createUser, authedRequest } from './setup/helpers.js'

describe('Reactions E2E', () => {
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

  it('POST /posts/:id/reactions — outro usuário reage e retorna 200 com counts', async () => {
    const poster = await createUser(app, { email: 'react-poster@test.com' })
    const reactor = await createUser(app, { email: 'react-reactor@test.com' })
    const post = JSON.parse(
      (await authedRequest(app, poster.token, 'POST', '/posts', { content: 'Post', visibility: 'public' })).body
    )
    const res = await authedRequest(app, reactor.token, 'POST', `/posts/${post.id}/reactions`, {
      type: 'epic',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.counts).toBeDefined()
  })

  it('POST /posts/:id/reactions — auto-reação retorna 400', async () => {
    const { token } = await createUser(app)
    const post = JSON.parse(
      (await authedRequest(app, token, 'POST', '/posts', { content: 'Post', visibility: 'public' })).body
    )
    const res = await authedRequest(app, token, 'POST', `/posts/${post.id}/reactions`, { type: 'epic' })
    expect(res.statusCode).toBe(400)
  })

  it('DELETE /posts/:id/reactions — remove reação retorna 204', async () => {
    const poster = await createUser(app, { email: 'del-react-poster@test.com' })
    const reactor = await createUser(app, { email: 'del-react-reactor@test.com' })
    const post = JSON.parse(
      (await authedRequest(app, poster.token, 'POST', '/posts', { content: 'Post', visibility: 'public' })).body
    )
    await authedRequest(app, reactor.token, 'POST', `/posts/${post.id}/reactions`, { type: 'epic' })
    const del = await authedRequest(app, reactor.token, 'DELETE', `/posts/${post.id}/reactions`)
    expect(del.statusCode).toBe(204)
  })
})
