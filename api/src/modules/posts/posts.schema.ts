import { z } from 'zod'

export const createPostSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  visibility: z.enum(['public', 'friends_only', 'private']).default('public'),
})

export const updatePostSchema = z.object({
  content: z.string().min(1).max(5000).nullable().optional(),
  visibility: z.enum(['public', 'friends_only', 'private']).optional(),
})

export const addCommentSchema = z.object({
  content: z.string().min(1).max(2000),
})

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
})

export const addReactionSchema = z.object({
  type: z.enum(['power_up', 'epic', 'critical', 'loot', 'gg']),
})

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type AddCommentInput = z.infer<typeof addCommentSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>
export type AddReactionInput = z.infer<typeof addReactionSchema>
export type FeedQueryInput = z.infer<typeof feedQuerySchema>
