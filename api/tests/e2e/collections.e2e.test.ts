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

describe('Collections E2E', () => {
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

  it('POST /collections — cria coleção e retorna 201', async () => {
    const { token } = await createUser(app)
    const res = await authedRequest(app, token, 'POST', '/collections', {
      name: 'Minha Coleção',
      type: 'games',
      visibility: 'public',
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('Minha Coleção')
    expect(body.type).toBe('games')
  })

  it('GET /collections — lista coleções do usuário autenticado', async () => {
    const { token } = await createUser(app)
    await authedRequest(app, token, 'POST', '/collections', {
      name: 'Col 1', type: 'books', visibility: 'public',
    })
    await authedRequest(app, token, 'POST', '/collections', {
      name: 'Col 2', type: 'games', visibility: 'public',
    })
    const res = await authedRequest(app, token, 'GET', '/collections')
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(2)
  })

  it('GET /collections/:id — busca coleção por id', async () => {
    const { token } = await createUser(app)
    const created = JSON.parse(
      (await authedRequest(app, token, 'POST', '/collections', { name: 'RPGs', type: 'games', visibility: 'public' })).body
    )
    const res = await authedRequest(app, token, 'GET', `/collections/${created.id}`)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).name).toBe('RPGs')
  })

  it('PUT /collections/:id — edita nome e visibilidade', async () => {
    const { token } = await createUser(app)
    const created = JSON.parse(
      (await authedRequest(app, token, 'POST', '/collections', { name: 'Antigo', type: 'games', visibility: 'public' })).body
    )
    const res = await authedRequest(app, token, 'PUT', `/collections/${created.id}`, {
      name: 'Novo Nome',
      visibility: 'private',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.name).toBe('Novo Nome')
    expect(body.visibility).toBe('private')
  })

  it('POST /collections/:id/cover — upload multipart retorna 200 com coverUrl', async () => {
    const { token } = await createUser(app)
    const created = JSON.parse(
      (await authedRequest(app, token, 'POST', '/collections', { name: 'Col Cover', type: 'games', visibility: 'public' })).body
    )
    const { body, contentTypeHeader } = buildMultipartBody('file', 'cover.png', 'image/png', TINY_PNG)
    const res = await app.inject({
      method: 'POST',
      url: `/collections/${created.id}/cover`,
      headers: { authorization: `Bearer ${token}`, 'content-type': contentTypeHeader },
      body,
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).coverUrl).toContain('geek-social-media')
  })

  it('DELETE /collections/:id — deleta e GET retorna 404', async () => {
    const { token } = await createUser(app)
    const created = JSON.parse(
      (await authedRequest(app, token, 'POST', '/collections', { name: 'Para Deletar', type: 'games', visibility: 'public' })).body
    )
    const del = await authedRequest(app, token, 'DELETE', `/collections/${created.id}`)
    expect(del.statusCode).toBe(204)

    const get = await authedRequest(app, token, 'GET', `/collections/${created.id}`)
    expect(get.statusCode).toBe(404)
  })
})
