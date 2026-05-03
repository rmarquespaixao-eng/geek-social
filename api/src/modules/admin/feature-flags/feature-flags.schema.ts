import { z } from 'zod'

const snakeCaseKey = z.string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/, 'Chave deve ser snake_case (letras minúsculas, números, underscore)')

export const createFlagBodySchema = z.object({
  key: snakeCaseKey,
  name: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(false),
})

export const updateFlagBodySchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
})

export const setUserOverrideBodySchema = z.object({
  enabled: z.boolean(),
})

export type CreateFlagBody = z.infer<typeof createFlagBodySchema>
export type UpdateFlagBody = z.infer<typeof updateFlagBodySchema>
export type SetUserOverrideBody = z.infer<typeof setUserOverrideBodySchema>
