import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEventsStore } from '../../stores/eventsStore'
import type { EventDetail } from '../../types'
import { server } from '../../../../../tests/mocks/server'
import { http, HttpResponse } from 'msw'

function makeDetail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'evt-1',
    hostUserId: 'host-1',
    name: 'Rolê',
    description: null,
    coverUrl: 'https://example.com/cover.jpg',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    durationMinutes: 180,
    endsAt: new Date(Date.now() + 86_400_000 + 3 * 3_600_000).toISOString(),
    type: 'presencial',
    visibility: 'public',
    capacity: 10,
    status: 'scheduled',
    cancellationReason: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    participants: [],
    iAmIn: null,
    hostInfo: { id: 'host-1', name: 'Host', avatarUrl: null },
    ...overrides,
  }
}

describe('eventsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('caches event details and reuses them on next fetch', async () => {
    let calls = 0
    server.use(
      http.get('*/events/:id', ({ params }) => {
        calls++
        return HttpResponse.json({
          event: makeDetail({ id: String(params.id) }),
          participants: [],
          iAmIn: null,
          hostInfo: { id: 'host-1', name: 'Host', avatarUrl: null },
        })
      }),
    )

    const store = useEventsStore()
    const a = await store.fetchEvent('evt-1')
    const b = await store.fetchEvent('evt-1')
    expect(a.id).toBe('evt-1')
    // Reactive Map proxies don't preserve === identity across get() calls in
    // Pinia stores, but caching is verified by the call count being 1.
    expect(b).toEqual(a)
    expect(calls).toBe(1)
  })

  it('refetches when force=true', async () => {
    let calls = 0
    server.use(
      http.get('*/events/:id', ({ params }) => {
        calls++
        return HttpResponse.json({
          event: makeDetail({ id: String(params.id) }),
          participants: [],
          iAmIn: null,
          hostInfo: { id: 'host-1', name: 'Host', avatarUrl: null },
        })
      }),
    )
    const store = useEventsStore()
    await store.fetchEvent('evt-1')
    await store.fetchEvent('evt-1', true)
    expect(calls).toBe(2)
  })

  it('applyNotification(event_cancelled) marks cached event cancelled', () => {
    const store = useEventsStore()
    store.setCached(makeDetail({ id: 'e1', status: 'scheduled' }))
    store.applyNotification({
      type: 'event_cancelled',
      entityId: 'e1',
      data: { eventId: 'e1', reason: 'chuva' },
    })
    expect(store.getCached('e1')?.status).toBe('cancelled')
    expect(store.getCached('e1')?.cancellationReason).toBe('chuva')
  })

  it('applyNotification(event_promoted_from_waitlist) flips iAmIn to subscribed', async () => {
    server.use(
      http.get('*/events/:id', ({ params }) => {
        return HttpResponse.json({
          event: makeDetail({ id: String(params.id) }),
          participants: [],
          iAmIn: { status: 'subscribed', waitlistPosition: null },
          hostInfo: { id: 'host-1', name: 'Host', avatarUrl: null },
        })
      }),
    )
    const store = useEventsStore()
    store.setCached(
      makeDetail({
        id: 'e1',
        iAmIn: { status: 'waitlist', waitlistPosition: 2 },
      }),
    )
    store.applyNotification({
      type: 'event_promoted_from_waitlist',
      entityId: 'e1',
      data: { eventId: 'e1' },
    })
    // Synchronously mutated to subscribed
    expect(store.getCached('e1')?.iAmIn?.status).toBe('subscribed')
  })

  it('applyNotification(event_updated) drops the cache entry', () => {
    const store = useEventsStore()
    store.setCached(makeDetail({ id: 'e1' }))
    store.applyNotification({
      type: 'event_updated',
      entityId: 'e1',
      data: { eventId: 'e1', changedFields: ['startsAt'] },
    })
    expect(store.getCached('e1')).toBeUndefined()
  })

  it('cancelEvent marks summary lists cancelled too', async () => {
    server.use(
      http.delete('*/events/:id', () => new HttpResponse(null, { status: 204 })),
    )
    const store = useEventsStore()
    store.attendingEvents = [
      {
        id: 'e1',
        hostUserId: 'h',
        name: 'r',
        description: null,
        coverUrl: '',
        startsAt: '',
        durationMinutes: 60,
        endsAt: '',
        type: 'presencial',
        visibility: 'public',
        capacity: null,
        status: 'scheduled',
        cancellationReason: null,
        cancelledAt: null,
        createdAt: '',
        updatedAt: '',
      },
    ]
    await store.cancelEvent('e1', 'motivo')
    expect(store.attendingEvents[0].status).toBe('cancelled')
  })
})
