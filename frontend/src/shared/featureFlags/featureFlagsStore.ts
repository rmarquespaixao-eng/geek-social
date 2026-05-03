import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/shared/http/api'
import { useAuthStore } from '@/shared/auth/authStore'

const POLL_INTERVAL_MS = 60_000
const CACHE_KEY = 'geek:ff'

function readCache(): Record<string, boolean> | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') } catch { return null }
}

export const useFeatureFlagsStore = defineStore('featureFlags', () => {
  const cached = readCache()
  const flags = ref<Record<string, boolean>>(cached ?? {})
  const loaded = ref(cached !== null)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function load() {
    try {
      const authStore = useAuthStore()
      const endpoint = authStore.token ? '/feature-flags/me' : '/feature-flags'
      const { data } = await api.get<Record<string, boolean>>(endpoint)
      flags.value = data
      localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    } catch {
      // Em caso de falha mantém estado anterior
    } finally {
      loaded.value = true
    }
  }

  function startPolling() {
    if (pollTimer !== null) return
    pollTimer = setInterval(() => void load(), POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function isEnabled(key: string): boolean {
    if (!loaded.value) return false
    return flags.value[key] ?? false
  }

  return { flags, loaded, load, startPolling, stopPolling, isEnabled }
})
