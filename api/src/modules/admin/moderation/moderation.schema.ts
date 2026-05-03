import { z } from 'zod'

export const aiConfigInputSchema = z.object({
  provider: z.string().max(40).optional(),
  model: z.string().max(80).optional(),
  endpoint: z.union([z.string().url().max(500), z.literal('').transform(() => undefined as undefined)]).optional(),
  enabled: z.boolean().optional(),
  moderateText: z.boolean().optional(),
  moderateImages: z.boolean().optional(),
  moderateVideos: z.boolean().optional(),
  textThreshold: z.number().min(0).max(1).optional(),
  imageThreshold: z.number().min(0).max(1).optional(),
  autoRemove: z.boolean().optional(),
  autoFlag: z.boolean().optional(),
  notifyModerators: z.boolean().optional(),
  // apiKey nunca retorna na resposta; apenas entrada
  apiKey: z.string().min(1).max(500).optional(),
})

export const aiConfigResponseSchema = z.object({
  provider: z.string().nullable(),
  model: z.string().nullable(),
  endpoint: z.string().nullable(),
  enabled: z.boolean(),
  moderateText: z.boolean(),
  moderateImages: z.boolean(),
  moderateVideos: z.boolean(),
  textThreshold: z.string().nullable(),
  imageThreshold: z.string().nullable(),
  autoRemove: z.boolean(),
  autoFlag: z.boolean(),
  notifyModerators: z.boolean(),
  apiKeyConfigured: z.boolean(),
  updatedAt: z.date(),
})

export const ageConfigInputSchema = z.object({
  enabled: z.boolean().optional(),
  minimumAge: z.number().int().min(13).max(21).optional(),
  method: z.string().max(40).optional(),
  requireVerification: z.boolean().optional(),
})

export const ageConfigResponseSchema = z.object({
  enabled: z.boolean(),
  minimumAge: z.number(),
  method: z.string(),
  requireVerification: z.boolean(),
  updatedAt: z.date(),
})

export type AiConfigInput = z.infer<typeof aiConfigInputSchema>
export type AgeConfigInput = z.infer<typeof ageConfigInputSchema>
