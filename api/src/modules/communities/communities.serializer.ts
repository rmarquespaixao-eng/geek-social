import type { CommunityRow, MemberRow, MemberWithUser, JoinRequestRow, TopicRow } from './communities.repository.js'

// ── API shape types ─────────────────────────────────────────────────
export type ApiCommunitySummary = {
  id: string
  slug: string
  name: string
  description: string
  category: string
  iconUrl: string
  coverUrl: string
  visibility: 'public' | 'private' | 'restricted'
  ownerId: string | null
  memberCount: number
  topicCount: number
  rules: string | null
  welcomeMessage: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Stripped metadata for non-members on private communities. */
export type ApiCommunityPrivateMetadata = Pick<ApiCommunitySummary, 'id' | 'slug' | 'name' | 'visibility' | 'category' | 'createdAt'>

export type ApiMember = {
  id: string
  communityId: string
  userId: string
  role: 'owner' | 'moderator' | 'member'
  status: 'pending' | 'active' | 'banned'
  banReason: string | null
  joinedAt: string
  approvedAt: string | null
}

export type ApiMemberWithUser = ApiMember & {
  user: { id: string; displayName: string; avatarUrl: string | null }
}

export type ApiJoinRequest = {
  id: string
  communityId: string
  userId: string
  status: 'pending' | 'approved' | 'rejected'
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
}

export type ApiTopicSummary = {
  postId: string
  communityId: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  content: string | null
  pinned: boolean
  locked: boolean
  movedFromCommunityId: string | null
  reactionCount: number
  commentCount: number
  createdAt: string
  updatedAt: string
}

// ── Serializers ─────────────────────────────────────────────────────
export function serializeCommunitySummary(row: CommunityRow): ApiCommunitySummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    iconUrl: row.iconUrl,
    coverUrl: row.coverUrl,
    visibility: row.visibility,
    ownerId: row.ownerId,
    memberCount: row.memberCount,
    topicCount: row.topicCount,
    rules: row.rules,
    welcomeMessage: row.welcomeMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }
}

export function serializeCommunityPrivate(row: CommunityRow): ApiCommunityPrivateMetadata {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    visibility: row.visibility,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
  }
}

export function serializeMember(row: MemberRow): ApiMember {
  return {
    id: row.id,
    communityId: row.communityId,
    userId: row.userId,
    role: row.role,
    status: row.status,
    banReason: row.banReason,
    joinedAt: row.joinedAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
  }
}

export function serializeMemberWithUser(row: MemberWithUser): ApiMemberWithUser {
  return {
    ...serializeMember(row),
    user: {
      id: row.user.id,
      displayName: row.user.displayName,
      avatarUrl: row.user.avatarUrl,
    },
  }
}

export function serializeJoinRequest(row: JoinRequestRow): ApiJoinRequest {
  return {
    id: row.id,
    communityId: row.communityId,
    userId: row.userId,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

export function serializeTopicSummary(row: TopicRow): ApiTopicSummary {
  return {
    postId: row.postId,
    communityId: row.communityId,
    authorId: row.authorId,
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl,
    content: row.content,
    pinned: row.pinned,
    locked: row.locked,
    movedFromCommunityId: row.movedFromCommunityId,
    reactionCount: row.reactionCount,
    commentCount: row.commentCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
