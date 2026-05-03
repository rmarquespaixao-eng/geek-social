import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  ADMIN_URL: z.string().url().optional(),
  GOOGLE_OAUTH_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default(false),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string(),
  VAPID_PRIVATE_KEY: z.string(),
  VAPID_CONTACT: z.string().email(),
  JOBS_DATABASE_URL: z.string().url().optional(),
  // Auditoria #3: confiança em proxies upstream (load balancer, ingress, CDN).
  // Aceita boolean ('true'/'false'), número (hops) ou CIDR/lista (ex: '10.0.0.0/8,192.168.0.0/16').
  // Em prod com proxy reverso, configure como o número de hops ou o CIDR exato.
  TRUST_PROXY: z.string().default('false'),
  // Auditoria #5: store distribuído pra rate-limit. Sem fallback in-memory:
  // rate-limit é controle de segurança, exige a infraestrutura definida.
  REDIS_URL: z.string().url(),
  // Chave mestra AES-256-GCM para cifrar segredos at-rest (ex: api_key de moderação IA).
  // Deve ser exatamente 64 hex chars (= 32 bytes). Gere com: openssl rand -hex 32
  ADMIN_SECRETS_ENC_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'ADMIN_SECRETS_ENC_KEY deve ter exatamente 64 chars hex (32 bytes)'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const KNOWN_INSECURE_SECRETS: Array<{ envVar: keyof typeof parsed.data; values: string[] }> = [
  {
    envVar: 'JWT_SECRET',
    values: [
      'dev-only-secret-change-me-in-production-please-32',
      'troque-por-um-secret-longo-e-aleatorio',
    ],
  },
  {
    envVar: 'VAPID_PRIVATE_KEY',
    values: ['3NdUXAc798ZiD-j4CmcxvGew8oN6SGRELe94KixK7QU'],
  },
  {
    envVar: 'VAPID_PUBLIC_KEY',
    values: ['BEzO3HA6qWVExkbRErzPLMTZ2e3DOH1NZSZvNdUXl5pynzU2rb3u2hIeUS8YNCvchHMTZNFRgOlNunQm0BmELJg'],
  },
]

if (parsed.data.NODE_ENV === 'production') {
  const violations = KNOWN_INSECURE_SECRETS.filter(({ envVar, values }) =>
    values.includes(parsed.data[envVar] as string),
  )
  if (violations.length > 0) {
    console.error(
      'Recusa de inicialização: secrets dev-only detectados em NODE_ENV=production:',
      violations.map(v => v.envVar).join(', '),
      '\nGere valores novos: JWT_SECRET via `openssl rand -hex 32`; VAPID via `npx web-push generate-vapid-keys`.',
    )
    process.exit(1)
  }
}

export const env = parsed.data
