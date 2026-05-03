import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/shared/http/api'

export const useFeatureFlagsStore = defineStore('featureFlags', () => {
  const flags = ref<Record<string, boolean>>({})
  const loaded = ref(false)

  async function load() {
    try {
      const { data } = await api.get<Record<string, boolean>>('/feature-flags')
      flags.value = data
    } catch {
      // Em caso de falha, mantém defaults (flags off)
    } finally {
      loaded.value = true
    }
  }

  function isEnabled(key: string): boolean {
    if (!loaded.value) return true
    return flags.value[key] ?? false
  }

  return { flags, loaded, load, isEnabled }
})
