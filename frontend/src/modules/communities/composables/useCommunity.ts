// src/modules/communities/composables/useCommunity.ts
import { computed, ref, watch } from 'vue'
import { useCommunitiesStore } from '../stores/communitiesStore'

export function useCommunity(idOrSlugRef: () => string) {
  const store = useCommunitiesStore()
  const loading = ref(false)
  const error = ref<Error | null>(null)

  const detail = computed(() => store.getCached(idOrSlugRef()) ?? null)
  const community = computed(() => detail.value?.community ?? null)
  const viewerMembership = computed(() => detail.value?.viewerMembership ?? null)
  const moderators = computed(() => detail.value?.moderators ?? [])

  async function load(force = false) {
    const idOrSlug = idOrSlugRef()
    if (!idOrSlug) return
    loading.value = true
    error.value = null
    try {
      await store.fetchDetail(idOrSlug, force)
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err))
    } finally {
      loading.value = false
    }
  }

  watch(
    () => idOrSlugRef(),
    () => {
      void load(false)
    },
    { immediate: true },
  )

  return {
    detail,
    community,
    viewerMembership,
    moderators,
    loading,
    error,
    reload: () => load(true),
  }
}
