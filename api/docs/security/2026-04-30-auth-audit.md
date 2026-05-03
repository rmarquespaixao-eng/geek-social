# Auditoria de Segurança — Auth (pós-ajustes)

**Data:** 2026-04-30
**Escopo:** mudanças pendentes no módulo `auth/` + middleware `authenticate` + `rate-limit`
**Modelo OWASP:** Top 10 (2021) — foco A01, A02, A07 e transversais
**Branch:** `feat/communities`
**Commits-base auditados:** uncommitted changes em `api/src/modules/auth/**`, `api/src/shared/middleware/{authenticate,rate-limit}.ts`, migrations 0039/0042/0043

## Sumário

- 1 Crítico
- 5 Altos
- 7 Médios
- 4 Baixos

A maioria dos achados não é regressão pelos ajustes (rate-limit, OAuth code, tokenVersion), mas sim **lacunas e regressões introduzidas pelos próprios ajustes**. O ajuste de tokenVersion + revogação está funcionalmente correto, mas três pontos de race/atomicidade e um oracle de senha derrotam a intenção.

## Status pós-correção (2026-04-30)

| # | Severidade | Status |
|---|---|---|
| #1 | Crítico | corrigido |
| #2 | Alto | corrigido |
| #3 | Alto | corrigido (UNIQUE constraint + catch + tx para atomicidade do avatar) |
| #4 | Alto | corrigido |
| #5 | Alto | mitigado (cleanup + doc); Redis fica como follow-up arquitetural |
| #6 | Alto | corrigido |
| #7 | Médio | corrigido |
| #8 | Médio | corrigido |
| #9 | Médio | corrigido (endpoint /logout-all dedicado; logout normal mantém UX padrão) |
| #10 | Médio | corrigido |
| #11 | Médio | corrigido |
| #12 | Médio | resolvido pelo #2 (UPDATE atômico fecha a TOCTOU) |
| #13 | Médio | adiado (perf, não segurança) |
| #14 | Baixo | corrigido |
| #15 | Baixo | corrigido |
| #16 | Baixo | corrigido |
| #17 | Baixo | aceito (design choice documentado) |

Testes da suíte de auth: **29/29 verde**. TypeScript: limpo. Falhas em outros módulos do `feat/communities` são pré-existentes da branch (não tocados por esta auditoria).

---

## #1 — `setInitialPassword` é um oracle de senha (HIGH → CRITICAL combinado com #5)

**Arquivo:** `api/src/modules/auth/auth.service.ts:269-280`
**Categoria:** A07 (Identification & Authentication Failures), A04 (Insecure Design)
**Severidade:** CRÍTICO

```ts
if (user.passwordHash) {
  if (!input.currentPassword) throw new AuthError('CURRENT_PASSWORD_REQUIRED')   // → 400
  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash)
  if (!isValid) throw new AuthError('INVALID_CREDENTIALS')                       // → 401
  throw new AuthError('PASSWORD_ALREADY_SET')                                    // → 409
}
```

O fluxo distingue 3 estados via status code:

| Input | Status | Significado vazado |
|---|---|---|
| sem `currentPassword` | 400 `CURRENT_PASSWORD_REQUIRED` | conta tem senha (não-Google-only) |
| `currentPassword` errado | 401 `INVALID_CREDENTIALS` | senha incorreta |
| `currentPassword` correto | 409 `PASSWORD_ALREADY_SET` | senha **correta** |

**Impacto:** atacante com JWT vazado (XSS, dispositivo compartilhado, replay) pode usar `/auth/set-password` como oráculo binário de validação de senhas — o 409 confirma o palpite. O bcrypt.compare é dead code: o resultado é jogado fora, mas o status diferente o expõe.

**Mitigação atual:** rate-limit `setPasswordRateLimiter` (3/hora por userId) limita brute-force, mas confirmação de **uma** senha já é catastrófica (atacante com lista de senhas vazadas testa as 3 mais prováveis).

**Recomendação:** se tem `passwordHash`, retornar `409 PASSWORD_ALREADY_SET` imediatamente, sem tocar em bcrypt nem currentPassword. Esse endpoint é só para criar a primeira senha de conta Google-only.

---

## #2 — Rotação de refresh token não é atômica (race → reuse não detectado) (HIGH)

**Arquivos:** `api/src/modules/auth/auth.service.ts:101-131`, `auth.repository.ts:91-95`
**Categoria:** A07, A04
**Severidade:** ALTO

```ts
// service.refreshToken
const stored = await this.userRepository.findRefreshToken(tokenHash)         // SELECT
if (stored.used) { /* reuso */ }                                              // check
const user = await this.userRepository.findById(stored.userId)                // SELECT
await this.userRepository.markRefreshTokenAsUsed(stored.id)                   // UPDATE

// repository.markRefreshTokenAsUsed — SEM filtro `used = false`
await this.db.update(refreshTokens).set({ used: true }).where(eq(refreshTokens.id, id))
```

Janela de race entre `findRefreshToken` e `markRefreshTokenAsUsed` (≥ 1 await + 1 SELECT). Dois requests concorrentes com o mesmo refresh token roubado podem **ambos** passar pelo `if (stored.used)` antes de qualquer um marcar — ambos rotacionam, ambos emitem novo par, e a detecção de reuso (a razão de toda a `family_id`) **nunca dispara**.

**Reproduzível:** dois `curl` simultâneos para `/auth/refresh` com o mesmo cookie.

**Recomendação:** atomicidade no UPDATE — só rotaciona quem ganhar o `WHERE used = false`:

```ts
// repository
async markRefreshTokenAsUsed(id: string): Promise<boolean> {
  const result = await this.db.update(refreshTokens)
    .set({ used: true })
    .where(and(eq(refreshTokens.id, id), eq(refreshTokens.used, false)))
    .returning({ id: refreshTokens.id })
  return result.length > 0
}

// service
const won = await this.userRepository.markRefreshTokenAsUsed(stored.id)
if (!won) {
  // alguém já rotacionou esse token — trate como reuso
  await this.userRepository.revokeAllByFamilyId(stored.familyId)
  throw new AuthError('TOKEN_REUSE_DETECTED')
}
```

---

## #3 — `linkGoogleAccount` usa transação fake (race em vinculação) (HIGH)

**Arquivo:** `api/src/modules/auth/auth.service.ts:211-227`
**Categoria:** A04 (Insecure Design)
**Severidade:** ALTO

```ts
await this.db.transaction(async (tx) => {
  const userRepo = this.userRepository  // ← fechado sobre this.db, NÃO sobre tx
  const user = await userRepo.findById(input.userId)
  ...
  const ownedBy = await userRepo.findByGoogleId(input.googleId)
  if (ownedBy && ownedBy.id !== input.userId) throw ...
  await userRepo.linkGoogle(input.userId, input.googleId)
})
```

O `tx` é declarado mas nunca passado pra repo. As escrituras (`linkGoogle`, `updateProfile`) vão pro client externo `this.db` — fora da transação. O bloco `transaction()` não envelopa nada significativo.

**Impacto:** dois `linkGoogleAccount` concorrentes pro mesmo `googleId` (vindos de dois usuários distintos) podem ambos passar pelo `findByGoogleId` antes de qualquer um escrever → ambos fazem `linkGoogle` → o segundo sobrescreve a vinculação do primeiro. Contorna a checagem `GOOGLE_ALREADY_LINKED_TO_OTHER_USER`.

**Recomendação opção A (preferida):** unique constraint em `users.google_id` no DB (provavelmente já existe — confirmar) + `try/catch` no `linkGoogle` interpretando violação como `GOOGLE_ALREADY_LINKED_TO_OTHER_USER`.

**Recomendação opção B:** repassar `tx` ao repo:

```ts
await this.db.transaction(async (tx) => {
  const repo = new UserRepository(tx)  // ou interface aceitando tx
  const ownedBy = await repo.findByGoogleId(input.googleId)
  ...
  await repo.linkGoogle(input.userId, input.googleId)
})
```

Verificar se `UserRepository` aceita `DatabaseClient | TransactionClient`. Se não, refatorar.

---

## #4 — `/change-password` sem rate-limit → brute-force de senha atual com JWT vazado (HIGH)

**Arquivo:** `api/src/modules/auth/auth.routes.ts:159-174`
**Categoria:** A07 (Auth Failures)
**Severidade:** ALTO

```ts
app.put('/change-password', {
  ...
  preHandler: [authenticate],   // ← falta rate-limiter
  handler: controller.changePassword.bind(controller),
})
```

O controller retorna `400 INVALID_CREDENTIALS` para senha atual errada e `204` para acerto. JWT roubado + endpoint sem rate-limit = brute-force ilimitado por usuário (limitado só pelo IP rate-limit global, que não existe). `setInitialPassword` foi rate-limitado (3/hora) explicitamente por essa razão; `changePassword` foi esquecido.

**Recomendação:** aplicar `createUserRateLimiter(5, 60 * 60 * 1000)` (5/hora por user). Manter consistência com setPassword.

---

## #5 — Estado in-memory: rate-limit + OAuth code map quebram em multi-instância e vazam memória (HIGH)

**Arquivos:** `api/src/shared/middleware/rate-limit.ts:8-9`, `api/src/modules/auth/google.strategy.ts:11-12`
**Categoria:** A04 (Insecure Design), A05 (Security Misconfiguration)
**Severidade:** ALTO (em produção com >1 réplica)

### 5a) Rate limiter

```ts
const ipLimits = new Map<string, RateLimitEntry>()
const userLimits = new Map<string, RateLimitEntry>()
```

Mapas globais por processo. Implicações:

- **Bypass por escala horizontal:** com N réplicas, o atacante consegue N×limit antes de ser bloqueado. Login (5/min) vira 5N/min. Set-password (3/hora) vira 3N/hora.
- **Bypass por restart:** processo reinicia → contadores zeram.
- **Memory leak:** entries com `resetAt < now` só são limpas se a mesma chave for tocada de novo. Atacante com IPs rotativos (botnet) acumula entries indefinidamente.

### 5b) OAuth code map

```ts
const oauthCodes = new Map<string, OAuthCode>()
```

- **Quebra OAuth login em multi-instância:** callback emite código no Pod A, frontend faz POST /auth/exchange que cai no Pod B → 400 INVALID_OAUTH_CODE. UX quebra de forma intermitente.
- **Bypass de revogação:** códigos só vivem 30s, mas a revogação por restart é trivial.

**Recomendação:**
- Curto prazo (sem mudar infra): documentar que o serviço só pode rodar single-instance até a v2 (perigoso pra produção).
- Médio prazo: extrair pra Redis (rate-limit via `INCR + EXPIRE`, OAuth codes via `SETEX`). Com TTLs nativos, o memory leak some.
- Alternativa para rate-limit: `@fastify/rate-limit` com store Redis.

---

## #6 — `optionalAuthenticate` aplica revogação mas chat WebSocket não revalida em conexões abertas (HIGH)

**Arquivos:** `api/src/modules/chat/chat.gateway.ts:48-60`, `api/src/shared/middleware/authenticate.ts`
**Categoria:** A01 (Broken Access Control), A07
**Severidade:** ALTO

A `chat.gateway` revalida `tokenVersion` **na conexão** (bom). Porém, conexões WebSocket já abertas continuam vivas após `incrementTokenVersion` (changePassword, setInitialPassword, deleteAccount). HTTP requests são bloqueadas pelo middleware (cada request → 1 SELECT), mas o WS já estabelecido nunca revisita o JWT.

**Cenário:** usuário troca senha → atacante com JWT vazado já tinha um WS aberto → segue recebendo/enviando mensagens até o WS cair por outra razão.

**Recomendação:** invalidar conexões WS do usuário em qualquer `incrementTokenVersion`. Hook em `changePassword`/`setInitialPassword`/`deleteAccount`:

```ts
// app.ts ou auth.service
chatGateway.disconnectUser(userId, reason: 'TOKEN_VERSION_BUMPED')
```

Adicionar `disconnectUser(userId)` ao `ChatGateway` que itera sockets e fecha (já que ele mantém map userId → sockets).

---

## #7 — Memory leak em rate-limiter (in-memory) (MEDIUM)

**Arquivo:** `api/src/shared/middleware/rate-limit.ts:8-29`
**Categoria:** A04, A05
**Severidade:** MÉDIO

Sem cleanup periódico — entries expiradas só são reset quando a mesma chave é vista de novo. Atacante com IP-spray acumula `Map` indefinidamente. Por extensão, OAuth code map (#5b) tem cleanup (`setInterval`), mas o rate-limit não.

**Recomendação:** se ficar in-memory, adicionar `setInterval` de limpeza varrendo entries com `resetAt <= now`. Limitar tamanho do Map (LRU) ou migrar pra Redis (#5).

---

## #8 — `/verify-email` usa rate-limiter compartilhado com `/resend-verification` (MEDIUM)

**Arquivo:** `api/src/modules/auth/auth.routes.ts:140`
**Categoria:** A04
**Severidade:** MÉDIO

```ts
app.post('/verify-email', { ..., preHandler: [resendRateLimiter], ... })
```

O `resendRateLimiter` é o mesmo objeto-fechamento usado por `/resend-verification`. Atacante saturando `/verify-email` consome o budget e bloqueia legítimos `/resend-verification` no mesmo IP. Tokens de verify são 256-bit random — brute-force inviável — mas a divisão de budget é incorreta.

**Recomendação:** criar `verifyRateLimiter` próprio:

```ts
const verifyRateLimiter = createIpRateLimiter(20, 60 * 1000)  // verify pode ser mais lenient
```

---

## #9 — Logout não incrementa tokenVersion (JWT permanece válido até 15min após logout) (MEDIUM)

**Arquivo:** `api/src/modules/auth/auth.service.ts:133-135`
**Categoria:** A07
**Severidade:** MÉDIO

```ts
async logout(tokenHash: string): Promise<void> {
  await this.userRepository.deleteRefreshToken(tokenHash)
}
```

Apenas remove o refresh. O JWT (TTL 15min) sobrevive. Em dispositivo compartilhado, o atacante com acesso ao localStorage do JWT continua autenticado após o logout.

**Recomendação:** se logout deveria revogar imediatamente, incrementar `tokenVersion` ao logout. Custo: o usuário que está logado em N dispositivos terá todos eles deslogados. Tradeoff de UX vs segurança — explicitar a decisão.

Alternativa intermediária: deny-list de JTIs de JWT no Redis com TTL de 15min (mais cara, mais granular).

---

## #10 — Login/forgot/resend: enumeração de usuário via timing oracle (MEDIUM)

**Arquivos:** `auth.service.ts:90-99` (login), `137-149` (forgot), `70-77` (resend)
**Categoria:** A07
**Severidade:** MÉDIO

Padrão consistente: se user não existe, retorna imediatamente. Se existe, faz bcrypt + `await emailService.send(...)`. Diferença de tempo é mensurável (≥ 100ms quando há SES).

```ts
// login
if (!user) throw new AuthError('INVALID_CREDENTIALS')           // ~1ms
if (!user.passwordHash) throw new AuthError('INVALID_CREDENTIALS')  // ~1ms
const isValid = await bcrypt.compare(...)                         // ~100ms
```

```ts
// forgot
const user = await findByEmail(input.email)
if (!user) return                                                  // ~1ms
...
await this.emailService.sendPasswordResetEmail(...)                // 100-1000ms
```

**Recomendação:**
- **login:** rodar `bcrypt.compare` mesmo quando user não existe (com hash dummy fixo). Constant-time falha.
- **forgot/resend:** disparar email de forma fire-and-forget (`.catch(() => {})`) — não bloquear a resposta. Resposta retorna em ~1ms independente do estado do user.

```ts
// padrão pra forgot
async forgotPassword(input) {
  this.processForgotPasswordAsync(input).catch(err => log.error({ err }))
  // retorna imediatamente — endpoint é "always 200"
}
```

---

## #11 — Cookie `refreshToken` com `path: '/'` em vez de `/auth` (MEDIUM)

**Arquivos:** `auth.controller.ts:141-149`, `google.strategy.ts:71-79`
**Categoria:** A05
**Severidade:** MÉDIO

```ts
reply.setCookie('refreshToken', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  expires,
  path: '/',                       // ← muito amplo
})
```

Cookie é enviado em **toda** request à API, incluindo rotas que não precisam dele (chat, posts, listings). Aumenta superfície de log e CSRF residual.

**Recomendação:** `path: '/auth'` — só `/auth/refresh` e `/auth/logout` precisam ler o cookie. Em produção, `sameSite: 'strict'` cobre CSRF, mas defesa em profundidade.

Bônus: `secure` e `sameSite: 'strict'` só em produção. Em staging (NODE_ENV='staging'), o cookie vai sem `secure` — flag por env explícito (`COOKIE_SECURE`) é mais robusto.

---

## #12 — Find refresh token retorna mesmo expirados/usados (MEDIUM/baixo)

**Arquivo:** `api/src/modules/auth/auth.repository.ts:85-89`
**Categoria:** A04
**Severidade:** MÉDIO (acopla com #2)

```ts
async findRefreshToken(tokenHash) {
  return await this.db.select().from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash)).limit(1)
}
```

O service depende de checagens em JS (`stored.used`, `stored.expiresAt < new Date()`). Combinado com o race em #2, a janela de exploração existe. Mover a checagem pro WHERE da query elimina a TOCTOU parcialmente.

**Recomendação:** documentar que essa função intencionalmente retorna usados (para detecção de reuso) — e fechar o race via UPDATE atômico (#2).

---

## #13 — `optionalAuthenticate` paga 1 SELECT/req em rotas públicas (MEDIUM, perf)

**Arquivo:** `api/src/shared/middleware/authenticate.ts:75`
**Categoria:** A05 (Security Misconfiguration / DoS surface)
**Severidade:** MÉDIO

Cada request com JWT (mesmo em rotas públicas que apenas opcionalmente identificam o user) faz `findById`. Em endpoints quentes (feed, marketplace, listings) sob 1k RPS, são 1k SELECTs/s. Postgres aguenta, mas o overhead é desnecessário em rotas públicas onde a revogação não importa criticamente.

**Recomendação:** cache em memória (LRU 10k entries, TTL 30s) de `userId → tokenVersion`. Aceita janela de 30s para revogação propagar em rotas opcionais (rotas críticas continuam direto no DB).

```ts
const tokenVersionCache = new LRUCache<string, number>({ max: 10_000, ttl: 30_000 })
```

---

## #14 — `setInterval` do OAuth code cleanup não é cancelado em onClose (LOW)

**Arquivo:** `api/src/modules/auth/google.strategy.ts:14-23, 50`
**Categoria:** A05
**Severidade:** BAIXO

```ts
function startOAuthCodeCleanup() {
  setInterval(() => { ... }, 60 * 1000)
}
...
startOAuthCodeCleanup()  // sem retorno do handle
```

Em testes integrados, o interval fica vivo após `app.close()` → testes não terminam ou logam warning. Pequeno leak.

**Recomendação:** retornar o handle e registrar `app.addHook('onClose', () => clearInterval(handle))`.

---

## #15 — `verifyEmailQuerySchema` exportado mas sem rota correspondente (LOW)

**Arquivos:** `auth.schema.ts:40-42`, `auth.routes.ts`
**Categoria:** —
**Severidade:** BAIXO

Schema declarado pra GET `/verify-email?token=...` mas só existe POST. Dead code. (Se a intenção é suportar GET por link de e-mail, adicionar a rota; senão, remover o schema.)

**Recomendação:** remover (preferência: o link no e-mail aponta pra frontend `/verify-email#token=...` que faz POST — fluxo correto).

---

## #16 — JWT algoritmo não fixado explicitamente (LOW)

**Arquivo:** `api/src/app.ts:191`
**Categoria:** A02
**Severidade:** BAIXO

```ts
await app.register(fastifyJwt, { secret: env.JWT_SECRET })
```

`@fastify/jwt` defaulta a HS256, mas fixar `sign: { algorithm: 'HS256' }` e `verify: { algorithms: ['HS256'] }` previne confusão de algoritmo se a config for trocada para chave assimétrica no futuro.

**Recomendação:**

```ts
await app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
  sign: { algorithm: 'HS256' },
  verify: { algorithms: ['HS256'] },
})
```

---

## #17 — Email enumeração no `/register` (consciente — LOW)

**Arquivo:** `api/src/modules/auth/auth.controller.ts:17-19`
**Categoria:** A07
**Severidade:** BAIXO (design choice)

`409 EMAIL_ALREADY_EXISTS` revela existência. UX vs segurança: pra registro, geralmente aceitável. Documentar.

---

## Categorias com 0 achados (cobertura confirmada)

- **A03 (Injection):** Drizzle ORM com queries paramétricas, sem string concat. ✅
- **A06 (Vulnerable Components):** fora do escopo desta auditoria diff (rodar `npm audit` à parte).
- **A08 (Software/Data Integrity):** sem deserialização de objetos não confiáveis.
- **A09 (Logging/Monitoring):** request.log presente, mas escopo de auditoria de log fora deste passe.
- **A10 (SSRF):** OAuth callback usa apenas `redirect_uri` registrado em config (não user-controlled).

---

## Próximos passos recomendados (em ordem)

1. **#1, #2, #3, #4, #6** — corrigir antes de qualquer deploy. São regressões/lacunas dos próprios ajustes.
2. **#5** — decisão arquitetural: aceitar single-instance por ora, ou priorizar Redis.
3. **#9, #10, #11** — endurecimento. Não bloqueador.
4. **#13, #14, #15, #16, #17** — limpeza/perf, programar pra próximo ciclo.

Sugestão para esta sessão: aprovar correções #1–#4 + #8 agora (são in-process, sem mudança de infra), deixar #5/#6 pra discussão arquitetural.
