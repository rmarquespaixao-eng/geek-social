import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { http, HttpResponse } from 'msw'
import EventCreateView from '../../views/EventCreateView.vue'
import { useAuthStore } from '@/shared/auth/authStore'
import { server } from '../../../../../tests/mocks/server'

function setupRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/roles', component: { template: '<div/>' } },
      { path: '/roles/novo', component: EventCreateView },
      { path: '/roles/:id', component: { template: '<div>detail</div>' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.setUser({ id: 'me', email: 'me@x.com', displayName: 'Me' } as never)
})

describe('EventCreateView', () => {
  it('blocks submission with validation error when fields are missing', async () => {
    const router = setupRouter()
    router.push('/roles/novo')
    await router.isReady()
    const wrapper = mount(EventCreateView, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('[data-testid="event-form"]').trigger('submit')
    expect(wrapper.find('[data-testid="event-form-error"]').exists()).toBe(true)
  })

  it('submits a complete presencial event with cover upload via FormData', async () => {
    let receivedFormData: FormData | null = null
    server.use(
      http.post('*/events', async ({ request }) => {
        receivedFormData = await request.formData()
        return HttpResponse.json(
          { event: { id: 'new-id' } },
          { status: 201 },
        )
      }),
    )
    const router = setupRouter()
    router.push('/roles/novo')
    await router.isReady()
    const wrapper = mount(EventCreateView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('[data-testid="event-name"]').setValue('Meu Rolê')
    await wrapper.get('[data-testid="event-starts-at"]').setValue('2026-05-15T19:00')
    await wrapper.get('[data-testid="address-cep"]').setValue('01310-100')
    await wrapper.get('[data-testid="address-logradouro"]').setValue('Av. Paulista')
    await wrapper.get('[data-testid="address-numero"]').setValue('1000')
    await wrapper.get('[data-testid="address-bairro"]').setValue('Bela Vista')
    await wrapper.get('[data-testid="address-cidade"]').setValue('São Paulo')
    await wrapper.get('[data-testid="address-estado"]').setValue('SP')

    // Inject a fake file via the input
    const file = new File(['x'], 'cover.png', { type: 'image/png' })
    const input = wrapper.get('[data-testid="event-cover-input"]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    await wrapper.get('[data-testid="event-cover-input"]').trigger('change')

    await wrapper.get('[data-testid="event-form"]').trigger('submit')
    await flushPromises()

    expect(receivedFormData).not.toBeNull()
    const fd = receivedFormData!
    expect(fd.get('name')).toBe('Meu Rolê')
    expect(fd.get('type')).toBe('presencial')
    expect(fd.get('cover')).toBeInstanceOf(File)
    const address = JSON.parse(String(fd.get('address')))
    expect(address.cidade).toBe('São Paulo')
  })

  it('shows online fields and submits onlineDetails when type=online', async () => {
    let received: FormData | null = null
    server.use(
      http.post('*/events', async ({ request }) => {
        received = await request.formData()
        return HttpResponse.json({ event: { id: 'new-id' } }, { status: 201 })
      }),
    )
    const router = setupRouter()
    router.push('/roles/novo')
    await router.isReady()
    const wrapper = mount(EventCreateView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.get('[data-testid="event-type"]').setValue('online')
    await wrapper.get('[data-testid="event-name"]').setValue('Online Rolê')
    await wrapper.get('[data-testid="event-starts-at"]').setValue('2026-05-15T19:00')
    await wrapper.get('[data-testid="event-meeting-url"]').setValue('https://meet.example.com/abc')

    const file = new File(['x'], 'c.png', { type: 'image/png' })
    const input = wrapper.get('[data-testid="event-cover-input"]').element as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    await wrapper.get('[data-testid="event-cover-input"]').trigger('change')

    await wrapper.get('[data-testid="event-form"]').trigger('submit')
    await flushPromises()

    expect(received).not.toBeNull()
    const details = JSON.parse(String(received!.get('onlineDetails')))
    expect(details.meetingUrl).toBe('https://meet.example.com/abc')
  })
})
