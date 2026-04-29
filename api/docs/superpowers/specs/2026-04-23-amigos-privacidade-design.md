# Sub-projeto 3 — Sistema de Amigos e Privacidade

**Data:** 2026-04-23
**Status:** Aprovado

---

## Contexto

Sistema de amizades mútuas para a rede social geek. Permite enviar, aceitar e recusar pedidos de amizade, remover amigos e bloquear usuários. Com amizades disponíveis, ativa-se o nível de privacidade `friends_only` tanto no perfil de usuário quanto nas coleções.

---

## Modelo de Dados

### `friendships`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| requester_id | uuid FK → users | cascade delete |
| receiver_id | uuid FK → users | cascade delete |
| status | enum: `pending/accepted` | |
| created_at | timestamp with timezone | |
| updated_at | timestamp with timezone | |

Constraints:
- `UNIQUE(requester_id, receiver_id)` — impede pedidos duplicados na mesma direção
- Índice composto `(requester_id, receiver_id)` para queries de amizade

**Query de amigos de X:**
```sql
SELECT
  CASE
    WHEN requester_id = X THEN receiver_id
    ELSE requester_id
  END AS friend_id
FROM friendships
WHERE (requester_id = X OR receiver_id = X)
  AND status = 'accepted'
```

### `user_blocks`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| blocker_id | uuid FK → users | cascade delete |
| blocked_id | uuid FK → users | cascade delete |
| created_at | timestamp with timezone | |

Constraints:
- `UNIQUE(blocker_id, blocked_id)`

### Alteração em tabela existente

`collectionVisibilityEnum` recebe o valor `friends_only` (migração adiciona ao enum existente).

---

## Arquitetura de Código

Segue o padrão hexagonal pragmático já estabelecido (routes → controller → service → repository).

```
src/modules/friends/
  friends.routes.ts
  friends.controller.ts
  friends.service.ts
  friends.repository.ts
  friends.schema.ts

src/shared/contracts/
  friends.repository.contract.ts    (novo)
```

Bloqueios ficam no módulo `friends` — são parte do grafo social e compartilham repositório e service.

DI manual em `app.ts`:
```
FriendsRepository → FriendsService → friendsRoutes
```

**Módulos existentes alterados:**
- `src/shared/infra/database/schema.ts` — 2 novas tabelas + `friends_only` no `collectionVisibilityEnum`
- `src/modules/users/users.service.ts` — lógica de `friends_only` no perfil usa `IFriendsRepository` para verificar amizade real
- `src/modules/collections/collections.service.ts` — `findPublicByUserId` aceita `friends_only` para amigos confirmados
- `src/app.ts` — DI e registro de rotas do módulo friends; injetar `FriendsRepository` em `UsersService` e `CollectionsService`

---

## Endpoints da API

Todas as rotas abaixo exigem autenticação JWT. O `user_id` é extraído do token — nunca da URL nas rotas protegidas.

### Amizades

```
POST   /friends/requests              enviar pedido de amizade
GET    /friends/requests/received     listar pedidos recebidos (status: pending)
GET    /friends/requests/sent         listar pedidos enviados (status: pending)
POST   /friends/requests/:id/accept   aceitar pedido
POST   /friends/requests/:id/reject   recusar pedido
GET    /friends                       listar meus amigos
DELETE /friends/:friendId             remover amigo
```

### Bloqueios

```
POST   /blocks/:userId                bloquear usuário
DELETE /blocks/:userId                desbloquear
GET    /blocks                        listar usuários bloqueados (eu bloqueei)
```

### Impacto em endpoints existentes

```
GET /users/:userId                     — respeita friends_only com verificação real de amizade
GET /users/:userId/collections         — inclui friends_only apenas para amigos
GET /users/:userId/collections/:id/items — segue visibilidade da coleção pai
```

---

## Regras de Negócio

### Ownership e segurança
- `user_id` sempre vem do JWT, nunca da URL nas rotas protegidas
- Recursos de outro usuário bloqueado retornam `404` (não vaza existência)

### Amizades
- Não pode enviar pedido para si mesmo → `400`
- Já existe relação (pending ou accepted) em qualquer direção → `409`
- Um dos dois bloqueou o outro → `404` (não vaza existência do bloqueio)
- Aceitar/recusar: apenas o `receiver_id` pode → `403` para o requester
- Remover amigo: qualquer um dos dois pode (deleta o único registro existente)

### Bloqueios
- Bloquear desfaz amizade se existir (delete em `friendships`)
- Bloquear cancela pedidos pendentes em ambas as direções (delete em `friendships`)
- Bloqueio é unilateral — o usuário bloqueado não é notificado; recebe `404` ao acessar recursos do bloqueador
- Desbloquear não restaura amizade anterior — precisam se readicionar manualmente

### Privacidade de perfil (`friends_only`)
- Amigo confirmado → retorna todos os campos do perfil
- Não-amigo autenticado → retorna apenas `id`, `displayName`, `avatarUrl`
- Não autenticado → retorna apenas `id`, `displayName`, `avatarUrl`
- Bloqueado → `404`

### Privacidade de coleções (`friends_only`)
- `GET /users/:userId/collections` — inclui coleções `friends_only` apenas se o requester for amigo confirmado
- `GET /users/:userId/collections/:id/items` — segue a visibilidade da coleção pai
- Requisição sem autenticação → trata como não-amigo (só vê `public`)
- Coleções `private` nunca aparecem para terceiros, independente de amizade

### Sem notificações nesta fase
- Pedidos de amizade e aceitações não geram e-mail nem push
- Notificações in-app ficam para a fase 4 (Feed)

---

## Testes

Seguindo o padrão do projeto (Vitest + mocks manuais das interfaces, sem testes de controller).

- `friends.service.test.ts` — envio de pedido (happy path, self-add, duplicado, bloqueado), aceitar, recusar, remover amigo, bloquear (desfaz amizade, cancela pendentes), desbloquear, listar amigos, listar pedidos
- `users.service.test.ts` — atualizar testes de `friends_only` para usar mock de `IFriendsRepository` (verificação real de amizade)
- `collections.service.test.ts` — atualizar listagem pública para cobrir `friends_only` com mock de amizade

---

## Fora de escopo (fases futuras)

- Notificações de pedido/aceite — fase 4 (Feed)
- Sugestões de amigos — fase 4
- `visibility = 'friends_only'` em itens individuais — não previsto
- Moderação de bloqueios por admin — fase 6
