import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  buildTestApp,
  truncateAll,
  createUser,
  authedRequest,
  TINY_PNG,
  buildMultipartBody,
} from './setup/helpers.js'

describe('Users E2E', () => {
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

  it('GET /users/me — retorna perfil do usuário autenticado com displayName', async () => {
    const { token } = await createUser(app, { displayName: 'Test User Me' })
    const res = await authedRequest(app, token, 'GET', '/users/me')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.displayName).toBe('Test User Me')
    expect(body.id).toBeTruthy()
  })

  it('GET /users/me — sem token retorna 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me' })
    expect(res.statusCode).toBe(401)
  })

  it('PUT /users/me/profile — atualiza displayName e bio', async () => {
    const { token } = await createUser(app)
    const res = await authedRequest(app, token, 'PUT', '/users/me/profile', {
      displayName: 'Nome Atualizado',
      bio: 'Minha bio atualizada',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.displayName).toBe('Nome Atualizado')
    expect(body.bio).toBe('Minha bio atualizada')
  })

  it('POST /users/me/avatar — upload multipart retorna 200 com avatarUrl', async () => {
    const { token } = await createUser(app)
    const { body, contentTypeHeader } = buildMultipartBody('file', 'avatar.png', 'image/png', TINY_PNG)
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/avatar',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': contentTypeHeader,
      },
      body,
    })
    expect(res.statusCode).toBe(200)
    const resBody = JSON.parse(res.body)
    expect(resBody.avatarUrl).toContain('geek-social-media')
  })

  it('GET /users/:id/profile — retorna perfil público de outro usuário', async () => {
    const viewer = await createUser(app)
    const target = await createUser(app, { email: 'target@test.com', displayName: 'Target User' })
    const res = await authedRequest(app, viewer.token, 'GET', `/users/${target.id}/profile`)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.displayName).toBe('Target User')
  })
})
