import { z } from 'zod'

export const listUsersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  // status filtering não está disponível. String vazia (enviada pelo frontend) é silenciosamente ignorada;
  // valor não-vazio retorna 400 para evitar comportamento silenciosamente ignorado.
  status: z.string().optional().refine(v => !v || v === '', {
    message: 'Filtro status não suportado — sem coluna de status dedicada; use role para filtrar por papel',
  }),
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
