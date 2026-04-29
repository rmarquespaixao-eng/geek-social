// src/modules/friends/services/friendsService.ts
import { api } from '@/shared/http/api'
import type { Friend, FriendRequest, BlockedUser } from '../types'

// ── Friends ──────────────────────────────────────────────────────────────────

export async function listFriends(): Promise<Friend[]> {
  const { data } = await api.get<Friend[]>('/friends')
  return data
}

export async function removeFriend(friendId: string): Promise<void> {
  await api.delete(`/friends/${friendId}`)
}

// ── Requests ─────────────────────────────────────────────────────────────────

export async function sendRequest(receiverId: string): Promise<FriendRequest> {
  const { data } = await api.post<FriendRequest>('/friends/requests', { receiverId })
  return data
}

export async function listReceived(): Promise<FriendRequest[]> {
  const { data } = await api.get<FriendRequest[]>('/friends/requests/received')
  return data
}

export async function listSent(): Promise<FriendRequest[]> {
  const { data } = await api.get<FriendRequest[]>('/friends/requests/sent')
  return data
}

export async function acceptRequest(id: string): Promise<void> {
  await api.post(`/friends/requests/${id}/accept`)
}

export async function rejectRequest(id: string): Promise<void> {
  await api.post(`/friends/requests/${id}/reject`)
}

export async function cancelRequest(id: string): Promise<void> {
  await api.delete(`/friends/requests/${id}`)
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export async function blockUser(userId: string): Promise<void> {
  await api.post(`/blocks/${userId}`)
}

export async function unblockUser(userId: string): Promise<void> {
  await api.delete(`/blocks/${userId}`)
}

export async function listBlocked(): Promise<BlockedUser[]> {
  const { data } = await api.get<BlockedUser[]>('/blocks')
  return data
}
