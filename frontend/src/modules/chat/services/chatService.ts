// src/modules/chat/services/chatService.ts
import { api } from '@/shared/http/api'
import type {
  Conversation,
  Message,
  MessageAttachment,
  CallMetadata,
  PaginatedMessages,
  SendMessagePayload,
  CreateGroupPayload,
  DmRequest,
} from '../types'

export async function listConversations(archived = false): Promise<Conversation[]> {
  const { data } = await api.get<Conversation[]>('/chat/conversations', { params: archived ? { archived: 'true' } : {} })
  return data
}

export async function archiveConversation(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/archive`)
}

export async function unarchiveConversation(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/unarchive`)
}

export async function muteConversation(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/mute`)
}

export async function unmuteConversation(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/unmute`)
}

export async function setTemporaryMode(conversationId: string, enabled: boolean): Promise<void> {
  await api.patch(`/chat/conversations/${conversationId}/temporary`, { enabled })
}

export async function hideConversation(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/hide`)
}

export async function getConversation(conversationId: string): Promise<Conversation> {
  const { data } = await api.get<Conversation>(`/chat/conversations/${conversationId}`)
  return data
}

export async function getOrCreateDm(friendId: string): Promise<Conversation> {
  const { data } = await api.post<Conversation>('/chat/dm', { friendId })
  return data
}

export const openDm = getOrCreateDm

export async function createGroup(payload: CreateGroupPayload): Promise<Conversation> {
  const { data } = await api.post<Conversation>('/chat/groups', payload)
  return data
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await api.delete(`/chat/conversations/${conversationId}`)
}

export async function listMessages(
  conversationId: string,
  cursor?: string,
  limit = 30,
): Promise<PaginatedMessages> {
  const params: Record<string, string | number> = { limit }
  if (cursor) params.cursor = cursor
  const { data } = await api.get<PaginatedMessages>(`/chat/conversations/${conversationId}/messages`, { params })
  return data
}

export const getMessages = listMessages

export async function sendMessage(
  conversationId: string,
  payload: SendMessagePayload,
): Promise<Message> {
  const { data } = await api.post<Message>(`/chat/conversations/${conversationId}/messages`, payload)
  return data
}

export async function sendCallMessage(
  conversationId: string,
  callMetadata: CallMetadata,
): Promise<Message> {
  const { data } = await api.post<Message>(
    `/chat/conversations/${conversationId}/messages`,
    { callMetadata },
  )
  return data
}

export async function editMessage(
  conversationId: string,
  messageId: string,
  content: string,
): Promise<Message> {
  const { data } = await api.patch<Message>(
    `/chat/conversations/${conversationId}/messages/${messageId}`,
    { content },
  )
  return data
}

export async function deleteMessage(
  _conversationId: string,
  messageId: string,
): Promise<void> {
  await api.delete(`/chat/messages/${messageId}`)
}

export async function forwardMessage(
  messageId: string,
  conversationIds: string[],
): Promise<{ messages: Message[]; forwardedCount: number }> {
  const { data } = await api.post<{ messages: Message[]; forwardedCount: number }>(
    `/chat/messages/${messageId}/forward`,
    { conversationIds },
  )
  return data
}

export async function toggleMessageReaction(
  messageId: string,
  emoji: string,
  add: boolean,
): Promise<{ reactions: { emoji: string; count: number; userIds: string[] }[] }> {
  const { data } = await api.post(`/chat/messages/${messageId}/reactions`, { emoji, add })
  return data
}

export async function uploadAttachment(
  conversationId: string,
  file: Blob,
  filename?: string,
  audioMeta?: { durationMs: number; waveformPeaks: number[] },
): Promise<MessageAttachment> {
  const formData = new FormData()
  formData.append('file', file, filename ?? (file as File).name ?? 'upload.bin')
  if (audioMeta) {
    formData.append('durationMs', String(audioMeta.durationMs))
    formData.append('waveformPeaks', JSON.stringify(audioMeta.waveformPeaks))
  }
  const { data } = await api.post<any>(
    `/chat/conversations/${conversationId}/attachments`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  const mimeType: string = data.mimeType ?? ''
  const type: 'image' | 'audio' | 'video' | 'file' =
    mimeType.startsWith('image/') ? 'image'
    : mimeType.startsWith('audio/') ? 'audio'
    : mimeType.startsWith('video/') ? 'video'
    : 'file'
  return {
    id: data.id,
    url: data.url,
    type,
    name: data.filename ?? data.name ?? '',
    size: data.sizeBytes ?? data.size ?? 0,
    mimeType,
    durationMs: data.durationMs ?? undefined,
    waveformPeaks: data.waveformPeaks ?? undefined,
    thumbnailUrl: data.thumbnailUrl ?? null,
  }
}

export async function markAsRead(conversationId: string): Promise<void> {
  await api.post(`/chat/conversations/${conversationId}/read`)
}

export async function acceptDmRequest(requestId: string): Promise<DmRequest> {
  const { data } = await api.post<DmRequest>(`/chat/dm-requests/${requestId}/accept`)
  return data
}

export async function rejectDmRequest(requestId: string): Promise<DmRequest> {
  const { data } = await api.post<DmRequest>(`/chat/dm-requests/${requestId}/reject`)
  return data
}

export async function sendDmRequest(receiverId: string): Promise<DmRequest> {
  const { data } = await api.post<DmRequest>('/chat/dm-requests', { receiverId })
  return data
}

export async function listDmRequests(): Promise<DmRequest[]> {
  const { data } = await api.get<DmRequest[]>('/chat/dm-requests')
  return data
}

// ── Group management ─────────────────────────────────────────────────────────

export async function getGroup(groupId: string): Promise<Conversation> {
  const { data } = await api.get<Conversation>(`/chat/groups/${groupId}`)
  return data
}

export async function updateGroup(
  groupId: string,
  payload: { name?: string; description?: string },
): Promise<Conversation> {
  const { data } = await api.patch<Conversation>(`/chat/groups/${groupId}`, payload)
  return data
}

export async function deleteGroup(groupId: string): Promise<void> {
  await api.delete(`/chat/groups/${groupId}`)
}

export async function uploadGroupCover(
  groupId: string,
  file: File,
): Promise<{ coverUrl: string }> {
  const formData = new FormData()
  formData.append('cover', file)
  const { data } = await api.post<{ coverUrl: string }>(
    `/chat/groups/${groupId}/cover`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

export async function inviteMember(groupId: string, userId: string): Promise<void> {
  await api.post(`/chat/groups/${groupId}/members`, { userId })
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await api.delete(`/chat/groups/${groupId}/members/${userId}`)
}

export async function updateMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  await api.patch(`/chat/groups/${groupId}/members/${userId}/role`, { role })
}

export async function updateMemberPermissions(
  groupId: string,
  userId: string,
  permissions: Record<string, boolean>,
): Promise<void> {
  await api.patch(`/chat/groups/${groupId}/members/${userId}/permissions`, { permissions })
}

export async function leaveGroup(groupId: string): Promise<void> {
  await api.post(`/chat/groups/${groupId}/leave`)
}

// ── Push subscriptions ───────────────────────────────────────────────────────

export async function registerPushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await api.post('/push/subscribe', subscription)
}

export const registerPush = registerPushSubscription

export async function removePush(subscriptionId: string): Promise<void> {
  await api.delete(`/chat/push-subscriptions/${subscriptionId}`)
}
