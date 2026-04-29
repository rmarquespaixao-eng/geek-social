import { api } from '@/shared/http/api'
import type { PublicProfile, UpdateProfilePayload } from '@/shared/types/auth.types'

export async function getProfile(userId: string): Promise<PublicProfile> {
  const { data } = await api.get<PublicProfile>(`/users/${userId}/profile`)
  return data
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<PublicProfile> {
  const { data } = await api.put<PublicProfile>('/users/me/profile', payload)
  return data
}

export async function updateSettings(payload: { showPresence?: boolean; showReadReceipts?: boolean }): Promise<{ showPresence: boolean; showReadReceipts: boolean }> {
  const { data } = await api.patch<{ showPresence: boolean; showReadReceipts: boolean }>('/users/me/settings', payload)
  return data
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<{ avatarUrl: string }>('/users/me/avatar', formData)
  return { avatarUrl: `${data.avatarUrl}?t=${Date.now()}` }
}

export async function deleteAvatar(): Promise<void> {
  await api.delete('/users/me/avatar')
}

export async function uploadCover(file: File): Promise<{ coverUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<{ coverUrl: string }>('/users/me/cover', formData)
  return { coverUrl: `${data.coverUrl}?t=${Date.now()}` }
}

export async function deleteCover(): Promise<void> {
  await api.delete('/users/me/cover')
}

export async function uploadProfileBackground(file: File): Promise<{ profileBackgroundUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await api.post<{ profileBackgroundUrl: string }>('/users/me/background', formData)
  return { profileBackgroundUrl: `${data.profileBackgroundUrl}?t=${Date.now()}` }
}

export async function deleteProfileBackground(): Promise<void> {
  await api.delete('/users/me/background')
}

export async function setCoverColor(color: string | null): Promise<{ coverUrl: string | null; coverColor: string | null }> {
  const { data } = await api.put<{ coverUrl: string | null; coverColor: string | null }>('/users/me/cover-color', { color })
  return data
}

export async function setProfileBackgroundColor(color: string | null): Promise<{ profileBackgroundUrl: string | null; profileBackgroundColor: string | null }> {
  const { data } = await api.put<{ profileBackgroundUrl: string | null; profileBackgroundColor: string | null }>('/users/me/background-color', { color })
  return data
}

export async function deleteAccount(): Promise<void> {
  await api.delete('/users/me')
}

export async function searchUsers(q: string): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]> {
  const { data } = await api.get('/users/search', { params: { q } })
  return data
}

export async function getPublicFriends(userId: string): Promise<{ id: string; displayName: string; avatarUrl: string | null }[]> {
  const { data } = await api.get(`/users/${userId}/friends`)
  return data
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.put('/auth/change-password', { currentPassword, newPassword })
}

export async function setInitialPassword(newPassword: string): Promise<void> {
  await api.post('/auth/set-password', { newPassword })
}
