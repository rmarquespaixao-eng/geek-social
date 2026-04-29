import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AddressFields from '../../components/AddressFields.vue'
import type { EventAddress } from '../../types'

function makeFetchMock(payload: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  } as unknown as Response)
}

const empty: EventAddress = {
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
}

describe('AddressFields', () => {
  it('autocompletes fields after debounce when CEP is valid', async () => {
    vi.useFakeTimers()
    const fetchMock = makeFetchMock({
      cep: '01310-100',
      logradouro: 'Av. Paulista',
      bairro: 'Bela Vista',
      localidade: 'São Paulo',
      uf: 'SP',
    })
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(AddressFields, { props: { modelValue: { ...empty } } })
    const cepInput = wrapper.get('[data-testid="address-cep"]')
    await cepInput.setValue('01310100')

    // Debounce window has not elapsed
    expect(fetchMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(400)
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('01310100')

    const emitted = wrapper.emitted('update:modelValue') ?? []
    const lastEmit = emitted[emitted.length - 1]?.[0] as EventAddress | undefined
    expect(lastEmit?.logradouro).toBe('Av. Paulista')
    expect(lastEmit?.cidade).toBe('São Paulo')
    expect(lastEmit?.estado).toBe('SP')

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not call ViaCEP for invalid CEPs', async () => {
    vi.useFakeTimers()
    const fetchMock = makeFetchMock({})
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(AddressFields, { props: { modelValue: { ...empty } } })
    await wrapper.get('[data-testid="address-cep"]').setValue('123')
    await vi.advanceTimersByTimeAsync(500)

    expect(fetchMock).not.toHaveBeenCalled()

    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
})
