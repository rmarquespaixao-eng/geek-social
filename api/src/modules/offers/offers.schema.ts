import { z } from 'zod'

export const offerTypes = ['buy', 'trade'] as const
export const offerStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'completed'] as const

const priceSchema = z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)])

export const createOfferSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('buy'),
    listingId: z.string().uuid(),
    offeredPrice: priceSchema,
    message: z.string().max(2000).trim().optional().nullable(),
  }),
  z.object({
    type: z.literal('trade'),
    listingId: z.string().uuid(),
    offeredItemId: z.string().uuid(),
    message: z.string().max(2000).trim().optional().nullable(),
  }),
])

export const listOffersQuerySchema = z.object({
  status: z.enum(offerStatuses).optional(),
})

export const proposeSchema = z.object({
  offeredPrice: z.number().positive().optional().nullable(),
  offeredItemId: z.string().uuid().optional().nullable(),
  message: z.string().max(2000).trim().optional().nullable(),
})

export type CreateOfferInput = z.infer<typeof createOfferSchema>
export type ProposeInput = z.infer<typeof proposeSchema>

export type OfferType = (typeof offerTypes)[number]
export type OfferStatus = (typeof offerStatuses)[number]
