import { z } from 'zod'
import { communityCategories } from './categories.js'

// ── Constantes de domínio ───────────────────────────────────────────
export const communityVisibilities = ['public', 'private', 'restricted'] as const
export const communityMemberRoles = ['owner', 'moderator', 'member'] as const
export const communityMemberStatuses = ['pending', 'active', 'banned'] as const
export const communityJoinRequestStatuses = ['pending', 'approved', 'rejected'] as const

// ── Schemas de criação / atualização ───────────────────────────────
export const createCommunitySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  category: z.enum(communityCategories),
  visibility: z.enum(communityVisibilities).default('public'),
})

export const updateCommunitySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  category: z.enum(communityCategories).optional(),
  visibility: z.enum(communityVisibilities).optional(),
})

// ── Listagem / filtros ──────────────────────────────────────────────
export const listCommunitiesQuerySchema = z.object({
  category: z.enum(communityCategories).optional(),
  visibility: z.enum(communityVisibilities).optional(),
  search: z.string().trim().min(2).max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const listMembersQuerySchema = z.object({
  role: z.enum(communityMemberRoles).optional(),
  status: z.enum(communityMemberStatuses).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const listTopicsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const listPendingQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

// ── Param schemas ───────────────────────────────────────────────────

export const idOrSlugParam = z.object({
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
})

export const uuidParam = z.object({
  id: z.string().uuid(),
})

export const joinRequestParams = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
})

export const topicParams = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
})

export const memberParams = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
})

// ── Topic body ──────────────────────────────────────────────────────
export const createTopicSchema = z.object({
  content: z.string().trim().min(1).max(10000).optional().nullable(),
  visibility: z.enum(['public', 'friends_only', 'private'] as const).default('public'),
})

// ── Inferred types ──────────────────────────────────────────────────
export type CommunityVisibility = (typeof communityVisibilities)[number]
export type CommunityMemberRole = (typeof communityMemberRoles)[number]
export type CommunityMemberStatus = (typeof communityMemberStatuses)[number]
export type CommunityJoinRequestStatus = (typeof communityJoinRequestStatuses)[number]

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>
export type ListCommunitiesQuery = z.infer<typeof listCommunitiesQuerySchema>
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>
export type ListTopicsQuery = z.infer<typeof listTopicsQuerySchema>
export type CreateTopicInput = z.infer<typeof createTopicSchema>
