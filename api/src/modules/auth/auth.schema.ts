import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email().describe('E-mail do usuário (precisa ser único)'),
  password: z.string().min(8).max(100).describe('Senha em texto plano. Hash aplicado com bcrypt antes de persistir.'),
  displayName: z.string().min(2).max(100).describe('Nome público exibido no perfil.'),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email().describe('E-mail cadastrado. Resposta é sempre 200 (não revela existência de conta).'),
})

export const resetPasswordSchema = z.object({
  token: z.string().describe('Token recebido por e-mail (válido por 1 hora, single-use).'),
  newPassword: z.string().min(8).max(100),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(100),
})

export const setPasswordSchema = z.object({
  newPassword: z.string().min(8).max(100),
  // Endpoint dedicado a contas Google-only (sem passwordHash). Quem já tem senha
  // usa /change-password — esta rota retorna 409 PASSWORD_ALREADY_SET imediatamente.
  emailVerificationToken: z.string().min(1),
})

export const verifyEmailBodySchema = z.object({
  token: z.string().min(1).describe('Token recebido por e-mail (válido por 24h, single-use).'),
})

export const resendVerificationSchema = z.object({
  email: z.string().email(),
})

export const userPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
})

export const tokenResponseSchema = z.object({
  accessToken: z.string().describe('JWT short-lived (15min). Refresh é via cookie HttpOnly.'),
  user: userPublicSchema,
})

export const accessTokenOnlyResponseSchema = z.object({
  accessToken: z.string(),
})

export const messageResponseSchema = z.object({
  message: z.string(),
})

export const errorResponseSchema = z.object({
  error: z.string().describe('Mensagem ou código tipado do erro. Códigos canônicos: EMAIL_ALREADY_EXISTS, INVALID_CREDENTIALS, INVALID_RESET_TOKEN, INVALID_VERIFICATION_TOKEN, PASSWORD_ALREADY_SET, USER_NOT_FOUND.'),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type SetPasswordInput = z.infer<typeof setPasswordSchema>
export type VerifyEmailBody = z.infer<typeof verifyEmailBodySchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>
