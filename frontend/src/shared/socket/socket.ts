// src/shared/socket/socket.ts
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function connectSocket(token: string): Socket {
  if (socket?.connected) return socket
  const socketUrl = (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? window.location.origin
  socket = io(socketUrl, {
    auth: { token },
    autoConnect: false,
    transports: ['websocket'],
  })
  socket.connect()

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function getSocket(): Socket | null {
  return socket
}
