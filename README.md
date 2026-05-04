# geek-social

**geek-social** é uma plataforma para quem quer montar sua própria comunidade em torno de gostos compartilhados — games, board games, livros, card games ou qualquer outra coleção de nicho.

A ideia é simples: cada usuário cria suas **coleções** (jogos que tem, livros lidos, board games na prateleira), compartilha no **feed**, troca itens com outros colecionadores pela **vitrine**, bate papo em **DMs criptografadas** e encontra pessoas com os mesmos interesses em **comunidades temáticas** — tudo em uma plataforma auto-hospedada e 100% open source.

**O que tem hoje:**
- Coleções tipadas com schema dinâmico + integração IGDB (busca de jogos automática)
- Feed social com posts, reactions e comentários
- Chat em tempo real com E2E (Signal Protocol) para DMs + chamadas de vídeo/áudio
- Comunidades estilo Orkut — tópicos, membros, moderação, audit log
- Vitrine de troca/venda com counter-propostas e avaliações
- Eventos presenciais e online com lista de espera e lembretes automáticos
- Integração Steam (importação de biblioteca em batch)
- Painel de administração + feature flags + audit log de moderação

---

> **Status**: alpha pública. Quebra de API e schema esperada entre versões.

**📖 Documentação completa:** [geeksocial.doc.rafaelmarquesdev.com](https://geeksocial.doc.rafaelmarquesdev.com)

## Sumário

- [Estrutura](#estrutura)
- [Como rodar (Docker — 1 comando)](#como-rodar-docker--1-comando)
- [Primeiros passos](#primeiros-passos)
  - [1. Acessar o Frontend](#1-acessar-o-frontend)
  - [2. Acessar a API](#2-acessar-a-api)
  - [3. Acessar a Documentação](#3-acessar-a-documentação)
  - [4. Acessar o MinIO (S3 local)](#4-acessar-o-minio-s3-local)
  - [5. Acessar o Postgres](#5-acessar-o-postgres)
- [Stack](#stack)
- [Comandos úteis](#comandos-úteis)
- [Setup manual (sem Docker)](#setup-manual-sem-docker)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Testes](#testes)
- [Licença](#licença)

## Estrutura

```
geek-social/
├── api/        Backend Fastify + TypeScript + Drizzle + PostgreSQL
├── frontend/   SPA Vue 3 + Vite + Pinia + Tailwind + PWA
├── docs/       Site de documentação Next.js + Fumadocs
├── db/         Scripts de inicialização do Postgres
├── docker-compose.yml
└── .env.example
```

## Como rodar (Docker — 1 comando)

**Pré-requisitos:** Docker + Docker Compose v2.

```bash
git clone https://github.com/rmarquespaixao-eng/geek-social.git
cd geek-social
docker compose up -d
```

Esse comando sobe **6 serviços**:

| Serviço          | Imagem / origem      | Porta   |
| ---------------- | -------------------- | ------- |
| `db`             | `postgres:17-alpine` | 5432    |
| `minio`          | `minio/minio`        | 9000/01 |
| `minio-init`     | `minio/mc` (one-shot) | —      |
| `api-migrate`    | build `./api` (one-shot, roda Drizzle migrations) | — |
| `api`            | build `./api`        | 3000    |
| `frontend`       | build `./frontend`   | 8080    |
| `docs`           | build `./docs`       | 3030    |

A primeira execução demora alguns minutos (build das 3 imagens Node).
Depois, `docker compose up -d` levanta tudo em segundos.

**Acompanhe a inicialização:**

```bash
docker compose ps              # status dos containers
docker compose logs -f api     # logs da API ao vivo
```

A API está pronta quando aparece `Server listening at http://0.0.0.0:3000`.

> **DEV-ONLY**: o compose já vem com `JWT_SECRET`, par VAPID e senhas
> hardcoded para dev. Pra produção, copie `.env.example` → `.env` e
> sobrescreva os secrets antes de subir.

## Primeiros passos

### 1. Acessar o Frontend

Abra **http://localhost:8080** no navegador.

A SPA é uma PWA — pode ser instalada como app. No primeiro acesso:

1. Clique em **Criar conta** (ou navegue até `/register`).
2. Preencha:
   - **E-mail** (qualquer válido — não há verificação por e-mail no alpha local)
   - **Senha** (mínimo 8 caracteres)
   - **Nome de exibição**
3. Após registro, você é autenticado automaticamente e redirecionado pro feed.
4. Crie sua primeira coleção, adicione itens, faça um post — explore.

### 2. Acessar a API

Base URL: **http://localhost:3000**

**Healthcheck rápido:**

```bash
curl http://localhost:3000/docs/json | head -5
```

Retorna o spec OpenAPI 3.0 em JSON.

**Registrar usuário via curl:**

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "senha-segura-123",
    "displayName": "Alice"
  }'
```

Resposta `201`:

```json
{
  "accessToken": "eyJhbGc...",
  "user": { "id": "uuid", "email": "alice@example.com", "displayName": "Alice" }
}
```

O refresh token vem como cookie `HttpOnly` (`refresh_token`).

**Login:**

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "alice@example.com", "password": "senha-segura-123" }'
```

**Chamada autenticada (acessar próprio perfil):**

```bash
TOKEN="eyJhbGc..."   # accessToken da resposta acima
curl http://localhost:3000/users/me -H "Authorization: Bearer $TOKEN"
```

**Principais grupos de endpoints** (todos documentados na seção 3):

| Prefixo                    | O quê                                              |
| -------------------------- | -------------------------------------------------- |
| `/auth`                    | register, login, refresh, logout, password reset   |
| `/users`                   | perfis, avatar, busca, profile posts               |
| `/collections`             | coleções tipadas + dashboard de stats              |
| `/collections/:id/items`   | itens com schema dinâmico, filtros e cursor page   |
| `/collections/items`       | listagem global cross-coleção                      |
| `/integrations/igdb`       | busca de jogos via IGDB com preenchimento auto     |
| `/integrations/steam`      | vinculação + importação de biblioteca Steam        |
| `/posts`                   | posts no feed (texto + mídia)                      |
| `/feed`                    | timeline cronológica                               |
| `/friends`                 | amigos, pedidos, bloqueios                         |
| `/chat`                    | DMs E2E + grupos (Socket.IO em `/socket.io`)       |
| `/notifications`           | inbox + Web Push (VAPID)                           |
| `/listings`                | anúncios (venda/troca)                             |
| `/offers`                  | ofertas + counter-propostas + confirmação dual     |
| `/communities`             | comunidades, membros, tópicos, moderação           |
| `/events`                  | eventos presenciais/online + lista de espera       |
| `/reports`                 | denúncias em 5 superfícies                         |
| `/admin`                   | painel de moderação (role admin)                   |

### 3. Acessar a Documentação

**Portal público (produção):** [geeksocial.doc.rafaelmarquesdev.com](https://geeksocial.doc.rafaelmarquesdev.com)

**Ambiente local:** http://localhost:3030

O site usa **Fumadocs** + **Scalar API Reference**. Você encontra:

- **Visão geral** do projeto e roadmap
- **Referência da API** (renderização interativa do OpenAPI — dá pra testar endpoints direto da página)
- **Schema do banco** (28 tabelas com ER diagrams Mermaid)
- **Guias** de fluxos comuns (auth, upload, chat, coleções)

A documentação é gerada a partir do código da API. Pra atualizar quando você mexer em rotas/schema:

```bash
docker compose exec api npm run export:all     # exporta openapi.json + dbml
docker compose exec docs npm run gen           # regenera tabelas/endpoints no docs
docker compose restart docs
```

### 4. Acessar o MinIO (S3 local)

Console web: **http://localhost:9001**

Login:

- **Usuário:** `minioadmin`
- **Senha:** `minioadmin`

O bucket `geek-social-media` é criado automaticamente pelo serviço
`minio-init` no primeiro `up`. Uploads do app (avatares, mídia de posts,
mensagens) caem nesse bucket. A URL pública usa `http://localhost:9000/geek-social-media/<key>`.

Para usar via CLI:

```bash
docker compose exec minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker compose exec minio mc ls local/geek-social-media
```

### 5. Acessar o Postgres

```bash
docker compose exec db psql -U dev -d geek_social
```

Senha: `dev`. Bancos disponíveis: `geek_social` (principal) e `geek_social_jobs` (filas pg-boss).

Cliente externo (DBeaver, TablePlus, psql local): `postgresql://dev:dev@localhost:5432/geek_social`.

## Stack

| Projeto    | Stack principal                                              | Porta dev (manual) | Porta Docker |
| ---------- | ------------------------------------------------------------ | ------------------ | ------------ |
| `api`      | Fastify 5, Drizzle ORM, Postgres 17, Socket.io, Zod, JWT     | 3000               | 3000         |
| `frontend` | Vue 3, Vite, Pinia, Vue Router, Tailwind 4, vite-plugin-pwa  | 5173               | 8080 (nginx) |
| `docs`     | Next.js 16, Fumadocs MDX, Scalar API Reference, Mermaid      | 3030               | 3030         |

**Infra (apenas Docker):** Postgres 17 (`:5432`) + MinIO S3-compatível (`:9000` / `:9001`).

## Comandos úteis

```bash
# Status / logs
docker compose ps
docker compose logs -f                # todos serviços
docker compose logs -f api            # só a API

# Parar
docker compose stop                   # pausa (mantém dados e containers)
docker compose down                   # remove containers (mantém volumes)
docker compose down -v                # remove TUDO, inclusive Postgres + MinIO

# Rebuild após mudar código
docker compose up -d --build api
docker compose up -d --build frontend
docker compose up -d --build docs

# Entrar num container
docker compose exec api sh
docker compose exec db psql -U dev -d geek_social

# Reaplicar migrations manualmente
docker compose run --rm api-migrate
```

## Setup manual (sem Docker)

**Pré-requisitos:** Node.js 20+, Postgres 17 rodando local, npm 10+.

### API

```bash
cd api
cp .env.example .env       # ajustar DATABASE_URL, JWT_SECRET, VAPID_*
npm install
npm run db:migrate
npm run dev                # http://localhost:3000
```

### Frontend

```bash
cd frontend
cp .env.example .env       # VITE_API_URL=http://localhost:3000
npm install
npm run dev                # http://localhost:5173
```

### Docs

```bash
cd docs
npm install
npm run dev                # http://localhost:3030
```

## Variáveis de ambiente

- **`.env`** (raiz, opcional) — overrides do `docker-compose.yml`. Veja `.env.example`.
- **`api/.env`** (modo manual) — `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `FRONTEND_URL`, `VAPID_*`, credenciais opcionais (AWS S3/SES, Keycloak, Google OAuth). Veja `api/.env.example`.
- **`frontend/.env`** (modo manual) — `VITE_API_URL`, `VITE_VAPID_PUBLIC_KEY`. Veja `frontend/.env.example`.
- **`docs`** — não usa variáveis de ambiente.

Pra gerar um `JWT_SECRET` real:

```bash
openssl rand -hex 32
```

Pra gerar um par VAPID real:

```bash
npx web-push generate-vapid-keys
```

## Testes

```bash
# Modo Docker
docker compose exec api npm test
docker compose exec api npm run test:e2e

# Modo manual
cd api
npm test            # vitest
npm run test:e2e
```

Frontend e docs ainda não têm suíte de testes nesta alpha.

## Licença

**AGPL-3.0-only** — veja [LICENSE](./LICENSE).

A AGPL v3 é uma licença copyleft forte: qualquer fork pode ser usado livremente,
inclusive comercialmente, mas se você **rodar uma versão modificada como serviço
acessível por rede** (ex: SaaS, hospedagem própria com modificações), a licença
te obriga a disponibilizar o código-fonte das modificações para os usuários
daquele serviço.
