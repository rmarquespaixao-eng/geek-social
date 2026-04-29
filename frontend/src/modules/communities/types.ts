// src/modules/communities/types.ts

export type CommunityCategory =
  | 'boardgames'
  | 'tcg'
  | 'rpg-mesa'
  | 'rpg-digital'
  | 'mmo'
  | 'souls'
  | 'fps'
  | 'survival'
  | 'indie'
  | 'retro'
  | 'mobile'
  | 'simulation'
  | 'strategy'
  | 'mods'
  | 'community-events'

export type CommunityVisibility = 'public' | 'private' | 'restricted'

export type MemberRole = 'owner' | 'moderator' | 'member'

export type MemberStatus = 'pending' | 'active' | 'banned'

export interface CommunitySummary {
  id: string
  slug: string
  name: string
  description: string
  category: CommunityCategory
  iconUrl: string
  coverUrl: string
  visibility: CommunityVisibility
  ownerId: string | null
  memberCount: number
  topicCount: number
  rules: string | null
  welcomeMessage: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Member {
  id: string
  communityId: string
  userId: string
  role: MemberRole
  status: MemberStatus
  banReason: string | null
  joinedAt: string
  approvedAt: string | null
}

export interface MemberWithUser extends Member {
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
  }
}

export interface JoinRequest {
  id: string
  communityId: string
  userId: string
  status: 'pending' | 'approved' | 'rejected'
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
}

export interface JoinRequestWithUser extends JoinRequest {
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
  }
}

export interface PostMedia {
  url: string
  type: 'image' | 'video'
  width?: number | null
  height?: number | null
}

export interface TopicSummary {
  postId: string
  communityId: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string | null
  media: PostMedia[]
  pinned: boolean
  locked: boolean
  movedFromCommunityId: string | null
  reactionCount: number
  commentCount: number
  pollId: string | null
  createdAt: string
  updatedAt: string
}

export interface TopicMeta {
  postId: string
  communityId: string
  pinned: boolean
  locked: boolean
  movedFromCommunityId: string | null
  pinnedAt: string | null
  lockedAt: string | null
}

export interface TopicDetail extends TopicSummary {
  meta: TopicMeta
}

export interface CommunityDetail {
  community: CommunitySummary
  viewerMembership: { role: MemberRole; status: MemberStatus; joinedAt: string } | null
  moderators: Array<{ userId: string; displayName: string; avatarUrl: string | null }>
  pendingTransfer: { toUserId: string; requestedAt: string } | null
}

export interface CommunityListPage {
  communities: CommunitySummary[]
  nextCursor: string | null
}

export interface MembersPage {
  members: MemberWithUser[]
  nextCursor: string | null
}

export interface TopicsPage {
  topics: TopicSummary[]
  nextCursor: string | null
}

export interface JoinRequestsPage {
  requests: JoinRequestWithUser[]
  nextCursor: string | null
}

export interface CreateCommunityPayload {
  name: string
  description: string
  category: CommunityCategory
  visibility: CommunityVisibility
}

export interface UpdateCommunityPayload {
  name?: string
  description?: string
  category?: CommunityCategory
  visibility?: CommunityVisibility
}

export interface CreateTopicPayload {
  content: string
}
