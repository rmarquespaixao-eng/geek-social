/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> }

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => /^https?:\/\/[^/]+\/api\//.test(url.href),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 })],
  }),
)

interface PushPayloadData {
  conversationId: string
  messageId: string
}

interface PushPayload {
  title: string
  body: string
  data: PushPayloadData
}

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload: PushPayload
  try {
    payload = event.data.json() as PushPayload
  } catch {
    return
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: payload.data,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      // Collapses repeat pushes for the same conversation into one notification.
      tag: payload.data?.conversationId ? `conv:${payload.data.conversationId}` : undefined,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data as Partial<PushPayloadData> | undefined
  const targetPath = data?.conversationId ? `/chat/${data.conversationId}` : '/chat'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of allClients) {
        const url = new URL(client.url)
        if (url.origin === self.location.origin) {
          await client.focus()
          // Some browsers (Safari) reject navigate on cross-origin or redirected
          // clients; swallow so focus alone still works.
          try {
            await client.navigate(url.origin + targetPath)
          } catch {
            /* noop */
          }
          return
        }
      }
      await self.clients.openWindow(targetPath)
    })(),
  )
})
