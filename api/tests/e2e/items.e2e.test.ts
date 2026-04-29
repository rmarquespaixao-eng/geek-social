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

describe('Items E2E', () => {
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

  async function setupCollection(app: FastifyInstance) {
    const user = await createUser(app)
    const colRes = await authedRequest(app, user.token, 'POST', '/collections', {
      name: 'Test Col',
      type: 'games',
      visibility: 'public',
    })
    const col = JSON.parse(colRes.body)
    return { user, col }
  }

  it('POST /collections/:id/items — cria item com fields e retorna 201', async () => {
    const { user, col } = await setupCollection(app)
    const res = await authedRequest(app, user.token, 'POST', `/collections/${col.id}/items`, {
      name: 'The Last of Us',
      fields: [{ fieldKey: 'platform', value: 'PS4' }],
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBeTruthy()
    expect(body.name).toBe('The Last of Us')
  })

  it('GET /collections/:id/items — lista itens da coleção', async () => {
    const { user, col } = await setupCollection(app)
    await authedRequest(app, user.token, 'POST', `/collections/${col.id}/items`, {
      name: 'Item A', fields: [],
    })
    await authedRequest(app, user.token, 'POST', `/collections/${col.id}/items`, {
      name: 'Item B', fields: [],
    })
    const res = await authedRequest(app, user.token, 'GET', `/collections/${col.id}/items`)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items.length).toBe(2)
    expect(body.nextCursor).toBe(null)
  })

  it('PATCH /collections/:id/items/:itemId — edita campos do item', async () => {
    const { user, col } = await setupCollection(app)
    const item = JSON.parse(
      (await authedRequest(app, user.token, 'POST', `/collections/${col.id}/items`, { name: 'Original', fields: [] })).body
    )
    const res = await authedRequest(app, user.token, 'PUT', `/collections/${col.id}/items/${item.id}`, {
      name: 'Editado',
      fields: [{ fieldKey: 'platform', value: 'PC' }],
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).name).toBe('Editado')
  })

  it('POST /collections/:id/items/:itemId/cover — upload cover retorna 200 com coverUrl', async () => {
    const { user, col } = await setupCollection(app)
    const item = JSON.parse(
      (await authedRequest(app, user.token, 'POST', `/collections/${col.id}/items`, { name: 'Item Cover', fields: [] })).body
    )
    const { body, contentTypeHeader } = buildMultipartBody('file', 'cover.png', 'image/png', TINY_PNG)
    const res = await app.inject({
      method: 'POST',
      url: `/collections/${col.id}/items/${item.id}/cover`,
      headers: { authorization: `Bearer ${user.token}`, 'content-type': contentTypeHeader },
      body,
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).coverUrl).toContain('geek-social-media')
  })

  it('DELETE /collections/:id/items/:itemId — deleta item', async () => {
    const { user, col } = await setupCollection(app)
    const item = JSON.parse(
      (await authedRequest(app, user.token, 'POST', `/collections/${col.id}/items`, { name: 'Para Deletar', fields: [] })).body
    )
    const del = await authedRequest(app, user.token, 'DELETE', `/collections/${col.id}/items/${item.id}`)
    expect(del.statusCode).toBe(204)

    const list = JSON.parse((await authedRequest(app, user.token, 'GET', `/collections/${col.id}/items`)).body)
    expect(list.items.find((i: { id: string }) => i.id === item.id)).toBeUndefined()
  })
})
