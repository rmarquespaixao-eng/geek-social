import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, truncateAll, createUser, authedRequest } from './setup/helpers.js'

describe('Blocks E2E', () => {
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

  it('POST /blocks/:userId — bloquear usuário retorna 204', async () => {
    const blocker = await createUser(app, { email: 'blocker@test.com' })
    const blocked = await createUser(app, { email: 'blocked@test.com' })
    const res = await authedRequest(app, blocker.token, 'POST', `/blocks/${blocked.id}`)
    expect(res.statusCode).toBe(204)
  })

  it('GET /blocks — lista usuários bloqueados com displayName', async () => {
    const blocker = await createUser(app, { email: 'blist-a@test.com' })
    const blocked = await createUser(app, { email: 'blist-b@test.com', displayName: 'Bloqueado' })
    await authedRequest(app, blocker.token, 'POST', `/blocks/${blocked.id}`)

    const res = await authedRequest(app, blocker.token, 'GET', '/blocks')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(1)
    expect(body[0].displayName).toBe('Bloqueado')
  })

  it('Posts do bloqueado NÃO aparecem no feed do bloqueador', async () => {
    const blocker = await createUser(app, { email: 'feed-blocker@test.com' })
    const blocked = await createUser(app, { email: 'feed-blocked@test.com' })
    await authedRequest(app, blocker.token, 'POST', `/blocks/${blocked.id}`)

    await authedRequest(app, blocked.token, 'POST', '/posts', {
      content: 'Post do bloqueado',
      visibility: 'public',
    })

    const res = await authedRequest(app, blocker.token, 'GET', '/feed')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.posts.every((p: { content: string }) => p.content !== 'Post do bloqueado')).toBe(true)
  })

  it('DELETE /blocks/:userId — desbloquear retorna 204', async () => {
    const blocker = await createUser(app, { email: 'unblock-a@test.com' })
    const blocked = await createUser(app, { email: 'unblock-b@test.com' })
    await authedRequest(app, blocker.token, 'POST', `/blocks/${blocked.id}`)

    const del = await authedRequest(app, blocker.token, 'DELETE', `/blocks/${blocked.id}`)
    expect(del.statusCode).toBe(204)

    const list = JSON.parse((await authedRequest(app, blocker.token, 'GET', '/blocks')).body)
    expect(list.every((b: { id: string }) => b.id !== blocked.id)).toBe(true)
  })
})
