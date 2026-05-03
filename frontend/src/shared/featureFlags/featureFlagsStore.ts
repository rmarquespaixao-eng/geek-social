import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/shared/http/api'

const POLL_INTERVAL_MS = 60_000

export const useFeatureFlagsStore = defineStore('featureFlags', () => {
  const flags = ref<Record<string, boolean>>({})
  const loaded = ref(false)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  async function load() {
    try {
      const { data } = await api.get<Record<string, boolean>>('/feature-flags')
      flags.value = data
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
    if (!loaded.value) return true
    return flags.value[key] ?? false
  }

  return { flags, loaded, load, startPolling, stopPolling, isEnabled }
})
