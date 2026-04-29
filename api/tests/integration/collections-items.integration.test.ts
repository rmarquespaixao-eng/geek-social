import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

describe('Collections + Items Integration', () => {
  let app: FastifyInstance
  let authHeader: string
  let userId: string

  beforeAll(async () => {
    app = await buildApp()

    const email = `integ-colecoes-${Date.now()}@test.com`
    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        password: 'Senha123!',
        displayName: 'Integration User',
      },
    })
    expect(regRes.statusCode).toBe(201)
    const regBody = JSON.parse(regRes.body)
    userId = regBody.user.id
    authHeader = `Bearer ${regBody.accessToken}`
  }, 30000)

  afterAll(async () => {
    await app.close()
  })

  it('deve criar coleção de jogos e popular schema automaticamente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: { authorization: authHeader },
      payload: { name: 'Meus PS2', type: 'games', visibility: 'public' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.type).toBe('games')
    expect(body.fieldSchema.length).toBeGreaterThan(0)
    expect(body.fieldSchema.some((f: { fieldDefinition: { fieldKey: string } }) => f.fieldDefinition.fieldKey === 'platform')).toBe(true)
  })

  it('deve criar item na coleção e buscar por nome', async () => {
    const colRes = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: { authorization: authHeader },
      payload: { name: 'RPGs', type: 'games', visibility: 'public' },
    })
    expect(colRes.statusCode).toBe(201)
    const collection = JSON.parse(colRes.body)

    const itemRes = await app.inject({
      method: 'POST',
      url: `/collections/${collection.id}/items`,
      headers: { authorization: authHeader },
      payload: { name: 'Final Fantasy VII', fields: { platform: 'PS2' } },
    })
    expect(itemRes.statusCode).toBe(201)
    expect(JSON.parse(itemRes.body).name).toBe('Final Fantasy VII')

    const searchRes = await app.inject({
      method: 'GET',
      url: `/collections/${collection.id}/items?q=Final`,
      headers: { authorization: authHeader },
    })
    expect(searchRes.statusCode).toBe(200)
    const body = JSON.parse(searchRes.body)
    expect(body.items.some((i: { name: string }) => i.name === 'Final Fantasy VII')).toBe(true)
  })

  it('deve recusar item com valor inválido em campo select', async () => {
    const colRes = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: { authorization: authHeader },
      payload: { name: 'Teste Validação', type: 'games' },
    })
    expect(colRes.statusCode).toBe(201)
    const collection = JSON.parse(colRes.body)

    const res = await app.inject({
      method: 'POST',
      url: `/collections/${collection.id}/items`,
      headers: { authorization: authHeader },
      payload: { name: 'Jogo Inválido', fields: { platform: 'Atari 2600' } },
    })
    expect(res.statusCode).toBe(422)
  })

  it('deve excluir coleção e remover itens em cascade', async () => {
    const colRes = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: { authorization: authHeader },
      payload: { name: 'Para Deletar', type: 'books' },
    })
    expect(colRes.statusCode).toBe(201)
    const collection = JSON.parse(colRes.body)

    await app.inject({
      method: 'POST',
      url: `/collections/${collection.id}/items`,
      headers: { authorization: authHeader },
      payload: { name: 'Livro X', fields: {} },
    })

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/collections/${collection.id}`,
      headers: { authorization: authHeader },
    })
    expect(delRes.statusCode).toBe(204)

    const getRes = await app.inject({
      method: 'GET',
      url: `/collections/${collection.id}`,
      headers: { authorization: authHeader },
    })
    expect(getRes.statusCode).toBe(404)
  })
})
