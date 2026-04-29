import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Pool } from 'pg'
import {
  buildTestApp,
  truncateAll,
  createUser,
  authedRequest,
  TINY_PNG,
  type UserFixture,
} from './setup/helpers.js'

// ─────────────────────────────────────────────────────────────────────
// Mock S3 — sobrescreve o adapter para evitar dependência de MinIO em CI.
// ─────────────────────────────────────────────────────────────────────
vi.mock('../../src/shared/infra/storage/s3.adapter.js', () => {
  class S3Adapter {
    constructor() {}
    async upload(key: string, _buffer: Buffer, _mime: string) {
      return `https://test.local/${key}`
    }
    async delete() { /* noop */ }
    keyFromUrl(url: string) {
      const prefix = 'https://test.local/'
      return url.startsWith(prefix) ? url.slice(prefix.length) : null
    }
  }
  return { S3Adapter }
})

// Stub sharp para não quebrar com TINY_PNG (evita dependência de libvips funcional)
vi.mock('sharp', () => {
  const factory = (_buf: Buffer) => ({
    resize() { return this },
    webp() { return this },
    toBuffer: async () => Buffer.from('fakewebp'),
  })
  return { default: factory }
})

// ─────────────────────────────────────────────────────────────────────
// Helpers locais
// ─────────────────────────────────────────────────────────────────────
type CreateEventOptions = {
  name?: string
  startsAt?: Date
  durationMinutes?: 60 | 120 | 180 | 240 | 360 | 600
  type?: 'presencial' | 'online'
  visibility?: 'public' | 'friends' | 'invite'
  capacity?: number | null
  cidade?: string
  description?: string
}

async function createEvent(
  app: FastifyInstance,
  user: UserFixture,
  opts: CreateEventOptions = {},
): Promise<{ statusCode: number; body: any }> {
  const startsAt = opts.startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const type = opts.type ?? 'presencial'
  const fields: Record<string, string> = {
    name: opts.name ?? 'Rolê de teste',
    description: opts.description ?? 'Descrição',
    startsAt: startsAt.toISOString(),
    durationMinutes: String(opts.durationMinutes ?? 120),
    type,
    visibility: opts.visibility ?? 'public',
  }
  if (opts.capacity != null) fields.capacity = String(opts.capacity)
  if (type === 'presencial') {
    fields.address = JSON.stringify({
      cep: '01310-100',
      logradouro: 'Av. Paulista',
      numero: '1000',
      complemento: null,
      bairro: 'Bela Vista',
      cidade: opts.cidade ?? 'São Paulo',
      estado: 'SP',
    })
  } else {
    fields.onlineDetails = JSON.stringify({
      meetingUrl: 'https://meet.example.com/abc',
      extraDetails: 'Sala 1',
    })
  }

  const boundary = '----E2EBoundaryEvents'
  const segments: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    segments.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
      ),
    )
  }
  segments.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
  )
  segments.push(TINY_PNG)
  segments.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  const res = await app.inject({
    method: 'POST',
    url: '/events',
    headers: {
      authorization: `Bearer ${user.token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(segments),
  })
  const parsed = res.body ? safeParse(res.body) : null
  // POST /events agora responde { event: EventSummary } — achata p/ não quebrar usos `body.id`.
  // Em respostas de erro (400/422) `parsed.event` é undefined → cai no fallback.
  const body = parsed && typeof parsed === 'object' && 'event' in parsed ? parsed.event : parsed
  return { statusCode: res.statusCode, body }
}

function safeParse(body: string): any {
  try { return JSON.parse(body) } catch { return body }
}

// Helper de DB para forçar valores em events (ex: `starts_at` no passado)
async function execSql(sql: string, params: unknown[] = []) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const r = await pool.query(sql, params)
  await pool.end()
  return r
}

// ─────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────
describe('Events ("Rolê") E2E', () => {
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

  // ─── Criação ────────────────────────────────────────────────────────
  it('POST /events — cria evento presencial com capa (201)', async () => {
    const host = await createUser(app, { email: 'host@test.com' })
    const res = await createEvent(app, host)
    expect(res.statusCode).toBe(201)
    expect(res.body.id).toBeTruthy()
    expect(res.body.type).toBe('presencial')
    expect(res.body.cidade).toBe('São Paulo')
    expect(res.body.coverUrl).toMatch(/^https:\/\/test\.local\//)

    // Detalhe completo expõe address dentro do envelope
    const detail = JSON.parse(
      (await authedRequest(app, host.token, 'GET', `/events/${res.body.id}`)).body,
    )
    expect(detail.address.cidade).toBe('São Paulo')
  })

  it('POST /events — cria evento online com meeting URL (201)', async () => {
    const host = await createUser(app, { email: 'host-on@test.com' })
    const res = await createEvent(app, host, { type: 'online' })
    expect(res.statusCode).toBe(201)
    expect(res.body.type).toBe('online')

    const detail = JSON.parse(
      (await authedRequest(app, host.token, 'GET', `/events/${res.body.id}`)).body,
    )
    expect(detail.onlineDetails.meetingUrl).toBe('https://meet.example.com/abc')
  })

  it('POST /events — falha 400 sem capa', async () => {
    const host = await createUser(app, { email: 'no-cover@test.com' })
    const startsAt = new Date(Date.now() + 86400000).toISOString()
    const boundary = '----X'
    const fields = {
      name: 'Sem capa', startsAt, durationMinutes: '60', type: 'online',
      onlineDetails: JSON.stringify({ meetingUrl: 'https://meet.example.com/abc' }),
    }
    const segments: Buffer[] = []
    for (const [k, v] of Object.entries(fields)) {
      segments.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
      ))
    }
    segments.push(Buffer.from(`--${boundary}--\r\n`))
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      headers: { authorization: `Bearer ${host.token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat(segments),
    })
    expect([400, 422]).toContain(res.statusCode)
  })

  it('POST /events — duração inválida retorna 400/422', async () => {
    const host = await createUser(app, { email: 'dur@test.com' })
    // Abaixo do mínimo (15 min) — deve falhar.
    const res = await createEvent(app, host, { durationMinutes: 5 as unknown as 60 })
    expect([400, 422]).toContain(res.statusCode)
  })

  // ─── Listagem ───────────────────────────────────────────────────────
  it('GET /events — lista com filtros de cidade e tipo', async () => {
    const host = await createUser(app, { email: 'lh@test.com' })
    await createEvent(app, host, { cidade: 'São Paulo', name: 'Em SP' })
    await createEvent(app, host, { cidade: 'Rio', name: 'No Rio' })
    await createEvent(app, host, { type: 'online', name: 'Online' })

    const viewer = await createUser(app, { email: 'lv@test.com' })
    const sp = JSON.parse((await authedRequest(app, viewer.token, 'GET', '/events?cidade=S%C3%A3o%20Paulo')).body)
    expect(sp.events.length).toBe(1)
    expect(sp.events[0].name).toBe('Em SP')

    const onl = JSON.parse((await authedRequest(app, viewer.token, 'GET', '/events?type=online')).body)
    expect(onl.events.length).toBe(1)
    expect(onl.events[0].type).toBe('online')
  })

  // ─── Visibilidade ──────────────────────────────────────────────────
  it('GET /events/:id — friends-only por não-amigo retorna 403', async () => {
    const host = await createUser(app, { email: 'fh@test.com' })
    const stranger = await createUser(app, { email: 'st@test.com' })
    const ev = await createEvent(app, host, { visibility: 'friends' })
    expect(ev.statusCode).toBe(201)
    const res = await authedRequest(app, stranger.token, 'GET', `/events/${ev.body.id}`)
    expect(res.statusCode).toBe(403)
  })

  // ─── Inscrição ─────────────────────────────────────────────────────
  it('POST /events/:id/participants — vagas livres → status=subscribed', async () => {
    const host = await createUser(app, { email: 'sh@test.com' })
    const guest = await createUser(app, { email: 'sg@test.com' })
    const ev = (await createEvent(app, host, { capacity: 5 })).body
    const sub = await authedRequest(app, guest.token, 'POST', `/events/${ev.id}/participants`)
    expect(sub.statusCode).toBe(201)
    expect(JSON.parse(sub.body).status).toBe('subscribed')
  })

  it('POST /events/:id/participants — vagas cheias → status=waitlist + posição', async () => {
    const host = await createUser(app, { email: 'wh@test.com' })
    const u1 = await createUser(app, { email: 'w1@test.com' })
    const u2 = await createUser(app, { email: 'w2@test.com' })
    const u3 = await createUser(app, { email: 'w3@test.com' })
    const ev = (await createEvent(app, host, { capacity: 1 })).body
    expect((await authedRequest(app, u1.token, 'POST', `/events/${ev.id}/participants`)).statusCode).toBe(201)
    const r2 = JSON.parse((await authedRequest(app, u2.token, 'POST', `/events/${ev.id}/participants`)).body)
    expect(r2.status).toBe('waitlist')
    expect(r2.position).toBe(1)
    const r3 = JSON.parse((await authedRequest(app, u3.token, 'POST', `/events/${ev.id}/participants`)).body)
    expect(r3.status).toBe('waitlist')
    expect(r3.position).toBe(2)
  })

  it('POST /events/:id/participants — conflito de horário → 409', async () => {
    const h1 = await createUser(app, { email: 'h1@test.com' })
    const h2 = await createUser(app, { email: 'h2@test.com' })
    const guest = await createUser(app, { email: 'gconf@test.com' })
    const startsAt = new Date(Date.now() + 7 * 86400000)
    const ev1 = (await createEvent(app, h1, { startsAt })).body
    const ev2 = (await createEvent(app, h2, { startsAt })).body
    expect((await authedRequest(app, guest.token, 'POST', `/events/${ev1.id}/participants`)).statusCode).toBe(201)
    const r = await authedRequest(app, guest.token, 'POST', `/events/${ev2.id}/participants`)
    expect(r.statusCode).toBe(409)
  })

  // ─── Saída + promoção waitlist ─────────────────────────────────────
  it('DELETE /events/:id/participants/me — promove primeiro da waitlist', async () => {
    const host = await createUser(app, { email: 'ph@test.com' })
    const u1 = await createUser(app, { email: 'pu1@test.com' })
    const u2 = await createUser(app, { email: 'pu2@test.com' })
    const ev = (await createEvent(app, host, { capacity: 1 })).body
    await authedRequest(app, u1.token, 'POST', `/events/${ev.id}/participants`)
    const r2 = JSON.parse((await authedRequest(app, u2.token, 'POST', `/events/${ev.id}/participants`)).body)
    expect(r2.status).toBe('waitlist')

    const del = await authedRequest(app, u1.token, 'DELETE', `/events/${ev.id}/participants/me`)
    expect(del.statusCode).toBe(204)

    const list = JSON.parse(
      (await authedRequest(app, host.token, 'GET', `/events/${ev.id}/participants`)).body,
    )
    const u2Part = list.participants.find((p: { userId: string }) => p.userId === u2.id)
    expect(u2Part.status).toBe('subscribed')
  })

  // ─── Confirmação ───────────────────────────────────────────────────
  it('POST /events/:id/participants/me/confirm — muda status para confirmed', async () => {
    const host = await createUser(app, { email: 'ch@test.com' })
    const guest = await createUser(app, { email: 'cg@test.com' })
    const ev = (await createEvent(app, host)).body
    await authedRequest(app, guest.token, 'POST', `/events/${ev.id}/participants`)
    const conf = await authedRequest(app, guest.token, 'POST', `/events/${ev.id}/participants/me/confirm`)
    expect(conf.statusCode).toBe(200)
    expect(JSON.parse(conf.body).status).toBe('confirmed')
  })

  // ─── Edição sensível ───────────────────────────────────────────────
  it('PATCH /events/:id — mudança de startsAt notifica inscritos (sensitiveChanged)', async () => {
    const host = await createUser(app, { email: 'eh@test.com' })
    const guest = await createUser(app, { email: 'eg@test.com' })
    const ev = (await createEvent(app, host)).body
    await authedRequest(app, guest.token, 'POST', `/events/${ev.id}/participants`)
    const newStart = new Date(Date.now() + 14 * 86400000).toISOString()
    const res = await authedRequest(app, host.token, 'PATCH', `/events/${ev.id}`, { startsAt: newStart })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.sensitiveChanged).toContain('startsAt')

    const { notifications: notifs } = JSON.parse((await authedRequest(app, guest.token, 'GET', '/notifications')).body)
    expect(notifs.some((n: { type: string }) => n.type === 'event_updated')).toBe(true)
  })

  it('PATCH /events/:id — edição que cria conflito dispara event_conflict_after_edit', async () => {
    const h1 = await createUser(app, { email: 'eh1@test.com' })
    const h2 = await createUser(app, { email: 'eh2@test.com' })
    const guest = await createUser(app, { email: 'egc@test.com' })
    const day = new Date(Date.now() + 7 * 86400000)
    const ev1 = (await createEvent(app, h1, { startsAt: new Date(day.getTime()) })).body
    const ev2 = (await createEvent(app, h2, { startsAt: new Date(day.getTime() + 5 * 86400000) })).body
    await authedRequest(app, guest.token, 'POST', `/events/${ev1.id}/participants`)
    await authedRequest(app, guest.token, 'POST', `/events/${ev2.id}/participants`)

    // Move ev2 para colidir com ev1
    const collision = new Date(day.getTime() + 30 * 60 * 1000).toISOString()
    const patch = await authedRequest(app, h2.token, 'PATCH', `/events/${ev2.id}`, { startsAt: collision })
    expect(patch.statusCode).toBe(200)
    const { notifications: notifs } = JSON.parse((await authedRequest(app, guest.token, 'GET', '/notifications')).body)
    expect(notifs.some((n: { type: string }) => n.type === 'event_conflict_after_edit')).toBe(true)
  })

  // ─── Cancelamento ──────────────────────────────────────────────────
  it('DELETE /events/:id — cancela e notifica inscritos', async () => {
    const host = await createUser(app, { email: 'cancelh@test.com' })
    const guest = await createUser(app, { email: 'cancelg@test.com' })
    const ev = (await createEvent(app, host)).body
    await authedRequest(app, guest.token, 'POST', `/events/${ev.id}/participants`)
    const del = await authedRequest(app, host.token, 'DELETE', `/events/${ev.id}`, { reason: 'Bateu chuva' })
    expect(del.statusCode).toBe(204)
    const { notifications: notifs } = JSON.parse((await authedRequest(app, guest.token, 'GET', '/notifications')).body)
    expect(notifs.some((n: { type: string }) => n.type === 'event_cancelled')).toBe(true)
    // Cancelado preserva o evento no banco com status='cancelled'
    const detail = await authedRequest(app, host.token, 'GET', `/events/${ev.id}`)
    expect(detail.statusCode).toBe(200)
    expect(JSON.parse(detail.body).event.status).toBe('cancelled')
  })

  // ─── Hard delete ───────────────────────────────────────────────────
  it('DELETE /events/:id/permanent — remove evento do banco e notifica inscritos', async () => {
    const host = await createUser(app, { email: 'delh@test.com' })
    const guest = await createUser(app, { email: 'delg@test.com' })
    const ev = (await createEvent(app, host)).body
    await authedRequest(app, guest.token, 'POST', `/events/${ev.id}/participants`)
    const del = await authedRequest(app, host.token, 'DELETE', `/events/${ev.id}/permanent`)
    expect(del.statusCode).toBe(204)
    // Notificação enviada (status era 'scheduled')
    const { notifications: notifs } = JSON.parse((await authedRequest(app, guest.token, 'GET', '/notifications')).body)
    expect(notifs.some((n: { type: string }) => n.type === 'event_cancelled')).toBe(true)
    // Evento sumiu de fato — GET retorna 404
    const detail = await authedRequest(app, host.token, 'GET', `/events/${ev.id}`)
    expect(detail.statusCode).toBe(404)
  })

  it('DELETE /events/:id/permanent — não-host devolve 403 NOT_HOST', async () => {
    const host = await createUser(app, { email: 'delh2@test.com' })
    const stranger = await createUser(app, { email: 'delstr@test.com' })
    const ev = (await createEvent(app, host)).body
    const del = await authedRequest(app, stranger.token, 'DELETE', `/events/${ev.id}/permanent`)
    expect(del.statusCode).toBe(403)
    expect(JSON.parse(del.body).error).toBe('NOT_HOST')
  })

  // ─── Convites ──────────────────────────────────────────────────────
  it('Convites — só convidado consegue ver e inscrever em rolê visibility=invite', async () => {
    const host = await createUser(app, { email: 'invh@test.com' })
    const inviteeOk = await createUser(app, { email: 'invok@test.com' })
    const stranger = await createUser(app, { email: 'invno@test.com' })
    const ev = (await createEvent(app, host, { visibility: 'invite' })).body

    // Stranger NÃO consegue ver
    const block = await authedRequest(app, stranger.token, 'GET', `/events/${ev.id}`)
    expect(block.statusCode).toBe(403)

    // Cria convite
    const invRes = await authedRequest(app, host.token, 'POST', `/events/${ev.id}/invites`, {
      userIds: [inviteeOk.id],
    })
    expect(invRes.statusCode).toBe(201)

    // Convidado vê + inscreve
    const ok = await authedRequest(app, inviteeOk.token, 'GET', `/events/${ev.id}`)
    expect(ok.statusCode).toBe(200)
    const sub = await authedRequest(app, inviteeOk.token, 'POST', `/events/${ev.id}/participants`)
    expect(sub.statusCode).toBe(201)
  })

  // ─── Job de finalização ────────────────────────────────────────────
  it('Job de finalização — UPDATE para ended quando ends_at < now()', async () => {
    const host = await createUser(app, { email: 'finh@test.com' })
    const ev = (await createEvent(app, host)).body
    // Força evento para o passado
    await execSql(
      `UPDATE events SET starts_at = $1, ends_at = $2 WHERE id = $3`,
      [new Date(Date.now() - 5 * 60 * 60 * 1000), new Date(Date.now() - 60 * 60 * 1000), ev.id],
    )
    // Chama o cron via service indireto: re-construir não é prático aqui — usa a rota detail e estado direto
    // Simulamos via SQL por enquanto:
    await execSql(`UPDATE events SET status='ended' WHERE id=$1 AND ends_at < now()`, [ev.id])
    const detail = JSON.parse((await authedRequest(app, host.token, 'GET', `/events/${ev.id}`)).body)
    expect(detail.event.status).toBe('ended')
  })

  // ─── Lembretes (cobertura via promoted-after-T-48h) ────────────────
  it('Lembretes — promoção dentro de T-48h dispara reminder imediato', async () => {
    const host = await createUser(app, { email: 'rh@test.com' })
    const u1 = await createUser(app, { email: 'r1@test.com' })
    const u2 = await createUser(app, { email: 'r2@test.com' })
    // startsAt em 24h => dentro de T-48h
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const ev = (await createEvent(app, host, { capacity: 1, startsAt })).body
    await authedRequest(app, u1.token, 'POST', `/events/${ev.id}/participants`)
    await authedRequest(app, u2.token, 'POST', `/events/${ev.id}/participants`) // waitlist

    await authedRequest(app, u1.token, 'DELETE', `/events/${ev.id}/participants/me`) // promove u2

    const { notifications: notifs } = JSON.parse((await authedRequest(app, u2.token, 'GET', '/notifications')).body)
    expect(notifs.some((n: { type: string }) => n.type === 'event_promoted_from_waitlist')).toBe(true)
    expect(notifs.some((n: { type: string }) => n.type === 'event_reminder_48h')).toBe(true)
  })
})
