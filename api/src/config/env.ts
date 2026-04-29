import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().default(7),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  S3_BUCKET_NAME: z.string().default('geek-social-media'),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_PUBLIC_URL: z.string().url().optional(),
  SES_FROM_EMAIL: z.string().email().default('noreply@localhost'),
  APP_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  GOOGLE_OAUTH_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default(false),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string(),
  VAPID_PRIVATE_KEY: z.string(),
  VAPID_CONTACT: z.string().email(),
  JOBS_DATABASE_URL: z.string().url().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
