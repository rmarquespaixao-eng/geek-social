// src/modules/events/composables/useEventDetail.ts
import { computed, ref, watch } from 'vue'
import { useEventsStore } from '../stores/eventsStore'

export function useEventDetail(eventIdRef: () => string) {
  const store = useEventsStore()
  const loading = ref(false)
  const error = ref<Error | null>(null)

  const event = computed(() => store.getCached(eventIdRef()) ?? null)

  async function load(force = false) {
    const id = eventIdRef()
    if (!id) return
    loading.value = true
    error.value = null
    try {
      await store.fetchEvent(id, force)
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      loading.value = false
    }
  }

  watch(
    () => eventIdRef(),
    () => {
      void load(false)
    },
    { immediate: true },
  )

  return {
    event,
    loading,
    error,
    reload: () => load(true),
  }
}
