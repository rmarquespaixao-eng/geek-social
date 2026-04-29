import { z } from 'zod'

// ── Constantes de domínio ───────────────────────────────────────────
export const eventTypes = ['presencial', 'online'] as const
export const eventVisibilities = ['public', 'friends', 'invite'] as const
export const eventStatuses = ['scheduled', 'cancelled', 'ended'] as const
export const participantStatuses = ['subscribed', 'confirmed', 'waitlist', 'left'] as const

/**
 * Set fechado de durações permitidas (em minutos).
 *  - 60   → 1h
 *  - 120  → 2h
 *  - 180  → 3h
 *  - 240  → 4h
 *  - 360  → 6h ("noite toda")
 *  - 600  → 10h ("dia todo")
 */
export const allowedDurations = [60, 120, 180, 240, 360, 600] as const
export type AllowedDuration = (typeof allowedDurations)[number]

// ── Sub-schemas ──────────────────────────────────────────────────────
export const addressSchema = z.object({
  cep: z.string().trim().min(8).max(9),
  logradouro: z.string().trim().min(1).max(200),
  numero: z.string().trim().min(1).max(20),
  complemento: z.string().trim().max(100).optional().nullable(),
  bairro: z.string().trim().min(1).max(100),
  cidade: z.string().trim().min(1).max(100),
  estado: z.string().trim().length(2),
})

export const onlineDetailsSchema = z.object({
  meetingUrl: z.string().url().max(500),
  extraDetails: z.string().max(2000).optional().nullable(),
})

const baseEventFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  startsAt: z.coerce.date(),
  durationMinutes: z.coerce
    .number()
    .int()
    .refine((v): v is AllowedDuration => (allowedDurations as readonly number[]).includes(v), {
      message: 'INVALID_DURATION',
    }),
  visibility: z.enum(eventVisibilities).default('public'),
  capacity: z.union([z.coerce.number().int().min(1), z.null()]).optional().nullable(),
}

// ── Discriminated union por tipo (com validação por refinement) ─────
export const createEventSchema = z
  .object({
    type: z.enum(eventTypes),
    ...baseEventFields,
    address: addressSchema.optional().nullable(),
    online: onlineDetailsSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'presencial') {
      if (!data.address) {
        ctx.addIssue({
          code: 'custom',
          path: ['address'],
          message: 'MISSING_ADDRESS_FOR_PRESENCIAL',
        })
      }
    }
    if (data.type === 'online') {
      if (!data.online) {
        ctx.addIssue({
          code: 'custom',
          path: ['online'],
          message: 'MISSING_MEETING_URL_FOR_ONLINE',
        })
      }
    }
  })

export const updateEventSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    startsAt: z.coerce.date().optional(),
    durationMinutes: z.coerce
      .number()
      .int()
      .refine((v): v is AllowedDuration => (allowedDurations as readonly number[]).includes(v), {
        message: 'INVALID_DURATION',
      })
      .optional(),
    visibility: z.enum(eventVisibilities).optional(),
    capacity: z.union([z.coerce.number().int().min(1), z.null()]).optional().nullable(),
    type: z.enum(eventTypes).optional(),
    address: addressSchema.optional().nullable(),
    online: onlineDetailsSchema.optional().nullable(),
  })

export const cancelEventSchema = z
  .object({
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .nullish()

// ── Listagem / filtros ───────────────────────────────────────────────
export const listEventsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: z.enum(eventTypes).optional(),
  cidade: z.string().trim().max(100).optional(),
  visibility: z.enum(eventVisibilities).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const myEventsQuerySchema = z.object({
  status: z.enum(eventStatuses).optional(),
  from: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const listParticipantsQuerySchema = z.object({
  status: z.enum(participantStatuses).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

// ── Convites ─────────────────────────────────────────────────────────
export const createInvitesSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
})

// ── Inferred types ───────────────────────────────────────────────────
export type EventType = (typeof eventTypes)[number]
export type EventVisibility = (typeof eventVisibilities)[number]
export type EventStatus = (typeof eventStatuses)[number]
export type ParticipantStatus = (typeof participantStatuses)[number]

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type CancelEventInput = z.infer<typeof cancelEventSchema>
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>
export type MyEventsQuery = z.infer<typeof myEventsQuerySchema>
export type ListParticipantsQuery = z.infer<typeof listParticipantsQuerySchema>
export type CreateInvitesInput = z.infer<typeof createInvitesSchema>
export type AddressInput = z.infer<typeof addressSchema>
export type OnlineDetailsInput = z.infer<typeof onlineDetailsSchema>

/** Lista de campos sensíveis cuja edição dispara notificação a inscritos. */
export const SENSITIVE_FIELDS = [
  'startsAt',
  'durationMinutes',
  'type',
  'visibility',
  'capacity',
  'address',
  'online',
] as const
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number]
