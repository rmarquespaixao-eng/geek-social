import { z } from 'zod'

export const listUsersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  // status filtering não está disponível (sem coluna status dedicada no DB).
  // Rejeitar explicitamente para evitar comportamento silenciosamente ignorado.
  status: z.undefined({ invalid_type_error: 'Filtro status não suportado — sem coluna de status dedicada; use role para filtrar por papel' }).optional(),
  role: z.enum(['user', 'moderator', 'admin']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const setUserStatusBodySchema = z.object({
  status: z.enum(['active', 'suspended', 'banned']),
  reason: z.string().max(500).trim().optional(),
})

export const setUserRoleBodySchema = z.object({
  role: z.enum(['user', 'moderator', 'admin']),
})

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
export type SetUserStatusBody = z.infer<typeof setUserStatusBodySchema>
export type SetUserRoleBody = z.infer<typeof setUserRoleBodySchema>
