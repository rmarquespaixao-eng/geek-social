# E2E Integration Tests — Design Spec

**Data:** 2026-04-24  
**Projeto:** geek-social-api  
**Objetivo:** Suíte de testes de integração E2E que roda contra banco real e pega falhas de runtime (500s, erros de SQL, uploads quebrados, auth inválida).

---

## Contexto

O backend já possui testes unitários com Vitest (`tests/modules/`) e um teste de integração (`tests/integration/`). Não existe cobertura E2E. Erros recentes de 500 em `POST /posts`, uploads de avatar/cover e `GET /feed` foram causados por migrações não aplicadas e configuração incorreta do S3Adapter — falhas que testes unitários com mocks não detectam.

---

## Decisões de Design

| Decisão | Escolha | Motivo |
|---|---|---|
| Escopo | Backend apenas | Resolve os 500s imediatos sem complexidade de browser |
| Ferramenta | Vitest (já usado no projeto) | Zero dependência nova |
| Requisições | `app.inject()` do Fastify | Sem porta TCP, sem supertest, mais rápido |
| Banco | `geek_social_test` dedicado | Sem risco de corromper dados de dev |
| Limpeza | `TRUNCATE` no `beforeEach` | Simples, rápido, isolamento por teste |
| Paralelismo | `singleFork: true` | Evita conflito no banco compartilhado |
| Storage | MinIO local real | Pega 500s de upload sem mock |

---

## Arquitetura

```
tests/
  e2e/
    setup/
      global-setup.ts      ← cria banco geek_social_test + migrate() — roda 1x
      global-teardown.ts   ← DROP DATABASE geek_social_test
      helpers.ts           ← buildTestApp, truncateAll, createUser, authedRequest
    auth.e2e.test.ts
    users.e2e.test.ts
    collections.e2e.test.ts
    items.e2e.test.ts
    friends.e2e.test.ts
    posts.e2e.test.ts
    feed.e2e.test.ts
    reactions.e2e.test.ts
    comments.e2e.test.ts
    blocks.e2e.test.ts
```

---

## Configuração Vitest

`vitest.config.ts` usa `projects` para separar unit de e2e sem alterar os testes existentes:

```typescript
{
  test: {
    name: 'e2e',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    globalSetup: ['tests/e2e/setup/global-setup.ts'],
    globals: true,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 15000,
    env: { DATABASE_URL: 'postgresql://dev:dev@localhost:5432/geek_social_test' }
  }
}
```

**Scripts adicionados ao package.json:**
- `test:e2e` — `vitest run --project e2e`
- `test:all` — `vitest run` (unit + e2e)

---

## Helpers (`tests/e2e/setup/helpers.ts`)

```typescript
buildTestApp(): Promise<FastifyInstance>
// Chama buildApp() do src/app.ts com DATABASE_URL de teste.
// Reutiliza a mesma instância por arquivo (beforeAll/afterAll).

truncateAll(db): Promise<void>
// TRUNCATE em ordem segura respeitando FK constraints:
// post_reactions, post_comments, post_media, posts,
// collection_field_schema, items, collections,
// friendships, user_blocks, refresh_tokens,
// push_subscriptions, user_presence, users

createUser(db, overrides?): Promise<{ user, token }>
// Insere usuário direto no DB com senha hasheada.
// Retorna accessToken via POST /auth/login para uso nos testes.

authedRequest(app, token, method, url, body?): Promise<LightMyRequestResponse>
// Wrapper sobre app.inject() que injeta Authorization: Bearer <token>.
```

---

## Cobertura por Módulo

### `auth.e2e.test.ts`
- `POST /auth/register` — cria conta, retorna accessToken + cookie refreshToken
- `POST /auth/login` — credenciais corretas → 200; erradas → 401
- `POST /auth/refresh` — com cookie válido → novo accessToken; sem cookie → 401
- `POST /auth/logout` — invalida refresh token; segundo refresh → 401

### `users.e2e.test.ts`
- `GET /users/me` — retorna perfil do usuário autenticado
- `PATCH /users/me` — atualiza displayName, bio, privacy
- `POST /users/me/avatar` — upload multipart (1x1 PNG buffer) → 200 + avatarUrl no MinIO
- `GET /users/:id/profile` — perfil público de outro usuário

### `collections.e2e.test.ts`
- `POST /collections` — cria coleção
- `GET /collections` — lista coleções do usuário
- `GET /collections/:id` — busca por id
- `PUT /collections/:id` — edita nome/visibilidade
- `POST /collections/:id/cover` — upload multipart → 200 + coverUrl
- `DELETE /collections/:id` — deleta e verifica que GET retorna 404

### `items.e2e.test.ts`
- `POST /collections/:id/items` — cria item com fields
- `GET /collections/:id/items` — lista itens
- `PATCH /collections/:id/items/:itemId` — edita campos
- `POST /collections/:id/items/:itemId/cover` — upload cover
- `DELETE /collections/:id/items/:itemId` — deleta

### `friends.e2e.test.ts`
- `POST /friends/requests` — envia pedido
- `GET /friends/requests/received` — lista pedidos recebidos (retorna FriendRequestWithUser[])
- `POST /friends/requests/:id/accept` — aceita pedido
- `GET /friends` — lista amigos (retorna Friend[] com displayName/avatarUrl/isOnline)
- `DELETE /friends/:friendId` — remove amigo

### `posts.e2e.test.ts`
- `POST /posts` — cria post manual (type: 'manual', visibility: 'public') → 201
- `POST /posts` — cria item_share post → 201
- `POST /posts` — sem autenticação → 401
- `GET /posts/:id` — busca post por id
- `PATCH /posts/:id` — edita conteúdo
- `DELETE /posts/:id` — deleta; segundo GET → 404

### `feed.e2e.test.ts`
- Feed de usuário sem posts → `{ posts: [], nextCursor: null }`
- Post próprio aparece no feed
- Post de amigo (visibility: 'public') aparece no feed
- Post privado de não-amigo NÃO aparece no feed
- Paginação via cursor

### `reactions.e2e.test.ts`
- `POST /posts/:id/reactions` — reagir com tipo 'epic' → 201
- Reagir duas vezes no mesmo post → 409
- `DELETE /posts/:id/reactions` — remove reação

### `comments.e2e.test.ts`
- `POST /posts/:id/comments` — comentar → 201
- `GET /posts/:id/comments` — listar comentários
- `DELETE /posts/:id/comments/:commentId` — deletar próprio → 204
- Deletar comentário de outro usuário → 403

### `blocks.e2e.test.ts`
- `POST /blocks/:userId` — bloquear usuário
- `GET /blocks` — listar bloqueados (retorna BlockedUserInfo[])
- Posts do bloqueado não aparecem no feed do bloqueador
- `DELETE /blocks/:userId` — desbloquear

---

## Upload de Arquivos nos Testes

Para testar multipart sem depender de arquivo externo, usar um buffer de imagem PNG mínima (67 bytes):

```typescript
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
  '0000000a49444154789c6260000000000200e221bc33000000000049454e44ae426082',
  'hex'
)
```

Cada teste de upload envia esse buffer via `app.inject()` com `Content-Type: multipart/form-data`. O `S3Adapter` vai chamar o MinIO local real, garantindo que erros de configuração de storage sejam detectados.

---

## Divisão em Partes (implementação)

| Parte | Conteúdo | Modelo |
|---|---|---|
| 1 | vitest.config.ts + global-setup/teardown + helpers.ts | Sonnet |
| 2 | auth.e2e.test.ts + users.e2e.test.ts | Sonnet |
| 3 | collections.e2e.test.ts + items.e2e.test.ts | Sonnet |
| 4 | friends.e2e.test.ts + posts.e2e.test.ts | Sonnet |
| 5 | feed.e2e.test.ts + reactions.e2e.test.ts + comments.e2e.test.ts + blocks.e2e.test.ts | Sonnet |

---

## Critérios de Sucesso

- `npm run test:e2e` passa completamente com banco e MinIO rodando
- Os 500s atuais (posts, uploads, feed) são detectados e explicitamente cobertos
- Testes unitários existentes continuam passando (`npm test`)
- Cada teste é independente — pode rodar em qualquer ordem
