// src/modules/events/composables/useEventActions.ts
import { ref } from 'vue'
import { useEventsStore } from '../stores/eventsStore'
import type { SubscribeResponse } from '../types'

export function useEventActions() {
  const store = useEventsStore()
  const acting = ref(false)
  const error = ref<Error | null>(null)

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    if (acting.value) return null
    acting.value = true
    error.value = null
    try {
      return await fn()
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
      return null
    } finally {
      acting.value = false
    }
  }

  return {
    acting,
    error,
    subscribe: (id: string): Promise<SubscribeResponse | null> => run(() => store.subscribe(id)),
    leave: (id: string): Promise<void | null> => run(() => store.leave(id)),
    confirm: (id: string): Promise<void | null> => run(() => store.confirm(id)),
    cancelEvent: (id: string, reason?: string): Promise<void | null> =>
      run(() => store.cancelEvent(id, reason)),
    deleteEvent: (id: string): Promise<void | null> => run(() => store.deleteEvent(id)),
  }
}
