import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, truncateAll, createUser, authedRequest } from './setup/helpers.js'

describe('Posts E2E', () => {
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

  it('POST /posts — cria post manual e retorna 201', async () => {
    const { token } = await createUser(app)
    const res = await authedRequest(app, token, 'POST', '/posts', {
      content: 'Meu primeiro post!',
      visibility: 'public',
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBeTruthy()
    expect(body.content).toBe('Meu primeiro post!')
    expect(body.visibility).toBe('public')
  })

  it('POST /posts — sem autenticação retorna 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Anon', visibility: 'public' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('GET /posts/:id — busca post por id', async () => {
    const { token } = await createUser(app)
    const created = JSON.parse(
      (await authedRequest(app, token, 'POST', '/posts', { content: 'Post GET', visibility: 'public' })).body
    )
    const res = await authedRequest(app, token, 'GET', `/posts/${created.id}`)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).content).toBe('Post GET')
  })

  it('PATCH /posts/:id — edita conteúdo do post', async () => {
    const { token } = await createUser(app)
    const created = JSON.parse(
      (await authedRequest(app, token, 'POST', '/posts', { content: 'Original', visibility: 'public' })).body
    )
    const res = await authedRequest(app, token, 'PATCH', `/posts/${created.id}`, {
      content: 'Editado',
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).content).toBe('Editado')
  })

  it('DELETE /posts/:id — deleta post; GET seguinte retorna 404', async () => {
    const { token } = await createUser(app)
    const created = JSON.parse(
      (await authedRequest(app, token, 'POST', '/posts', { content: 'Para deletar', visibility: 'public' })).body
    )
    const del = await authedRequest(app, token, 'DELETE', `/posts/${created.id}`)
    expect(del.statusCode).toBe(204)

    const get = await authedRequest(app, token, 'GET', `/posts/${created.id}`)
    expect(get.statusCode).toBe(404)
  })
})
