import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import EventDetailView from '../../views/EventDetailView.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { server } from '../../../../../tests/mocks/server'

function setupRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/roles', component: { template: '<div/>' } },
      { path: '/roles/:id', component: EventDetailView },
      { path: '/roles/:id/editar', component: { template: '<div/>' } },
      { path: '/profile/:userId', component: { template: '<div/>' } },
    ],
  })
}

function makeDetail(overrides: Record<string, unknown> = {}) {
  const base = {
    id: 'e1',
    hostUserId: 'h1',
    name: 'Rolê',
    description: 'descrição',
    coverUrl: 'https://example.com/c.jpg',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    durationMinutes: 180,
    endsAt: new Date(Date.now() + 86_400_000 + 3 * 3_600_000).toISOString(),
    type: 'presencial' as const,
    visibility: 'public' as const,
    capacity: 10,
    status: 'scheduled' as const,
    cancellationReason: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confirmedCount: 3,
    waitlistCount: 0,
  }
  return { ...base, ...overrides }
}

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setUser({ id: 'me', email: 'me@x.com', displayName: 'Me' } as never)
})

describe('EventDetailView', () => {
  it('renders event detail and participants when loaded', async () => {
    server.use(
      http.get('*/events/:id', () =>
        HttpResponse.json({
          event: makeDetail({ id: 'e1' }),
          participants: [
            {
              id: 'p1',
              userId: 'u1',
              userName: 'Alice',
              userAvatarUrl: null,
              status: 'confirmed',
              waitlistPosition: null,
              joinedAt: new Date().toISOString(),
              confirmedAt: new Date().toISOString(),
            },
          ],
          iAmIn: null,
          hostInfo: { id: 'h1', name: 'Host', avatarUrl: null },
          address: {
            cep: '01310-100',
            logradouro: 'Av. Paulista',
            numero: '1000',
            complemento: null,
            bairro: 'Bela Vista',
            cidade: 'São Paulo',
            estado: 'SP',
          },
        }),
      ),
    )
    const router = setupRouter()
    router.push('/roles/e1')
    await router.isReady()
    const wrapper = mount(EventDetailView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Rolê')
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Av. Paulista')
  })

  it('triggers subscribe call when CTA clicked', async () => {
    let subscribed = false
    server.use(
      http.get('*/events/:id', () =>
        HttpResponse.json({
          event: makeDetail({ id: 'e1' }),
          participants: [],
          iAmIn: null,
          hostInfo: { id: 'h1', name: 'Host', avatarUrl: null },
        }),
      ),
      http.post('*/events/:id/participants', () => {
        subscribed = true
        return HttpResponse.json({ status: 'subscribed' }, { status: 201 })
      }),
    )
    const router = setupRouter()
    router.push('/roles/e1')
    await router.isReady()
    const wrapper = mount(EventDetailView, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('[data-testid="primary-action"]').trigger('click')
    await flushPromises()
    expect(subscribed).toBe(true)
  })

  it('confirms participation when subscribed and within 48h', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const endsAt = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString()
    let confirmed = false
    server.use(
      http.get('*/events/:id', () =>
        HttpResponse.json({
          event: makeDetail({ id: 'e1', startsAt, endsAt }),
          participants: [],
          iAmIn: { status: 'subscribed', waitlistPosition: null },
          hostInfo: { id: 'h1', name: 'Host', avatarUrl: null },
        }),
      ),
      http.post('*/events/:id/participants/me/confirm', () => {
        confirmed = true
        return HttpResponse.json({ status: 'confirmed' })
      }),
    )
    const router = setupRouter()
    router.push('/roles/e1')
    await router.isReady()
    const wrapper = mount(EventDetailView, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('[data-testid="primary-action"]').trigger('click')
    await flushPromises()
    expect(confirmed).toBe(true)
  })

  it('leaves the event when CTA is "Sair"', async () => {
    let left = false
    server.use(
      http.get('*/events/:id', () =>
        HttpResponse.json({
          event: makeDetail({ id: 'e1' }),
          participants: [],
          iAmIn: { status: 'confirmed', waitlistPosition: null },
          hostInfo: { id: 'h1', name: 'Host', avatarUrl: null },
        }),
      ),
      http.delete('*/events/:id/participants/me', () => {
        left = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = setupRouter()
    router.push('/roles/e1')
    await router.isReady()
    const wrapper = mount(EventDetailView, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('[data-testid="primary-action"]').trigger('click')
    await flushPromises()
    expect(left).toBe(true)
  })
})
