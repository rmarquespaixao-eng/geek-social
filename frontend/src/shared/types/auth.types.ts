export interface User {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
  coverUrl?: string | null
  coverColor?: string | null
  profileBackgroundUrl?: string | null
  profileBackgroundColor?: string | null
  bio?: string | null
  privacy?: 'public' | 'friends_only' | 'private'
  showPresence?: boolean
  showReadReceipts?: boolean
  steamId?: string | null
  steamLinkedAt?: string | null
  hasSteamApiKey?: boolean
  googleLinked?: boolean
  googleLinkedAt?: string | null
  hasPassword?: boolean
  birthday?: string | null
  interests?: string[]
  pronouns?: string | null
  location?: string | null
  website?: string | null
  createdAt?: string
}

export interface AuthResponse {
  accessToken: string
  user: { id: string; email: string; displayName: string }
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  displayName: string
  email: string
  password: string
}

export interface UpdateProfilePayload {
  displayName?: string
  bio?: string | null
  privacy?: 'public' | 'friends_only' | 'private'
  birthday?: string | null
  interests?: string[]
  pronouns?: string | null
  location?: string | null
  website?: string | null
}

export interface PublicProfile extends User {
  collectionsCount?: number
  itemsCount?: number
  friendsCount?: number
  postsCount?: number
  isFriend?: boolean
  friendRequestSent?: boolean
}

export interface ApiError {
  message: string
  statusCode: number
}
