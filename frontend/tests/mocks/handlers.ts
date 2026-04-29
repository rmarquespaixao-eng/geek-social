import { http, HttpResponse } from 'msw'

const API = '*/events'

export const handlers = [
  // GET /events — listing
  http.get(API, () => {
    return HttpResponse.json({ events: [], nextCursor: null })
  }),

  // POST /events — create
  http.post(API, async () => {
    return HttpResponse.json(
      {
        event: {
          id: 'new-event-id',
          hostUserId: 'user-1',
          name: 'Novo Rolê',
          description: null,
          coverUrl: 'https://example.com/cover.jpg',
          startsAt: '2026-05-01T19:00:00.000Z',
          durationMinutes: 180,
          endsAt: '2026-05-01T22:00:00.000Z',
          type: 'presencial',
          visibility: 'public',
          capacity: 10,
          status: 'scheduled',
          cancellationReason: null,
          cancelledAt: null,
          createdAt: '2026-04-28T00:00:00.000Z',
          updatedAt: '2026-04-28T00:00:00.000Z',
        },
      },
      { status: 201 },
    )
  }),

  // GET /events/me/hosted
  http.get(`${API}/me/hosted`, () => {
    return HttpResponse.json({ events: [], nextCursor: null })
  }),

  // GET /events/me/attending
  http.get(`${API}/me/attending`, () => {
    return HttpResponse.json({ events: [], nextCursor: null })
  }),

  // GET /events/:id
  http.get(`${API}/:id`, ({ params }) => {
    return HttpResponse.json({
      event: {
        id: params.id,
        hostUserId: 'user-1',
        name: 'Rolê de Teste',
        description: 'descrição',
        coverUrl: 'https://example.com/cover.jpg',
        startsAt: '2026-05-01T19:00:00.000Z',
        durationMinutes: 180,
        endsAt: '2026-05-01T22:00:00.000Z',
        type: 'presencial',
        visibility: 'public',
        capacity: 10,
        status: 'scheduled',
        cancellationReason: null,
        cancelledAt: null,
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T00:00:00.000Z',
      },
      participants: [],
      iAmIn: null,
      hostInfo: { id: 'user-1', name: 'Anfitrião', avatarUrl: null },
    })
  }),

  // PATCH /events/:id
  http.patch(`${API}/:id`, () => {
    return HttpResponse.json({ event: {}, sensitiveChanged: false })
  }),

  // DELETE /events/:id
  http.delete(`${API}/:id`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // POST /events/:id/participants
  http.post(`${API}/:id/participants`, () => {
    return HttpResponse.json({ status: 'subscribed' }, { status: 201 })
  }),

  // DELETE /events/:id/participants/me
  http.delete(`${API}/:id/participants/me`, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // POST /events/:id/participants/me/confirm
  http.post(`${API}/:id/participants/me/confirm`, () => {
    return HttpResponse.json({ status: 'confirmed' })
  }),

  // GET /events/:id/participants
  http.get(`${API}/:id/participants`, () => {
    return HttpResponse.json({ participants: [], nextCursor: null })
  }),

  // viacep
  http.get('https://viacep.com.br/ws/:cep/json/', ({ params }) => {
    return HttpResponse.json({
      cep: params.cep,
      logradouro: 'Rua Teste',
      bairro: 'Centro',
      localidade: 'São Paulo',
      uf: 'SP',
    })
  }),
]
