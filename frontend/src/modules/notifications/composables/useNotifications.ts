import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as notificationsService from '../services/notificationsService'
import type { Notification } from '../services/notificationsService'
import { getSocket } from '@/shared/socket/socket'
import { useEventsStore } from '@/modules/events/stores/eventsStore'
import type { EventNotificationType } from '@/modules/events/types'

const EVENT_NOTIFICATION_TYPES: EventNotificationType[] = [
  'event_reminder_48h',
  'event_reminder_2h',
  'event_cancelled',
  'event_updated',
  'event_conflict_after_edit',
  'event_promoted_from_waitlist',
  'event_invited',
]

function isEventNotification(type: string): type is EventNotificationType {
  return (EVENT_NOTIFICATION_TYPES as string[]).includes(type)
}

export const useNotifications = defineStore('notifications', () => {
  const items = ref<Notification[]>([])
  const loading = ref(false)

  const unreadCount = computed(() => items.value.filter(n => !n.read).length)

  async function fetchAll(): Promise<void> {
    loading.value = true
    try {
      items.value = await notificationsService.listNotifications()
    } finally {
      loading.value = false
    }
  }

  async function markAllRead(): Promise<void> {
    await notificationsService.markAllRead()
    items.value = items.value.map(n => ({ ...n, read: true }))
  }

  async function markRead(id: string): Promise<void> {
    await notificationsService.markRead(id)
    const n = items.value.find(x => x.id === id)
    if (n) n.read = true
  }

  async function deleteAll(): Promise<void> {
    await notificationsService.deleteAll()
    items.value = []
  }

  async function deleteOne(id: string): Promise<void> {
    await notificationsService.deleteOne(id)
    items.value = items.value.filter(n => n.id !== id)
  }

  function handleNewNotification(notification: Notification): void {
    items.value.unshift(notification)
    // Fan out event-* notifications to the events store so cached state stays fresh.
    if (isEventNotification(notification.type)) {
      try {
        const events = useEventsStore()
        events.applyNotification({
          type: notification.type,
          entityId: notification.entityId,
        })
      } catch {
        // events store not available (e.g., during early init); ignore.
      }
    }
  }

  function init(): void {
    const sock = getSocket()
    if (!sock) return
    sock.on('notification:new', handleNewNotification)
  }

  function cleanup(): void {
    const sock = getSocket()
    if (!sock) return
    sock.off('notification:new', handleNewNotification)
  }

  return {
    items,
    loading,
    unreadCount,
    fetchAll,
    markAllRead,
    markRead,
    deleteAll,
    deleteOne,
    init,
    cleanup,
  }
})
