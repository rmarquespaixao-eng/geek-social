# Sub-projeto 2 — Coleções e Itens

**Data:** 2026-04-23
**Status:** Aprovado

---

## Contexto

Sistema de coleções para a rede social geek. O usuário cria coleções de tipos padrão (jogos, livros, card games, boardgames) ou customizadas, e popula com itens. Cada tipo tem campos padrão pré-definidos; coleções customizadas permitem ao usuário criar e reutilizar seus próprios campos.

---

## Modelo de Dados

### `collections`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| name | varchar(100) | obrigatório |
| description | text | opcional |
| icon_url | varchar | opcional |
| cover_url | varchar | opcional |
| type | enum: `games/books/cardgames/boardgames/custom` | imutável após criação |
| visibility | enum: `public/private` | `friends_only` adicionado na fase 3 |
| created_at | timestamp with timezone | |
| updated_at | timestamp with timezone | |

### `field_definitions`

Descreve um campo disponível para uso em coleções. Campos de tipos padrão têm `is_system = true` e `user_id = null`.

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | null = campo de sistema (tipo padrão) |
| name | varchar(100) | ex: "Plataforma" |
| field_key | varchar(50) | snake_case único por usuário; ex: `platform` |
| field_type | enum: `text/number/date/boolean/select` | |
| select_options | JSONB | apenas para `select`; ex: `["PS2","PS3","PC"]` |
| is_system | boolean | true = imutável, não pode ser editado/excluído pelo usuário |

### `collection_field_schema`

Liga quais `field_definitions` pertencem a cada coleção.

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| collection_id | uuid FK → collections | cascade delete |
| field_definition_id | uuid FK → field_definitions | |
| is_required | boolean | |
| display_order | integer | ordenação na UI |

### `items`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| collection_id | uuid FK → collections | cascade delete |
| name | varchar(200) | obrigatório — campo mínimo de qualquer coleção, inclusive custom |
| cover_url | varchar | opcional — sempre disponível, inclusive custom |
| fields | JSONB | valores dos campos definidos no `collection_field_schema` |
| rating | smallint | 1–5, null = sem avaliação |
| comment | text | opcional |
| created_at | timestamp with timezone | |
| updated_at | timestamp with timezone | |

---

## Campos Padrão por Tipo (Seeds)

Inseridos via seed com `is_system = true`, `user_id = null`. Idempotente por `field_key`.

### Jogos (`games`)
| field_key | name | type |
|---|---|---|
| platform | Plataforma | select |
| genre | Gênero | text |
| release_year | Ano de lançamento | number |
| developer | Desenvolvedor | text |
| status | Status | select (`Em andamento`, `Zerado`, `Na fila`) |
| completion_date | Data que zerou | date |

### Livros (`books`)
| field_key | name | type |
|---|---|---|
| author | Autor | text |
| publisher | Editora | text |
| publication_year | Ano de publicação | number |
| genre | Gênero | text |
| page_count | Número de páginas | number |
| isbn | ISBN | text |
| status | Status | select (`Quero ler`, `Lendo`, `Lido`) |

### Card Games (`cardgames`)
| field_key | name | type |
|---|---|---|
| game_base | Jogo base | select (`Magic`, `Pokémon`, `Yu-Gi-Oh`, `Outro`) |
| rarity | Raridade | text |
| condition | Condição | select (`Mint`, `Near Mint`, `Played`) |
| quantity | Quantidade | number |

### Board Games (`boardgames`)
| field_key | name | type |
|---|---|---|
| publisher | Editora | text |
| release_year | Ano | number |
| min_players | Jogadores (mín) | number |
| max_players | Jogadores (máx) | number |
| play_time | Tempo de partida (min) | number |
| genre | Gênero/Mecânica | text |
| status | Status | select (`Tenho`, `Quero`, `Emprestado`) |

---

## Arquitetura de Código

Segue o padrão hexagonal pragmático já estabelecido (routes → controller → service → repository).

```
src/modules/collections/
  collections.routes.ts
  collections.controller.ts
  collections.service.ts
  collections.repository.ts
  collections.schema.ts

src/modules/items/
  items.routes.ts
  items.controller.ts
  items.service.ts
  items.repository.ts
  items.schema.ts

src/shared/contracts/
  collection.repository.contract.ts    (novo)
  item.repository.contract.ts          (novo)

src/shared/infra/database/seeds/
  field-definitions.seed.ts            (novo)
```

O seed é executado no `buildApp()` logo após as migrations, usando upsert por `field_key`.

DI manual em `app.ts`:
```
CollectionsRepository → CollectionsService → collectionsRoutes
ItemsRepository → ItemsService → itemsRoutes
```

---

## Endpoints da API

Todas as rotas abaixo de `/collections` e `/field-definitions` exigem autenticação JWT. O `user_id` é extraído do token — nunca da URL nas rotas protegidas.

### Coleções

```
POST   /collections                           criar coleção
GET    /collections                           listar minhas coleções (?q= busca por nome)
GET    /collections/:id                       detalhe + field schema
PUT    /collections/:id                       editar nome, descrição, visibilidade
DELETE /collections/:id                       excluir (cascade nos itens)
POST   /collections/:id/icon                  upload ícone → S3 (Sharp → WebP)
POST   /collections/:id/cover                 upload capa → S3 (Sharp → WebP)
```

### Itens

```
POST   /collections/:id/items                 criar item
GET    /collections/:id/items                 listar itens (?q= busca em name + fields JSONB)
GET    /collections/:id/items/:itemId         detalhe do item
PUT    /collections/:id/items/:itemId         editar item
DELETE /collections/:id/items/:itemId         excluir item
POST   /collections/:id/items/:itemId/cover   upload capa do item → S3
```

### Definições de campos customizados

```
GET    /field-definitions                     listar definições do usuário (reutilizáveis)
POST   /field-definitions                     criar nova definição
DELETE /field-definitions/:id                 excluir (bloqueado se estiver em uso)
```

### Acesso público (sem auth)

```
GET    /users/:userId/collections             coleções públicas de um usuário
GET    /users/:userId/collections/:id/items   itens de uma coleção pública
```

---

## Regras de Negócio

### Ownership e segurança
- `user_id` sempre vem do JWT, nunca da URL nas rotas protegidas
- Recursos de outro usuário retornam `404` (não vaza existência)
- Rotas públicas filtram por `visibility = 'public'`

### Coleções
- Tipo é imutável após criação
- Ao criar coleção de tipo padrão, o sistema popula automaticamente o `collection_field_schema` com os campos `is_system = true` do tipo correspondente
- Ao criar coleção `custom`, o `collection_field_schema` começa vazio
- Upload de ícone/capa: Sharp → WebP, S3 (mesmo padrão do perfil de usuário)

### Itens
- `name` é obrigatório em todo item, inclusive custom
- `cover_url` é sempre disponível para upload, inclusive custom
- O JSONB `fields` é validado no service contra o `collection_field_schema`: campos com `is_required = true` precisam estar presentes; tipos são verificados (ex: `number` aceita apenas número, `date` aceita ISO 8601, `boolean` aceita true/false, `select` aceita apenas valores dentro do `select_options`)
- `rating` aceita apenas 1–5 (null = sem avaliação)
- Busca `?q=` usa `ILIKE` no `name` + busca nos valores texto do JSONB

### Campos customizados
- `field_key` é gerado automaticamente a partir do `name` via slug (remove acentos, lowercase, espaços → underscore; ex: `"Número de Série"` → `numero_de_serie`)
- `field_key` deve ser único por usuário (constraint `UNIQUE(user_id, field_key)`); campos de sistema têm unicidade própria (`user_id = null`)
- Uma definição com `is_system = true` não pode ser editada nem excluída pelo usuário
- Uma definição não pode ser excluída se houver referências em `collection_field_schema`

---

## Testes

Seguindo o padrão do sub-projeto 1 (Vitest + mocks manuais das interfaces, sem testes de controller).

- `collections.service.test.ts` — criação, listagem, edição, exclusão, ownership, population do field schema nos tipos padrão
- `items.service.test.ts` — CRUD, validação de campos obrigatórios, validação de tipos no JSONB, rating
- `field-definitions.service.test.ts` — criação, reutilização, bloqueio de exclusão quando em uso
- Integration test (Testcontainers): fluxo completo criação de coleção → seed dos campos → adição de item → busca → exclusão em cascade

---

## Fora de escopo (fases futuras)

- `visibility = 'friends_only'` — fase 3 (Sistema de amigos)
- Integrações externas (Steam, Epic, bases públicas) — fase 7
- Endpoints de adicionar/remover campos de uma coleção existente — pode ser incluído após validação do fluxo básico
