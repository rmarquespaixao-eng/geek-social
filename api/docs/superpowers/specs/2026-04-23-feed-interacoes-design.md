# Sub-projeto 4 — Feed e Interações

**Data:** 2026-04-23  
**Status:** Aprovado

---

## Contexto

Feed social para a rede geek. Usuários publicam posts manuais (texto + imagens) e podem compartilhar itens de coleções no feed (opt-in por item). Amigos veem o feed uns dos outros; posts públicos entram em descoberta global. Interações via reações temáticas geek e comentários planos.

---

## Modelo de Dados

### `posts`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | cascade delete |
| type | enum: `manual \| item_share` | |
| content | text | nullable — item_share pode não ter texto |
| visibility | enum: `public \| friends_only \| private` | private = só o autor |
| item_id | uuid FK → items | nullable, só item_share — cascade delete |
| collection_id | uuid FK → collections | nullable, só item_share — SET NULL on delete |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Índices:**
- `(user_id, created_at DESC)` — feed de perfil e posts próprios no feed principal
- `(visibility, created_at DESC)` — descoberta pública
- `(item_id)` — lookup reverso de item_share

---

### `post_media`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| post_id | uuid FK → posts | cascade delete |
| url | text | URL no S3 |
| display_order | integer | ordem de exibição |

---

### `post_reactions`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| post_id | uuid FK → posts | cascade delete |
| user_id | uuid FK → users | cascade delete |
| type | enum: `power_up \| epic \| critical \| loot \| gg` | |
| created_at | timestamptz | |

**Constraint:** `UNIQUE(post_id, user_id)` — uma reação por usuário por post.

---

### `post_comments`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| post_id | uuid FK → posts | cascade delete |
| user_id | uuid FK → users | cascade delete |
| content | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Índice:** `(post_id, created_at)` — listagem de comentários por post.

---

## Arquitetura de Código

Novo módulo `src/modules/posts/`. Posts, comentários e reações ficam no mesmo módulo por coesão — todos giram em torno do conceito de post.

```
src/modules/posts/
  posts.routes.ts
  posts.controller.ts
  posts.service.ts
  posts.repository.ts
  posts.schema.ts
  comments.routes.ts
  comments.controller.ts
  comments.service.ts
  comments.repository.ts
  reactions.routes.ts
  reactions.controller.ts
  reactions.service.ts
  reactions.repository.ts
  feed.routes.ts
  feed.controller.ts
  feed.service.ts
  feed.repository.ts

src/shared/contracts/
  posts.repository.contract.ts
  comments.repository.contract.ts
  reactions.repository.contract.ts
  feed.repository.contract.ts
```

**Módulos existentes alterados:**

- `src/modules/items/items.service.ts` — recebe `IPostsService` opcional; quando `shareToFeed: true`, chama `postsService.createItemShare()` após criar o item
- `src/modules/items/items.schema.ts` — `POST /items` ganha campo `shareToFeed?: boolean` (default `false`)
- `src/app.ts` — DI: instancia `PostsService` e injeta em `ItemsService`; registra todas as novas rotas

**Separação de responsabilidades:**
- `PostsService` — CRUD de posts + upload de mídia via Sharp/S3
- `CommentsService` — CRUD de comentários, verifica se post existe e se viewer pode interagir
- `ReactionsService` — upsert/remoção de reação (UNIQUE por post+user garante unicidade)
- `FeedService` — query pull com cursor + regras de visibilidade + exclusão de bloqueados

---

## Endpoints da API

Todas as rotas exigem JWT, exceto `GET /users/:userId/posts` que aceita viewer anônimo via `optionalAuthenticate`.

### Posts

```
POST   /posts                        criar post manual
GET    /posts/:id                    buscar post por id (404 para private de terceiros)
PATCH  /posts/:id                    editar content e/ou visibility (só autor, só manual)
DELETE /posts/:id                    deletar post (só autor)
POST   /posts/:id/media              upload de 1–4 imagens por request (multipart)
DELETE /posts/:id/media/:mediaId     remover imagem
```

### Feed

```
GET    /feed                         feed principal (amigos + próprios + descoberta)
GET    /users/:userId/posts          posts do perfil — public para todos; public+friends_only para amigos confirmados
```

**Query params:** `?cursor=<base64>&limit=20`  
**Resposta:** `{ posts: [...], nextCursor: string | null }`

Cursor encoda `{ createdAt: ISO string, id: uuid }` em base64. Garante paginação estável sem OFFSET.

### Comentários

```
POST   /posts/:postId/comments       adicionar comentário
GET    /posts/:postId/comments       listar comentários (cursor-based)
PATCH  /posts/:postId/comments/:id   editar comentário (só autor)
DELETE /posts/:postId/comments/:id   deletar (autor do comentário ou autor do post)
```

### Reações

```
POST   /posts/:postId/reactions      reagir ou trocar reação  { type: 'epic' | ... }
DELETE /posts/:postId/reactions      remover própria reação
GET    /posts/:postId/reactions      contagem por tipo + reação do viewer
```

**Resposta de `GET /posts/:postId/reactions`:**
```json
{
  "counts": { "power_up": 12, "epic": 4, "critical": 1, "loot": 0, "gg": 7 },
  "myReaction": "epic"
}
```

---

## Regras de Negócio

### Visibilidade de posts
- `public` — aparece no feed de qualquer autenticado e na descoberta pública
- `friends_only` — só aparece no feed de amigos confirmados
- `private` — só o autor vê
- Usuário bloqueado (em qualquer direção) → `404` em todos os endpoints de post

### Feed — query pull com índices

Inclui:
- Posts próprios (qualquer visibilidade exceto private de outro)
- Posts de amigos confirmados (`public` e `friends_only`)
- Posts `public` de não-amigos (descoberta)

Exclui:
- Posts de usuários que o viewer bloqueou ou que o bloquearam
- Posts `friends_only` de não-amigos
- Posts `private` de terceiros

Ordenação: `created_at DESC, id DESC` (estável para cursor).  
Limite padrão: 20 por página.

### Item share (opt-in)

- `shareToFeed: boolean` no `POST /items` — padrão `false`
- Se `true`, cria post `item_share` com visibilidade herdada da coleção pai:
  - coleção `public` → post `public`
  - coleção `friends_only` → post `friends_only`
  - coleção `private` → ignora `shareToFeed`, não cria post
- Item share não tem edição de conteúdo — é gerado automaticamente
- Se o item for deletado, o post é deletado via cascade (`item_id FK cascade delete`)

### Reações

- Uma reação por usuário por post — `POST` é upsert (troca o tipo se já reagiu)
- Não pode reagir no próprio post → `400`
- Não pode reagir em post de usuário bloqueado → `404`

### Comentários

- Não pode comentar em post `private` de outro usuário → `404`
- Não pode comentar em post de usuário bloqueado → `404`
- Edição: só o autor do comentário
- Deleção: autor do comentário **ou** autor do post

### Upload de mídia

- Mesmo pipeline das coleções: Sharp + S3
- Máximo de 4 imagens por post → `400` se exceder
- Redimensionado para 1200×1200 max, convertido para webp

---

## Testes

Padrão do projeto: Vitest + mocks manuais das interfaces, sem testes de controller.

**`posts.service.test.ts`**
- Criar post manual — happy path, cada visibilidade
- Criar item_share — herda visibilidade da coleção
- Criar item_share com coleção private — não cria post
- Editar post — autor (ok), não-autor (403), inexistente (404)
- Deletar post — autor (ok), não-autor (403)
- Upload de mídia — happy path, 5ª imagem → erro, formato inválido → erro

**`feed.service.test.ts`**
- Feed inclui posts próprios
- Feed inclui posts public e friends_only de amigos
- Feed inclui posts public de não-amigos
- Feed exclui posts friends_only de não-amigos
- Feed exclui posts de usuário bloqueado (bloqueador e bloqueado)
- Cursor retorna próxima página correta (sem duplicatas, sem omissões)

**`comments.service.test.ts`**
- Comentar em post public — happy path
- Comentar em post private de outro → erro
- Comentar em post de bloqueado → erro
- Editar comentário — autor (ok), não-autor (403)
- Deletar por autor do comentário (ok)
- Deletar por autor do post (ok)
- Deletar por terceiro → erro

**`reactions.service.test.ts`**
- Reagir em post de terceiro — happy path, retorna contagem atualizada
- Trocar reação — upsert altera tipo
- Remover reação — happy path
- Reagir no próprio post → erro
- Reagir em post de bloqueado → erro

---

## Fora de escopo (fases futuras)

- Notificações in-app (nova reação, novo comentário, novo seguidor) — fase futura
- Moderação de conteúdo do feed — sub-projeto 6
- Sugestões de usuários para seguir
- Posts com vídeo
- Menções (`@usuario`) e hashtags
- Edição de imagens já publicadas (exceto adicionar/remover)
- Integração Steam/Epic gerando posts automáticos — sub-projeto 7
