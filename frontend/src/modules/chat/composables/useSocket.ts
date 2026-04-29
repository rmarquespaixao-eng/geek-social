// src/modules/chat/composables/useSocket.ts
import { onMounted, onUnmounted } from 'vue'
import { getSocket } from '@/shared/socket/socket'
import type { Socket } from 'socket.io-client'

type EventHandler = (...args: unknown[]) => void

export function useSocket() {
  const handlers: Array<{ event: string; fn: EventHandler }> = []

  function on(event: string, fn: EventHandler) {
    const socket: Socket | null = getSocket()
    if (!socket) return
    socket.on(event, fn)
    handlers.push({ event, fn })
  }

  function off(event: string, fn: EventHandler) {
    const socket: Socket | null = getSocket()
    if (!socket) return
    socket.off(event, fn)
  }

  function emit(event: string, ...args: unknown[]) {
    const socket: Socket | null = getSocket()
    if (!socket) return
    socket.emit(event, ...args)
  }

  function cleanup() {
    const socket: Socket | null = getSocket()
    if (!socket) return
    for (const { event, fn } of handlers) {
      socket.off(event, fn)
    }
    handlers.length = 0
  }

  function getSocketInstance(): Socket | null {
    return getSocket()
  }

  onUnmounted(cleanup)

  return { on, off, emit, cleanup, getSocketInstance }
}
