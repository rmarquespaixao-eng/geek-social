import { z } from 'zod'

const paymentMethodEnum = z.enum(['pix', 'money', 'transfer', 'card', 'negotiate'])

export const createListingSchema = z.object({
  itemId: z.string().uuid(),
  availability: z.enum(['sale', 'trade', 'both']),
  askingPrice: z.number().positive().optional().nullable(),
  paymentMethods: z.array(paymentMethodEnum).default([]),
  disclaimerAccepted: z.literal(true, { message: 'Você deve aceitar o aviso antes de publicar' }),
}).superRefine((val, ctx) => {
  if ((val.availability === 'sale' || val.availability === 'both') && val.paymentMethods.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione ao menos uma forma de pagamento para venda', path: ['paymentMethods'] })
  }
})

export const updateListingSchema = z.object({
  availability: z.enum(['sale', 'trade', 'both']).optional(),
  askingPrice: z.number().positive().nullable().optional(),
  paymentMethods: z.array(paymentMethodEnum).optional(),
}).superRefine((val, ctx) => {
  if ((val.availability === 'sale' || val.availability === 'both') && val.paymentMethods !== undefined && val.paymentMethods.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Selecione ao menos uma forma de pagamento para venda', path: ['paymentMethods'] })
  }
})

export const listMarketplaceQuerySchema = z.object({
  type: z.enum(['sale', 'trade', 'both']).optional(),
  collection_type: z.string().optional(),
  min_price: z.coerce.number().finite().optional(),
  max_price: z.coerce.number().finite().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60).optional(),
})

export type CreateListingInput = z.infer<typeof createListingSchema>
export type UpdateListingInput = z.infer<typeof updateListingSchema>
export type ListMarketplaceQuery = z.infer<typeof listMarketplaceQuerySchema>
