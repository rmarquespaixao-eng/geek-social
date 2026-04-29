import { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../src/app.js'

let _pool: Pool | undefined
function getPool(): Pool {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return _pool
}

export async function buildTestApp(): Promise<FastifyInstance> {
  const app = await buildApp()
  return app
}

export async function truncateAll(): Promise<void> {
  await getPool().query(`
    TRUNCATE TABLE
      post_reactions,
      post_comments,
      post_media,
      posts,
      collection_field_schema,
      items,
      collections,
      friendships,
      user_blocks,
      refresh_tokens,
      password_reset_tokens,
      push_subscriptions,
      user_presence,
      dm_requests,
      messages,
      message_attachments,
      conversation_members,
      conversations,
      users
    RESTART IDENTITY CASCADE
  `)
}

export type UserFixture = { id: string; email: string; token: string }

export async function createUser(
  app: FastifyInstance,
  overrides?: { email?: string; displayName?: string; password?: string },
): Promise<UserFixture> {
  const email = overrides?.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`
  const displayName = overrides?.displayName ?? 'Test User'
  const password = overrides?.password ?? 'Senha123!'

  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password, displayName },
  })

  if (res.statusCode !== 201) throw new Error(`createUser failed: ${res.statusCode} ${res.body}`)

  const body = JSON.parse(res.body)
  return { id: body.user.id, email, token: body.accessToken }
}

export async function authedRequest(
  app: FastifyInstance,
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  })
}

export const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000970485973000003e8000003e801b57b526b0000000d49444154789c63f8ffffff7f0009fb03fd2a86e38a' +
    '0000000049454e44ae426082',
  'hex',
)

export function buildMultipartBody(
  fieldName: string,
  filename: string,
  contentType: string,
  fileBuffer: Buffer,
): { body: Buffer; contentTypeHeader: string } {
  const boundary = '----E2ETestBoundary7x'
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, contentTypeHeader: `multipart/form-data; boundary=${boundary}` }
}
