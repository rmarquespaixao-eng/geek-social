import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, truncateAll, createUser, authedRequest } from './setup/helpers.js'

describe('Friends E2E', () => {
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

  it('POST /friends/requests — envia pedido de amizade', async () => {
    const userA = await createUser(app, { email: 'a@test.com' })
    const userB = await createUser(app, { email: 'b@test.com' })
    const res = await authedRequest(app, userA.token, 'POST', '/friends/requests', {
      receiverId: userB.id,
    })
    expect(res.statusCode).toBe(201)
  })

  it('GET /friends/requests/received — lista pedidos recebidos com dados do remetente', async () => {
    const userA = await createUser(app, { email: 'sender@test.com', displayName: 'Sender' })
    const userB = await createUser(app, { email: 'receiver@test.com' })
    await authedRequest(app, userA.token, 'POST', '/friends/requests', { receiverId: userB.id })

    const res = await authedRequest(app, userB.token, 'GET', '/friends/requests/received')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(1)
    expect(body[0].senderName).toBeTruthy()
  })

  it('POST /friends/requests/:id/accept — aceita pedido e os dois viram amigos', async () => {
    const userA = await createUser(app, { email: 'req-a@test.com' })
    const userB = await createUser(app, { email: 'req-b@test.com' })
    const reqRes = JSON.parse(
      (await authedRequest(app, userA.token, 'POST', '/friends/requests', { receiverId: userB.id })).body
    )
    const accept = await authedRequest(app, userB.token, 'POST', `/friends/requests/${reqRes.id}/accept`)
    expect(accept.statusCode).toBe(200)

    const friends = JSON.parse((await authedRequest(app, userA.token, 'GET', '/friends')).body)
    expect(Array.isArray(friends)).toBe(true)
    expect(friends.some((f: { id: string }) => f.id === userB.id)).toBe(true)
  })

  it('GET /friends — lista amigos com displayName e isOnline', async () => {
    const userA = await createUser(app, { email: 'flist-a@test.com' })
    const userB = await createUser(app, { email: 'flist-b@test.com', displayName: 'Friend B' })
    const req = JSON.parse(
      (await authedRequest(app, userA.token, 'POST', '/friends/requests', { receiverId: userB.id })).body
    )
    await authedRequest(app, userB.token, 'POST', `/friends/requests/${req.id}/accept`)

    const res = await authedRequest(app, userA.token, 'GET', '/friends')
    expect(res.statusCode).toBe(200)
    const friends = JSON.parse(res.body)
    expect(Array.isArray(friends)).toBe(true)
    const friend = friends.find((f: { id: string }) => f.id === userB.id)
    expect(friend).toBeTruthy()
    expect(friend.displayName).toBe('Friend B')
    expect(typeof friend.isOnline).toBe('boolean')
  })

  it('DELETE /friends/:friendId — remove amigo', async () => {
    const userA = await createUser(app, { email: 'del-a@test.com' })
    const userB = await createUser(app, { email: 'del-b@test.com' })
    const req = JSON.parse(
      (await authedRequest(app, userA.token, 'POST', '/friends/requests', { receiverId: userB.id })).body
    )
    await authedRequest(app, userB.token, 'POST', `/friends/requests/${req.id}/accept`)

    const del = await authedRequest(app, userA.token, 'DELETE', `/friends/${userB.id}`)
    expect(del.statusCode).toBe(204)

    const friends = JSON.parse((await authedRequest(app, userA.token, 'GET', '/friends')).body)
    expect(friends.some((f: { id: string }) => f.id === userB.id)).toBe(false)
  })
})
