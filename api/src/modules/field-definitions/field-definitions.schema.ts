import { z } from 'zod'

// Para money, selectOptions[0] é o código da moeda (ISO 4217)
const SUPPORTED_CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'CAD', 'AUD', 'CHF', 'MXN', 'ARS'] as const

export const createFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  fieldType: z.enum(['text', 'number', 'date', 'boolean', 'select', 'money']),
  selectOptions: z.array(z.string().min(1)).min(1).optional(),
}).superRefine((data, ctx) => {
  if (data.fieldType === 'select') {
    if (!data.selectOptions || data.selectOptions.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'selectOptions obrigatório para tipo select', path: ['selectOptions'] })
    }
  }
  if (data.fieldType === 'money') {
    if (!data.selectOptions || data.selectOptions.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe a moeda (selectOptions com 1 código)', path: ['selectOptions'] })
      return
    }
    const code = data.selectOptions[0]
    if (!SUPPORTED_CURRENCIES.includes(code as typeof SUPPORTED_CURRENCIES[number])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Moeda não suportada: ${code}`, path: ['selectOptions'] })
    }
  }
})

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>
