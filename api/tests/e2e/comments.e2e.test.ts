import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, truncateAll, createUser, authedRequest } from './setup/helpers.js'

describe('Comments E2E', () => {
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

  it('POST /posts/:id/comments — comentar retorna 201', async () => {
    const { token } = await createUser(app)
    const post = JSON.parse(
      (await authedRequest(app, token, 'POST', '/posts', { content: 'Post', visibility: 'public' })).body
    )
    const res = await authedRequest(app, token, 'POST', `/posts/${post.id}/comments`, {
      content: 'Que post incrível!',
    })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).content).toBe('Que post incrível!')
  })

  it('GET /posts/:id/comments — lista comentários', async () => {
    const { token } = await createUser(app)
    const post = JSON.parse(
      (await authedRequest(app, token, 'POST', '/posts', { content: 'Post', visibility: 'public' })).body
    )
    await authedRequest(app, token, 'POST', `/posts/${post.id}/comments`, { content: 'Com 1' })
    await authedRequest(app, token, 'POST', `/posts/${post.id}/comments`, { content: 'Com 2' })

    const res = await authedRequest(app, token, 'GET', `/posts/${post.id}/comments`)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.comments)).toBe(true)
    expect(body.comments.length).toBe(2)
  })

  it('DELETE /posts/:id/comments/:commentId — deletar próprio retorna 204', async () => {
    const { token } = await createUser(app)
    const post = JSON.parse(
      (await authedRequest(app, token, 'POST', '/posts', { content: 'Post', visibility: 'public' })).body
    )
    const comment = JSON.parse(
      (await authedRequest(app, token, 'POST', `/posts/${post.id}/comments`, { content: 'Meu com' })).body
    )
    const del = await authedRequest(app, token, 'DELETE', `/posts/${post.id}/comments/${comment.id}`)
    expect(del.statusCode).toBe(204)
  })

  it('DELETE /posts/:id/comments/:commentId — deletar comentário alheio retorna 403', async () => {
    const author = await createUser(app, { email: 'com-author@test.com' })
    const other = await createUser(app, { email: 'com-other@test.com' })
    const post = JSON.parse(
      (await authedRequest(app, author.token, 'POST', '/posts', { content: 'Post', visibility: 'public' })).body
    )
    const comment = JSON.parse(
      (await authedRequest(app, author.token, 'POST', `/posts/${post.id}/comments`, { content: 'Do autor' })).body
    )
    const del = await authedRequest(app, other.token, 'DELETE', `/posts/${post.id}/comments/${comment.id}`)
    expect(del.statusCode).toBe(403)
  })
})
