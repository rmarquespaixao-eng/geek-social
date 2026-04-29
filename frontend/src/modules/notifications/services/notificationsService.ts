import { api } from '@/shared/http/api'

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'post_comment'
  | 'post_reaction'
  | 'steam_import_done'
  | 'steam_import_partial'
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'offer_completed'
  | 'offer_cancelled'
  | 'offer_expired'
  | 'dm_request_received'

export type Notification = {
  id: string
  recipientId: string
  actorId: string
  actorName: string
  actorAvatar: string | null
  type: NotificationType
  entityId: string | null
  read: boolean
  createdAt: string
}

export async function listNotifications(): Promise<Notification[]> {
  const { data } = await api.get<{ notifications: Notification[] }>('/notifications')
  return data.notifications
}

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count')
  return data.count
}

export async function markAllRead(): Promise<void> {
  await api.post('/notifications/read-all')
}

export async function markRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`)
}

export async function deleteAll(): Promise<void> {
  await api.delete('/notifications')
}

export async function deleteOne(id: string): Promise<void> {
  await api.delete(`/notifications/${id}`)
}
