import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  fields: z.record(z.string(), z.unknown()).default({}),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
  shareToFeed: z.boolean().default(false),
})

export const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
})

export const itemSortSchema = z.enum(['recent', 'oldest', 'name', 'name_desc', 'rating'])

/**
 * Query params da listagem de itens.
 * - `q`: busca textual em nome + fields (ILIKE).
 * - `cursor`: opaco (base64) — paginação.
 * - `limit`: 1..100, default 30.
 * - `sort`: ordenação.
 * - `rating_min`: 1..5.
 * - `has_cover`: 'true' | 'false'.
 * - `field_<key>`: igualdade (string) OU lista CSV (select multi).
 * - `field_<key>_gte` / `_lte`: range (number/money/date).
 */
export const listItemsQuerySchema = z.object({
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  sort: itemSortSchema.default('recent'),
  rating_min: z.coerce.number().int().min(1).max(5).optional(),
  has_cover: z.enum(['true', 'false']).optional(),
}).passthrough()

export type CreateItemInput = z.infer<typeof createItemSchema>
export type UpdateItemInput = z.infer<typeof updateItemSchema>
export type ItemSort = z.infer<typeof itemSortSchema>
