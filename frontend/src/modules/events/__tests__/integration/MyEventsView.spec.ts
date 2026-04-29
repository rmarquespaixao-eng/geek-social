import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import MyEventsView from '../../views/MyEventsView.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { server } from '../../../../../tests/mocks/server'

function setupRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/meus-roles', component: MyEventsView },
      { path: '/roles/:id', component: { template: '<div/>' } },
      { path: '/roles/:id/editar', component: { template: '<div/>' } },
    ],
  })
}

const sampleEvent = (id: string, name: string) => ({
  id,
  hostUserId: 'h1',
  hostName: 'Host',
  name,
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
})

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setUser({ id: 'me', email: 'me@x.com', displayName: 'Me' } as never)
})

describe('MyEventsView', () => {
  it('renders attending events on first load', async () => {
    server.use(
      http.get('*/events/me/attending', () =>
        HttpResponse.json({ events: [sampleEvent('e1', 'Inscrito 1')], nextCursor: null }),
      ),
      http.get('*/events/me/hosted', () =>
        HttpResponse.json({ events: [sampleEvent('e2', 'Anfitrião 1')], nextCursor: null }),
      ),
    )
    const router = setupRouter()
    router.push('/meus-roles')
    await router.isReady()
    const wrapper = mount(MyEventsView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Inscrito 1')
    expect(wrapper.text()).not.toContain('Anfitrião 1')
  })

  it('switches to hosted tab and fetches the host list', async () => {
    server.use(
      http.get('*/events/me/attending', () =>
        HttpResponse.json({ events: [], nextCursor: null }),
      ),
      http.get('*/events/me/hosted', () =>
        HttpResponse.json({ events: [sampleEvent('h1', 'Como host')], nextCursor: null }),
      ),
    )
    const router = setupRouter()
    router.push('/meus-roles')
    await router.isReady()
    const wrapper = mount(MyEventsView, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('[data-testid="tab-hosted"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Como host')
  })
})
