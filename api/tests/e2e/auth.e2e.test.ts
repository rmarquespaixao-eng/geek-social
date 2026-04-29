import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp, truncateAll } from './setup/helpers.js'

describe('Auth E2E', () => {
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

  it('POST /auth/register — cria conta e retorna accessToken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'novo@test.com', password: 'Senha123!', displayName: 'Novo User' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeTruthy()
    expect(body.user.email).toBe('novo@test.com')
    expect(res.cookies.find((c) => c.name === 'refreshToken')).toBeTruthy()
  })

  it('POST /auth/register — e-mail duplicado retorna 409', async () => {
    const payload = { email: 'dup@test.com', password: 'Senha123!', displayName: 'User' }
    await app.inject({ method: 'POST', url: '/auth/register', payload })
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload })
    expect(res.statusCode).toBe(409)
  })

  it('POST /auth/login — credenciais corretas retorna 200 e accessToken', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'login@test.com', password: 'Senha123!', displayName: 'Login User' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'login@test.com', password: 'Senha123!' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeTruthy()
  })

  it('POST /auth/login — credenciais erradas retorna 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@test.com', password: 'wrongpass' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /auth/refresh — com cookie válido retorna novo accessToken', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'refresh@test.com', password: 'Senha123!', displayName: 'Refresh User' },
    })
    const cookie = reg.cookies.find((c) => c.name === 'refreshToken')!
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: cookie.value },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).accessToken).toBeTruthy()
  })

  it('POST /auth/refresh — sem cookie retorna 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /auth/logout — invalida refresh token; segundo refresh retorna 401', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'logout@test.com', password: 'Senha123!', displayName: 'Logout User' },
    })
    const cookie = reg.cookies.find((c) => c.name === 'refreshToken')!

    await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { refreshToken: cookie.value },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: cookie.value },
    })
    expect(res.statusCode).toBe(401)
  })
})
