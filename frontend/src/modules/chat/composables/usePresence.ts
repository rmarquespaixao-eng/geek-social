// src/modules/chat/composables/usePresence.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getSocket } from '@/shared/socket/socket'
import type { SocketPresenceUpdate } from '../types'

export const usePresence = defineStore('presence', () => {
  const onlineMap = ref<Map<string, boolean>>(new Map())
  const registered = ref(false)

  function handlePresenceUpdate({ userId, isOnline }: SocketPresenceUpdate): void {
    onlineMap.value = new Map(onlineMap.value).set(userId, isOnline)
  }

  function handlePresenceBulk(updates: SocketPresenceUpdate[]): void {
    const next = new Map(onlineMap.value)
    for (const { userId, isOnline } of updates) next.set(userId, isOnline)
    onlineMap.value = next
  }

  function init(): void {
    if (registered.value) return
    const sock = getSocket()
    if (!sock) return
    registered.value = true
    sock.on('presence:update', handlePresenceUpdate)
    sock.on('presence:bulk', handlePresenceBulk)
    sock.emit('presence:request')
  }

  function isOnline(userId: string): boolean {
    return onlineMap.value.get(userId) ?? false
  }

  function cleanup(): void {
    // no-op: presence listeners persist across views
  }

  return { onlineMap, init, isOnline, cleanup }
})
