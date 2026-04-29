import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import EventsDiscoverView from '../../views/EventsDiscoverView.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { server } from '../../../../../tests/mocks/server'

function setupRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/roles', component: EventsDiscoverView },
      { path: '/roles/:id', component: { template: '<div>detail</div>' } },
      { path: '/roles/novo', component: { template: '<div>create</div>' } },
      { path: '/roles/:id/editar', component: { template: '<div/>' } },
    ],
  })
}

const sampleEvent = {
  id: 'e1',
  hostUserId: 'h1',
  hostName: 'Host',
  name: 'Rolê SP',
  description: null,
  coverUrl: 'https://example.com/c.jpg',
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
  confirmedCount: 3,
  waitlistCount: 0,
  cidade: 'São Paulo',
  iAmIn: null,
}

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setUser({ id: 'me', email: 'me@x.com', displayName: 'Me' } as never)
})

describe('EventsDiscoverView', () => {
  it('loads and renders the events list', async () => {
    server.use(
      http.get('*/events', () => HttpResponse.json({ events: [sampleEvent], nextCursor: null })),
    )
    const router = setupRouter()
    router.push('/roles')
    await router.isReady()
    const wrapper = mount(EventsDiscoverView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Rolê SP')
    expect(wrapper.findAll('[data-testid="event-ticket-card"]').length).toBe(1)
  })

  it('forwards filter values into the request query', async () => {
    let captured: URL | null = null
    server.use(
      http.get('*/events', ({ request }) => {
        captured = new URL(request.url)
        return HttpResponse.json({ events: [], nextCursor: null })
      }),
    )
    const router = setupRouter()
    router.push('/roles')
    await router.isReady()
    const wrapper = mount(EventsDiscoverView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('[data-testid="filter-type"]').setValue('online')
    await flushPromises()

    expect(captured).not.toBeNull()
    expect(captured!.searchParams.get('type')).toBe('online')
  })

  it('paginates via nextCursor when load-more is clicked', async () => {
    let calls = 0
    server.use(
      http.get('*/events', ({ request }) => {
        calls++
        const url = new URL(request.url)
        if (calls === 1) {
          return HttpResponse.json({
            events: [{ ...sampleEvent, id: 'e1' }],
            nextCursor: 'cursor-2',
          })
        }
        expect(url.searchParams.get('cursor')).toBe('cursor-2')
        return HttpResponse.json({ events: [{ ...sampleEvent, id: 'e2' }], nextCursor: null })
      }),
    )
    const router = setupRouter()
    router.push('/roles')
    await router.isReady()
    const wrapper = mount(EventsDiscoverView, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('[data-testid="load-more"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="event-ticket-card"]').length).toBe(2)
  })
})
