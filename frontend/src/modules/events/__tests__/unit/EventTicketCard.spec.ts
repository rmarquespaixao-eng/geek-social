import { describe, it, expect, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import EventTicketCard from '../../components/EventTicketCard.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import type { EventSummary, ParticipantStatus } from '../../types'

const HOST_ID = 'host-1'
const ME_ID = 'me-1'

function makeEvent(overrides: Partial<EventSummary> = {}): EventSummary {
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString()
  return {
    id: 'evt-1',
    hostUserId: HOST_ID,
    name: 'Rolê de Teste',
    description: null,
    coverUrl: 'https://example.com/cover.jpg',
    startsAt,
    durationMinutes: 180,
    endsAt,
    type: 'presencial',
    visibility: 'public',
    capacity: 10,
    status: 'scheduled',
    cancellationReason: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confirmedCount: 5,
    waitlistCount: 0,
    iAmIn: null,
    ...overrides,
  }
}

let router: Router

async function mountCard(event: EventSummary): Promise<VueWrapper> {
  const wrapper = mount(EventTicketCard, {
    props: { event },
    global: { plugins: [router] },
  })
  await router.isReady()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setUser({ id: ME_ID, name: 'Me', email: 'me@example.com' } as never)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/roles/:id', component: { template: '<div/>' } },
      { path: '/roles/:id/editar', component: { template: '<div/>' } },
    ],
  })
})

describe('EventTicketCard primary action matrix', () => {
  it('shows "Inscrever-se" when not subscribed and there are spots', async () => {
    const wrapper = await mountCard(makeEvent({ confirmedCount: 5, capacity: 10 }))
    expect(wrapper.get('[data-testid="primary-action"]').text()).toBe('Inscrever-se')
  })

  it('shows waitlist CTA when not subscribed and event is full', async () => {
    const wrapper = await mountCard(
      makeEvent({ confirmedCount: 10, capacity: 10, waitlistCount: 3 }),
    )
    expect(wrapper.get('[data-testid="primary-action"]').text()).toContain('lista de espera')
    expect(wrapper.get('[data-testid="primary-action"]').text()).toContain('3')
  })

  it('shows "Confirmar presença" when subscribed and event is within 48h', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const endsAt = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString()
    const status: ParticipantStatus = 'subscribed'
    const wrapper = await mountCard(
      makeEvent({
        startsAt,
        endsAt,
        iAmIn: { status, waitlistPosition: null },
      }),
    )
    expect(wrapper.get('[data-testid="primary-action"]').text()).toBe('Confirmar presença')
  })

  it('shows "Sair" when confirmed', async () => {
    const wrapper = await mountCard(
      makeEvent({ iAmIn: { status: 'confirmed', waitlistPosition: null } }),
    )
    expect(wrapper.get('[data-testid="primary-action"]').text()).toBe('Sair')
  })

  it('shows "Sair da fila" when on waitlist with position', async () => {
    const wrapper = await mountCard(
      makeEvent({ iAmIn: { status: 'waitlist', waitlistPosition: 2 } }),
    )
    expect(wrapper.get('[data-testid="primary-action"]').text()).toContain('posição 2')
  })

  it('disables CTA and shows "Encerrado" when status=ended', async () => {
    const wrapper = await mountCard(makeEvent({ status: 'ended' }))
    const btn = wrapper.get('[data-testid="primary-action"]')
    expect(btn.text()).toBe('Encerrado')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables CTA and shows "Cancelado" when status=cancelled', async () => {
    const wrapper = await mountCard(makeEvent({ status: 'cancelled' }))
    const btn = wrapper.get('[data-testid="primary-action"]')
    expect(btn.text()).toBe('Cancelado')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows "Editar" and exposes "Cancelar Rolê" when current user is host', async () => {
    const wrapper = await mountCard(makeEvent({ hostUserId: ME_ID }))
    expect(wrapper.get('[data-testid="primary-action"]').text()).toBe('Editar')
    expect(wrapper.find('[data-testid="cancel-event"]').exists()).toBe(true)
  })

  it('emits subscribe when CTA clicked while not registered', async () => {
    const wrapper = await mountCard(makeEvent())
    await wrapper.get('[data-testid="primary-action"]').trigger('click')
    expect(wrapper.emitted('subscribe')?.[0]).toEqual(['evt-1'])
  })
})
