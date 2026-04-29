// src/modules/friends/types.ts

export interface FriendRequest {
  id: string
  senderId: string
  senderName: string
  senderAvatarUrl: string | null
  receiverId: string
  receiverName?: string
  receiverAvatarUrl?: string | null
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}

export interface Friend {
  id: string
  displayName: string
  avatarUrl: string | null
  isOnline: boolean
  lastSeenAt: string | null
}

export interface BlockedUser {
  id: string
  displayName: string
  avatarUrl: string | null
}
