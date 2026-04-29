import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use formato YYYY-MM-DD')
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor inválida — use #RRGGBB')

export const setColorSchema = z.object({
  color: hexColor.nullable(),
})
export type SetColorInput = z.infer<typeof setColorSchema>

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  bio: z.string().max(10000).nullable().optional(),
  privacy: z.enum(['public', 'friends_only', 'private']).optional(),
  birthday: isoDate.nullable().optional(),
  interests: z.array(z.string().min(1).max(40)).max(20).optional(),
  pronouns: z.string().max(50).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  website: z.string().url().max(255).nullable().optional().or(z.literal('').transform(() => null)),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const updateSettingsSchema = z.object({
  showPresence: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
})

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
