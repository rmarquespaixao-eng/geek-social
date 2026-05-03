import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getActiveSignalSession,
  onIdentityChange,
  type PendingIdentityChange,
} from '@/shared/crypto/signal/SignalClient'

export const useIdentityWarnings = defineStore('identityWarnings', () => {
  const pending = ref<Map<string, PendingIdentityChange>>(new Map())
  let _disposeListener: (() => void) | null = null

  const hasAny = computed(() => pending.value.size > 0)

  async function refresh(): Promise<void> {
    const session = getActiveSignalSession()
    if (!session) {
      pending.value = new Map()
      return
    }
    const list = await session.listPendingIdentityChanges()
    const next = new Map<string, PendingIdentityChange>()
    for (const c of list) next.set(c.contactUuid, c)
    pending.value = next
  }

  function startListening(): void {
    if (_disposeListener) return
    _disposeListener = onIdentityChange((change: PendingIdentityChange) => {
      const next = new Map(pending.value)
      next.set(change.contactUuid, change)
      pending.value = next
    })
  }

  function stopListening(): void {
    _disposeListener?.()
    _disposeListener = null
    pending.value = new Map()
  }

  function getForPeer(contactUuid: string): PendingIdentityChange | null {
    return pending.value.get(contactUuid) ?? null
  }

  async function acknowledge(contactUuid: string): Promise<void> {
    const session = getActiveSignalSession()
    if (!session) return
    try {
      await session.acknowledgeIdentityChange(contactUuid)
    } finally {
      const next = new Map(pending.value)
      next.delete(contactUuid)
      pending.value = next
    }
  }

  return {
    pending,
    hasAny,
    refresh,
    startListening,
    stopListening,
    getForPeer,
    acknowledge,
  }
})
