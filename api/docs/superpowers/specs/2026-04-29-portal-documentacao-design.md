# Portal de Documentação — Design

**Data:** 2026-04-29
**Status:** Spec aprovado — aguardando plano de implementação
**Escopo:** Sub-projeto A (primeiro entregável). Sub-projetos B–D documentam módulos restantes; sub-projeto E faz polimento + deploy.

---

## Objetivo

Construir um portal de documentação técnica para o ecossistema Geek Social, com visual e UX similares à documentação da Anthropic (`docs.anthropic.com`), 100% open-source e self-hosted, sem custos recorrentes.

A documentação cobre, ao final dos sub-projetos A–E:
- Reference completo da API REST (uma página por endpoint)
- Dicionário de dados (uma página por tabela)
- ER diagram do banco
- Funcionamento detalhado por módulo (fluxos, eventos de socket, edge cases)
- Glossário, códigos de erro consolidados, tipos de notificação, eventos de socket

Este spec define o **sub-projeto A**: setup do projeto, pipeline de geração funcional, e o módulo **Auth** documentado end-to-end como modelo replicável para os módulos restantes.

---

## Stack

- **[Fumadocs](https://fumadocs.dev)** — framework de docs sobre Next.js, MDX-first, visual quase idêntico ao Mintlify; deploy como container standalone.
- **[Scalar](https://scalar.com)** (componente embeddable) — renderiza OpenAPI moderno (substitui Swagger UI), visual estilo Stripe.
- **[`@fastify/swagger`](https://github.com/fastify/fastify-swagger)** — gera OpenAPI 3.1 a partir das rotas Fastify usando os schemas Zod já existentes via `fastify-type-provider-zod`.
- **[`drizzle-dbml-generator`](https://github.com/RocketChat/drizzle-dbml-generator)** — exporta DBML do `schema.ts` do Drizzle.
- **[Mermaid](https://mermaid.js.org)** — sequence diagrams nos MDX (componente nativo Fumadocs).
- **[Orama](https://askorama.ai)** — search local-first (já incluído no Fumadocs).

Sem dependências de SaaS externos. Sem analytics, sem comentários, sem feedback widget no escopo inicial.

---

## Arquitetura

### Repos envolvidos

| Repo | Papel | Mudanças neste spec |
|------|-------|---------------------|
| `geek-social-api` | Backend Fastify | Adicionar `@fastify/swagger`, declarar `schema:` em todas as rotas Auth, scripts `export:openapi` e `export:dbml` |
| `geek-social-docs` | **Novo repo** com Fumadocs | Criação completa, setup, pipeline gen, conteúdo do módulo Auth |

### Localização

- `geek-social-docs` é um repo Gitea independente em `gitea.homelab-cloud.com:2222/admin/geek-social-docs.git`, clonado em `/home/dev/workspace_ssh/geek-social-docs/`.
- Vizinho ao `geek-social-api` no workspace, então scripts de sync usam path relativo `../geek-social-api/`.

### Fluxo de dados (pipeline auto-gen)

```
geek-social-api (backend)                geek-social-docs (Fumadocs)
─────────────────────────                ──────────────────────────
src/modules/auth/auth.routes.ts ─┐
   route.schema = { body: zod, ─┐│
                    response, ─┐││
                    tags } ────┘││
                                ││
@fastify/swagger ◄──────────────┘│
   ↓                             │
GET /docs/json                   │
   ↓                             │
npm run export:openapi           │
   ↓                             │
dist/openapi.json ───────────────┴──► public/openapi.json
                                          ↓
                                       npm run gen:endpoints
                                          ↓
                              content/api/<tag>/<operationId>.mdx
                                  (com blocos @manual preservados)

src/shared/infra/database/schema.ts
   ↓
drizzle-dbml-generator ◄─────────► dist/schema.dbml
   ↓                                  ↓
custom reflection ◄──────────────► dist/schema.json
                                       ↓
                                   public/schema.{dbml,json}
                                       ↓
                                   npm run gen:tables
                                       ↓
                          content/data-model/tables/<table>.mdx
                              (com blocos @manual preservados)
```

### Separação manual vs gerado: arquivos paralelos

Conteúdo manual e gerado vivem em **arquivos separados**, nunca no mesmo MDX. O gen só toca em arquivos sob `_generated/`; nunca sobrescreve uma página de mão.

**Estrutura:**

```
content/
├── api/
│   ├── auth/
│   │   ├── login.mdx                    ← PÁGINA. Manual. Importa partials gerados.
│   │   ├── register.mdx                 ← PÁGINA. Manual.
│   │   └── ...
│   └── _generated/                      ← Tudo aqui é sobrescrito a cada gen.
│       └── api/
│           └── auth/
│               ├── login/
│               │   ├── meta.mdx         ← método/path/auth badge
│               │   ├── request.mdx      ← tabela de body/query/path params
│               │   ├── responses.mdx    ← schemas por status code
│               │   ├── errors.mdx       ← tabela de códigos de erro
│               │   └── examples.mdx     ← cURL + Node fetch
│               ├── register/...
│               └── ...
└── data-model/
    ├── tables/
    │   ├── users.mdx                    ← PÁGINA. Manual.
    │   ├── refresh_tokens.mdx           ← PÁGINA. Manual.
    │   └── ...
    └── _generated/
        └── tables/
            ├── users/
            │   ├── columns.mdx
            │   ├── fks.mdx
            │   ├── indexes.mdx
            │   └── constraints.mdx
            └── ...
```

**Página manual importa os partials gerados:**

```mdx
---
title: POST /auth/login
description: Autentica usuário e emite tokens
---

import Meta from './_generated/api/auth/login/meta.mdx'
import Request from './_generated/api/auth/login/request.mdx'
import Responses from './_generated/api/auth/login/responses.mdx'
import Errors from './_generated/api/auth/login/errors.mdx'
import Examples from './_generated/api/auth/login/examples.mdx'

<Meta />

Autentica usuário via email/senha, emite par de tokens (access + refresh)
e cria registro em `refresh_tokens` para rotação. Cookies HttpOnly são
setados na resposta.

## Request

<Request />

## Response

<Responses />

## Erros

<Errors />

(prose manual explicando como resolver cada código...)

## Exemplos

<Examples />

## Side effects

(prose manual: eventos de socket emitidos, notificações disparadas, etc.)

## Relacionados

(links manuais)
```

**Comportamento do gen:**

- `npm run gen` apaga e re-cria tudo sob `_generated/`. Sempre. Sem merge, sem parsing — operação trivialmente correta.
- Se a página manual (ex: `login.mdx`) **não existir**, o gen cria a partir de um template stub com os imports e `TODO:` nos blocos manuais. Ao rodar gen novamente, se o arquivo já existe, **nunca é tocado**.
- Endpoint deletado da fonte: o partial em `_generated/` desaparece naturalmente. A página manual fica órfã com import quebrado — Next.js falha o build, alertando o autor pra remover/atualizar manualmente. Ideal: erro claro em vez de exclusão silenciosa.
- Conteúdo gerado é sempre referente a uma única operação (login, register, etc.), nunca a múltiplas — cada partial é independente e versionável.

---

## Estrutura de conteúdo (sidebar)

```
📘 Introdução
   ├── Visão geral do produto       [escrito no sub-projeto A]
   ├── Stack e arquitetura          [escrito no sub-projeto A]
   └── Setup local                  [escrito no sub-projeto A]

🧩 Conceitos
   ├── Autenticação                 [escrito no sub-projeto A]
   ├── Convenções de erro           [escrito no sub-projeto A — versão inicial]
   ├── Realtime (sockets)           [placeholder "Em breve"]
   ├── Storage (MinIO)              [placeholder "Em breve"]
   └── Notificações                 [placeholder "Em breve"]

🔌 API Reference
   ├── Visão geral                  [escrito no sub-projeto A]
   ├── Auth/                        [10 páginas com manual completo — sub-projeto A]
   ├── Users/                       [item visível na sidebar com badge "Em breve" — schema: ainda não declarado]
   ├── Friends/                     [idem]
   ├── Collections/                 [idem]
   ├── Items/                       [idem]
   ├── Steam/                       [idem]
   ├── Listings/                    [idem]
   ├── Offers/                      [idem]
   ├── Listing Ratings/             [idem]
   ├── Chat/                        [idem]
   ├── Notifications/               [idem]
   ├── Posts/Feed/                  [idem]
   └── Reports/                     [idem]

(API Reference só tem auto-gen pra módulos cujas rotas já declararam `schema:`. Como o backend só ganha `schema:` no Auth durante o sub-projeto A, os outros módulos aparecem na sidebar como placeholders. Sub-projetos B–D adicionam `schema:` e prose manual conforme cobrem cada módulo.)

🗃️ Banco de dados
   ├── ER Diagram                   [escrito no sub-projeto A — completo, auto-gerado de schema.dbml]
   ├── Convenções                   [escrito no sub-projeto A]
   ├── Migrations                   [escrito no sub-projeto A]
   └── Tabelas/                     [TODAS as tabelas auto-geradas no sub-projeto A]
       ├── users                    [auto + manual completo — sub-projeto A]
       ├── refresh_tokens           [auto + manual completo — sub-projeto A]
       └── (todas as outras)        [auto-gen presente; prose manual fica como TODO até sub-projetos B–D]

⚙️ Módulos
   ├── Auth                         [escrito no sub-projeto A]
   └── (outros placeholders)        [placeholder "Em breve"]

📖 Referência
   ├── Glossário                    [escrito no sub-projeto A — termos do Auth]
   ├── Códigos de erro              [escrito no sub-projeto A — só erros do Auth]
   ├── Eventos de socket            [placeholder "Em breve"]
   └── Tipos de notificação         [placeholder "Em breve"]
```

Itens `[placeholder "Em breve"]` aparecem na sidebar com badge cinza desabilitado, mas a estrutura completa é visível pra dar dimensão do escopo final ao leitor.

---

## Templates de página

### Página de endpoint (manual, importa gerados)

Vide bloco "Página manual importa os partials gerados" acima. Adicionalmente, cada página de endpoint embeda um `<Scalar />` filtrado pelo `operationId`, dando ao leitor um sandbox interativo logo abaixo da prose.

### Página de tabela (manual, importa gerados)

```mdx
---
title: users
description: Tabela de contas de usuário
---

import Columns from './_generated/data-model/tables/users/columns.mdx'
import Fks from './_generated/data-model/tables/users/fks.mdx'
import Indexes from './_generated/data-model/tables/users/indexes.mdx'
import Constraints from './_generated/data-model/tables/users/constraints.mdx'

(prose manual: 1 parágrafo sobre propósito da tabela)

## Colunas

<Columns />

## Funcionalidade dos campos

(prose manual: explicação por campo do que representa no domínio)

## Foreign keys

<Fks />

## Índices

<Indexes />

(prose manual: por que cada índice parcial existe, que query otimiza)

## Constraints

<Constraints />

## Tabelas relacionadas

(links manuais)
```

### Página de módulo (100% manual)

```mdx
---
title: Auth
description: Registro, login, OAuth, refresh, reset de senha
---

## Visão geral
<!-- 2-3 parágrafos sobre o que o módulo faz e regras de negócio -->

## Entidades principais
<!-- links pras tabelas: users, refresh_tokens -->

## Endpoints
<!-- links pra todos os endpoints do módulo na API Reference -->

## Fluxos

### Registro com email/senha
<Mermaid>
sequenceDiagram
  ...
</Mermaid>

### Login com email/senha
<Mermaid>...</Mermaid>

### Login com Google OAuth
<Mermaid>...</Mermaid>

### Refresh token rotation
<Mermaid>...</Mermaid>

### Reset de senha
<Mermaid>...</Mermaid>

## Eventos de socket
<!-- emitidos e consumidos pelo módulo -->

## Edge cases e regras especiais
<!-- token expirado, refresh rotation, conta deletada com refresh ativo, etc. -->

## Dependências entre módulos
<!-- ex: outros módulos esperam `request.user.id` setado pelo middleware authenticate -->
```

---

## Sub-projeto A — escopo

### A.1 Backend (`geek-social-api`)

**Dependências adicionadas:**
- `@fastify/swagger` (latest)
- `fastify-type-provider-zod` (já presente — verificar versão)
- `drizzle-dbml-generator` (latest, dev dep)

**Mudanças no código:**
- Registrar `@fastify/swagger` em `app.ts` antes de qualquer `register` de rotas, configurado com `transform: jsonSchemaTransform` do `fastify-type-provider-zod`
- Configurar OpenAPI metadata: title, version, description, servers, securitySchemes (cookie auth)
- Em **cada** rota do módulo Auth (`auth.routes.ts` + `google.strategy.ts`), adicionar `schema:` declarando:
  - `body` (referenciando schema Zod já existente)
  - `response` por status code (200/201, e os 4xx específicos com `errorResponseSchema`)
  - `tags: ['Auth']`
  - `description` curta (1 frase) — versão completa fica no MDX
  - `operationId` explícito (ex: `auth_login`) pra estabilidade do filename gerado
- Atualizar `auth.schema.ts` se algum endpoint hoje não tiver schema Zod (ex: `/logout` retorna `204` mas precisa declarar)
- Schema Zod compartilhado `errorResponseSchema` em `shared/contracts/` (se ainda não existir como schema único) — referenciado por todos os 4xx

**Endpoints do módulo Auth (10 ao total):**
1. `POST /auth/register`
2. `POST /auth/login`
3. `POST /auth/refresh`
4. `POST /auth/logout`
5. `POST /auth/forgot-password`
6. `POST /auth/reset-password`
7. `PUT /auth/change-password` (auth required)
8. `POST /auth/set-password` (auth required)
9. `GET /auth/google`
10. `GET /auth/google/callback`

**Scripts novos no `package.json`:**
- `"export:openapi"` — sobe servidor headless, fetcha `/docs/json`, salva em `dist/openapi.json`, mata servidor. Implementação em `scripts/export-openapi.ts`.
- `"export:dbml"` — chama `drizzle-dbml-generator` programaticamente, salva `dist/schema.dbml` + `dist/schema.json` (este último com metadata estendido pra colunas/índices/FKs/constraints, extraído via reflection do Drizzle metadata).
- `"export:all"` — roda os dois acima.

**Endpoint `/docs/json` exposto só em dev** — gating via `if (process.env.NODE_ENV !== 'production')` no register.

### A.2 Docs (`geek-social-docs`)

**Setup:**
- `npm create fumadocs-app@latest` na raiz, template "Fumadocs MDX"
- Stack: Next.js 15+, Fumadocs UI, Fumadocs MDX
- Estrutura de diretórios:
  ```
  geek-social-docs/
  ├── app/                  ← Next.js app router (gerado por Fumadocs)
  ├── content/              ← MDX
  │   ├── intro/
  │   ├── concepts/
  │   ├── api/auth/
  │   ├── data-model/tables/
  │   ├── modules/
  │   └── reference/
  ├── components/           ← <Mermaid>, <Scalar>, <ComingSoon>, <ErrorTable>
  ├── public/
  │   ├── openapi.json      ← syncado do backend
  │   ├── schema.dbml
  │   └── schema.json
  ├── scripts/
  │   ├── sync-from-api.ts  ← copia artifacts do ../geek-social-api
  │   ├── gen-endpoints.ts  ← lê openapi.json → MDX (preserva @manual)
  │   ├── gen-tables.ts     ← lê schema.json → MDX (preserva @manual)
  │   └── lib/mdx-merge.ts  ← parse + merge de blocos @generated/@manual
  ├── meta.json             ← navegação Fumadocs com placeholders "Em breve"
  ├── source.config.ts
  └── package.json
  ```

**Tema (estilo Anthropic):**
- Cores: paleta neutra com acento (similar ao tom claro/escuro de docs.anthropic.com); detalhes em `globals.css`
- Tipografia: Inter (UI) + JetBrains Mono (código)
- Sidebar à esquerda, TOC à direita, conteúdo central com `max-w-3xl`
- Header com logo placeholder, search, dark mode toggle
- Code blocks com tabs (Fumadocs `<Tabs>` nativo) — exemplos cURL e Node.fetch lado a lado quando aplicável
- Componente `<ComingSoon />` que renderiza placeholder estilizado nas páginas vazias

**Componentes custom:**
- `<Mermaid>` — wrapper sobre `mermaid` lib (Fumadocs já tem exemplo oficial de integração)
- `<Scalar operationId="auth_login" />` — wrapper sobre `@scalar/api-reference-react` que filtra o OpenAPI pelo `operationId`
- `<ErrorTable codes={[...]} />` — renderiza tabela códigos de erro consultando `errorResponseSchema` exportado num JSON build-time (gerado pelo `gen:endpoints`)
- `<ComingSoon />` — bloco visual indicando seção em construção

**Scripts:**
- `"sync"` — `tsx scripts/sync-from-api.ts` — `cp` dos artifacts (ou `bun copy`); falha clara se backend não foi buildado
- `"gen:endpoints"` — `tsx scripts/gen-endpoints.ts`
- `"gen:tables"` — `tsx scripts/gen-tables.ts`
- `"gen"` — roda os dois acima
- `"dev"` — `next dev` (Fumadocs default)
- `"build"` — `next build`
- `"start"` — `next start`

**Search:**
- Orama indexer rodando em build-time (Fumadocs default)
- Indexa títulos, headings, prose; ignora blocos de código gigantes (limite Fumadocs)

### A.3 Conteúdo escrito (sub-projeto A)

Conteúdo manual a ser escrito (prose em PT):

| Página | Linhas estimadas |
|--------|------------------|
| `intro/visao-geral.mdx` | 80–120 |
| `intro/stack.mdx` | 60–100 |
| `intro/setup-local.mdx` | 100–150 |
| `concepts/autenticacao.mdx` | 200–300 (com sequence diagram) |
| `concepts/convencoes-erro.mdx` | 80–120 |
| `api/visao-geral.mdx` | 60–100 |
| `api/auth/<10 endpoints>.mdx` | ~50–80 linhas manuais por endpoint × 10 |
| `data-model/er-diagram.mdx` | 40–80 (Mermaid + link dbdiagram.io) |
| `data-model/convencoes.mdx` | 80–120 |
| `data-model/migrations.mdx` | 80–120 |
| `data-model/tables/users.mdx` | 80–150 manuais |
| `data-model/tables/refresh_tokens.mdx` | 60–100 manuais |
| `modules/auth.mdx` | 300–500 (com 5 sequence diagrams) |
| `reference/glossario.mdx` | 80–150 (termos do Auth) |
| `reference/codigos-erro.mdx` | 100–200 (só erros do módulo Auth) |

(Linhas estimadas pra dimensionar o trabalho — não são metas rígidas)

---

## Decisões e tradeoffs

### Por que repo separado e não pasta `docs/` no backend
- Deploy independente: docs podem ser atualizadas/buildadas sem rebuild do backend
- Linguagem diferente (Next.js vs Fastify), tooling diferente, ciclo de release diferente
- Coerente com padrão do workspace (frontend, database, docs cada um no seu repo)
- Custo: requer sync explícito dos artifacts (vs auto-disponibilidade num monorepo) — mitigado pelo script `sync` simples

### Por que uma página por endpoint vs agrupado por módulo
- URL linkável e estável (`docs/api/auth/login` vs scroll deep-linking)
- Search retorna resultado granular
- Padrão Anthropic, Stripe, GitHub
- Custo: mais arquivos — mitigado pela auto-geração

### Por que arquivos paralelos em vez de blocos `@manual` no mesmo MDX
- Separação clara de propriedade: arquivos sob `_generated/` são "code", páginas manuais são conteúdo editorial
- Gen é trivial: `rm -rf _generated && regenerar` — sem parser, sem merge, sem risco de corromper texto manual
- Endpoint deletado: import quebrado faz Next.js falhar build, alertando autor (vs exclusão silenciosa de blocos)
- Diff-friendly: PRs do gen só mexem em `_generated/`, fáceis de revisar
- Custo: leitor da página vê imports no topo do arquivo — minimal

### Por que Fumadocs em vez de Mintlify, Docusaurus, VitePress, Nextra
- **Mintlify** — fechado, $$, requer SaaS deles
- **Docusaurus** — visual datado, customização exige hack
- **VitePress** — bom mas visual padrão é menos polido que Fumadocs
- **Nextra** — ótimo, mas Fumadocs tem visual mais próximo do alvo Anthropic e é mais ativo em 2026

### Por que Scalar e não Swagger UI ou Redoc
- **Swagger UI** — visual datado
- **Redoc** — bom mas menos interativo
- **Scalar** — visual moderno (estilo Stripe), embeddable em React, open-source

### Por que `drizzle-dbml-generator` em vez de gerar tudo na mão
- DBML é formato da indústria, abre direto no dbdiagram.io
- Mantém ER diagram em sync sem trabalho manual
- Custo: dep extra — minimal

### Por que NÃO usar Storybook ou Histoire
- Documentação é de **API/banco/regras de negócio**, não de componentes UI. Storybook é a ferramenta errada pro problema.

---

## Critério de pronto (sub-projeto A)

1. `cd /home/dev/workspace_ssh/geek-social-docs && npm run dev` sobe servidor em `localhost:3000` sem warnings críticos
2. Sidebar mostra hierarquia completa da seção "Estrutura de conteúdo" acima; itens ainda não populados aparecem com `<ComingSoon />` ou badge "Em breve"
3. Toda a seção Auth é navegável end-to-end:
   - Visão geral do produto → Conceito de Autenticação → API Reference Auth (10 endpoints) → Tabelas users/refresh_tokens → Módulo Auth (com sequence diagrams) → Glossário (termos Auth) → Códigos de erro (Auth)
4. Pipeline funcional:
   - `cd geek-social-api && npm run export:all` gera `dist/openapi.json` + `dist/schema.dbml` + `dist/schema.json`
   - `cd geek-social-docs && npm run sync && npm run gen` atualiza tudo sob `_generated/`
   - Editar uma página manual (ex: `content/api/auth/login.mdx`), depois rodar `npm run gen` novamente: o arquivo manual continua intacto, `_generated/` é re-gerado do zero
   - Todas as tabelas do `schema.ts` aparecem em `data-model/tables/` — auto-gen presente pra todas, prose manual completa só pra `users`/`refresh_tokens`
5. Mermaid renderiza nos sequence diagrams da página Auth (módulo) e da página Conceito de Autenticação
6. `<Scalar />` embeddado funciona em pelo menos um endpoint Auth
7. Search Orama encontra termos: "login", "refresh", "ALREADY_LOGGED", "users.email"
8. Dark mode default + toggle funcional, sem flash em reload
9. Build de produção (`npm run build && npm start`) roda sem erros
10. `errorResponseSchema` enum (códigos de erro tipados) é a fonte de verdade — modificar um código no backend, rodar `export:openapi`, `sync`, `gen`, e a tabela de erros do endpoint correspondente no MDX gerado reflete a mudança

---

## Sub-projetos futuros (fora do escopo deste spec)

Cada sub-projeto reaproveita o pipeline e templates do A. O trabalho é majoritariamente:
- Adicionar `schema:` nas rotas dos módulos correspondentes (no backend)
- Rodar `npm run gen` (cria stubs de páginas manuais pros novos endpoints)
- Preencher os stubs manuais (descrições, side-effects, related)
- Escrever prose manual nas páginas de tabela já existentes
- Escrever a página de módulo manual (visão geral + sequence diagrams + edge cases)

| Sub-projeto | Módulos cobertos |
|-------------|------------------|
| **B** | Users, Friends, Collections, Items |
| **C** | Steam Integration, Listings, Offers, Listing Ratings |
| **D** | Chat, Notifications, Posts/Feed, Reports, Profile customization |
| **E** | Polimento (ER completo, tabelas consolidadas de erros/sockets/notifs) + deploy (Dockerfile, CI Gitea Actions, Nginx, Certbot, domínio `docs.homelab-cloud.com`) |

---

## Riscos conhecidos

- **`fastify-type-provider-zod` + `@fastify/swagger`** — combinação pode exigir versão específica pra OpenAPI 3.1; validar compatibilidade com Zod 4 logo no começo do plano de implementação. Fallback: gerar OpenAPI manualmente a partir de `zod-to-openapi`.
- **`drizzle-dbml-generator`** — não cobre 100% dos casos do schema (índices parciais, generated columns); validar com o schema atual; fallback é ler os ASTs do Drizzle direto.
- **Scalar React component** — em dev pode ter problema de hidration com Next App Router; mitigação é importar com `dynamic({ ssr: false })`.
- **Stubs de páginas manuais sobrescrevendo trabalho** — gen NÃO toca arquivos existentes; só cria stubs pra arquivos ausentes. Garantia técnica: checagem `if (existsSync(targetPath)) return` antes de escrever stub manual.
- **Tema Fumadocs vs visual Anthropic** — visual exato do Anthropic é difícil de replicar 100%; objetivo é "família" Anthropic, não pixel-perfect.
