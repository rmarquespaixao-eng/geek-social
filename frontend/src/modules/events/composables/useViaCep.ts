// src/modules/events/composables/useViaCep.ts
import { ref } from 'vue'
import type { ViaCepResponse } from '../types'

const VIACEP_URL = 'https://viacep.com.br/ws'
const DEBOUNCE_MS = 350

export interface UseViaCepOptions {
  debounceMs?: number
  fetchImpl?: typeof fetch
}

export function useViaCep(options: UseViaCepOptions = {}) {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)

  const loading = ref(false)
  const error = ref<string | null>(null)
  const result = ref<ViaCepResponse | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let lastRequestId = 0

  function normalize(cep: string): string {
    return cep.replace(/\D/g, '')
  }

  async function doLookup(cep: string): Promise<ViaCepResponse | null> {
    const requestId = ++lastRequestId
    loading.value = true
    error.value = null
    result.value = null
    try {
      const res = await fetchImpl(`${VIACEP_URL}/${cep}/json/`)
      if (!res.ok) throw new Error(`ViaCEP HTTP ${res.status}`)
      const data = (await res.json()) as ViaCepResponse
      // Newer requests may have superseded this one
      if (requestId !== lastRequestId) return null
      if (data.erro) {
        error.value = 'CEP não encontrado'
        return null
      }
      result.value = data
      return data
    } catch (err) {
      if (requestId === lastRequestId) {
        error.value = err instanceof Error ? err.message : 'Erro ao consultar CEP'
      }
      return null
    } finally {
      if (requestId === lastRequestId) {
        loading.value = false
      }
    }
  }

  function lookup(cep: string): Promise<ViaCepResponse | null> {
    if (timer) clearTimeout(timer)
    const clean = normalize(cep)
    if (clean.length !== 8) {
      error.value = null
      result.value = null
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      timer = setTimeout(() => {
        void doLookup(clean).then(resolve)
      }, debounceMs)
    })
  }

  function reset() {
    if (timer) clearTimeout(timer)
    loading.value = false
    error.value = null
    result.value = null
  }

  return { loading, error, result, lookup, reset }
}
