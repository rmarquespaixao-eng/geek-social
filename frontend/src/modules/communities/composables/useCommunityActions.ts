// src/modules/communities/composables/useCommunityActions.ts
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCommunitiesStore } from '../stores/communitiesStore'
import type { CreateCommunityPayload, UpdateCommunityPayload } from '../types'

export function useCommunityActions() {
  const store = useCommunitiesStore()
  const router = useRouter()
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

  async function create(payload: CreateCommunityPayload, cover: File, icon: File) {
    const summary = await run(() => store.create(payload, cover, icon))
    if (summary) {
      router.replace(`/comunidades/${summary.slug}`)
    }
    return summary
  }

  async function update(id: string, payload: UpdateCommunityPayload, cover?: File | null, icon?: File | null) {
    return run(() => store.update(id, payload, cover, icon))
  }

  async function softDelete(id: string) {
    const result = await run(() => store.softDelete(id))
    if (result !== null) {
      router.replace('/minhas-comunidades')
    }
    return result
  }

  function join(id: string) {
    return run(() => store.join(id))
  }

  function leave(id: string) {
    return run(() => store.leave(id))
  }

  return {
    acting,
    error,
    create,
    update,
    softDelete,
    join,
    leave,
  }
}
