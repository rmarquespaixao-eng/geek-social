import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import EventsDiscoverView from '../../views/EventsDiscoverView.vue'
import EventDetailView from '../../views/EventDetailView.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { server } from '../../../../../tests/mocks/server'

const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const endsAt = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString()

const baseEvent = {
  id: 'evt-1',
  hostUserId: 'h1',
  hostName: 'Host',
  name: 'Rolê e2e',
  description: 'desc',
  coverUrl: 'https://example.com/c.jpg',
  startsAt,
  durationMinutes: 180,
  endsAt,
  type: 'presencial' as const,
  visibility: 'public' as const,
  capacity: 10,
  status: 'scheduled' as const,
  cancellationReason: null,
  cancelledAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  confirmedCount: 0,
  waitlistCount: 0,
  cidade: 'São Paulo',
}

function setupRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/roles', component: EventsDiscoverView },
      { path: '/roles/:id', component: EventDetailView },
      { path: '/roles/:id/editar', component: { template: '<div/>' } },
      { path: '/profile/:userId', component: { template: '<div/>' } },
      { path: '/roles/novo', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setUser({ id: 'me', email: 'me@x.com', displayName: 'Me' } as never)
})

describe('events end-to-end flow (mocked)', () => {
  it('list -> detail -> subscribe -> confirm -> see participants', async () => {
    let iAmIn: { status: 'subscribed' | 'confirmed'; waitlistPosition: number | null } | null = null
    let participants: unknown[] = []

    server.use(
      http.get('*/events', () =>
        HttpResponse.json({ events: [{ ...baseEvent, iAmIn }], nextCursor: null }),
      ),
      http.get('*/events/:id', () =>
        HttpResponse.json({
          event: { ...baseEvent, iAmIn },
          participants,
          iAmIn,
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
      http.post('*/events/:id/participants', () => {
        iAmIn = { status: 'subscribed', waitlistPosition: null }
        participants = [
          {
            id: 'p1',
            userId: 'me',
            userName: 'Me',
            userAvatarUrl: null,
            status: 'subscribed',
            waitlistPosition: null,
            joinedAt: new Date().toISOString(),
            confirmedAt: null,
          },
        ]
        return HttpResponse.json({ status: 'subscribed' }, { status: 201 })
      }),
      http.post('*/events/:id/participants/me/confirm', () => {
        iAmIn = { status: 'confirmed', waitlistPosition: null }
        participants = [
          {
            id: 'p1',
            userId: 'me',
            userName: 'Me',
            userAvatarUrl: null,
            status: 'confirmed',
            waitlistPosition: null,
            joinedAt: new Date().toISOString(),
            confirmedAt: new Date().toISOString(),
          },
        ]
        return HttpResponse.json({ status: 'confirmed' })
      }),
    )

    const router = setupRouter()
    router.push('/roles')
    await router.isReady()
    const wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Rolê e2e')

    // Navigate to detail
    await router.push('/roles/evt-1')
    await flushPromises()

    // Subscribe
    await wrapper.get('[data-testid="primary-action"]').trigger('click')
    await flushPromises()

    // Re-render — now iAmIn=subscribed, within 48h, so primary becomes "Confirmar presença"
    expect(wrapper.get('[data-testid="primary-action"]').text()).toBe('Confirmar presença')

    await wrapper.get('[data-testid="primary-action"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Me')
  })
})
