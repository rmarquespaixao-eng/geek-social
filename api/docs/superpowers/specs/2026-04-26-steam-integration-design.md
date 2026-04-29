# Spec — Sub-projeto 7: Integração Steam

**Data:** 2026-04-26
**Status:** Aprovado para implementação
**Autor:** sessão de brainstorming

---

## 1. Resumo

Permitir que o usuário do Geek Social vincule sua conta Steam e importe jogos da sua biblioteca para uma coleção do tipo `games` — nova ou existente. Importação roda em background com fila persistente; o usuário acompanha o progresso em tempo real via Socket.io e recebe uma notificação ao final.

Inclui implementação **própria** do fluxo OpenID 2.0 da Steam (sem dependência de bibliotecas terceiras que possam ser depreciadas) e introdução do pg-boss como infraestrutura de fila (em banco PostgreSQL separado).

---

## 2. Objetivo e escopo

**Dentro do escopo:**
- Vincular/desvincular conta Steam por usuário (1:1).
- Listar biblioteca de jogos da Steam do usuário vinculado.
- Importar jogos selecionados para uma coleção tipo `games` (criar nova OU adicionar a existente — escolha do usuário).
- Sync inteligente: detecta novos + atualiza campos vindos da Steam em jogos já existentes; preserva campos editados pelo usuário.
- Enriquecimento assíncrono via `appdetails` (gênero, ano de lançamento, desenvolvedor) com throttle.
- Cover baixado da Steam, processado pelo Sharp e armazenado no S3 próprio.
- Progresso real-time via Socket.io.
- Notificação ao final.

**Fora do escopo (futuro):**
- Outros providers (Epic, PSN, Xbox).
- Sync periódico automático (background sem ação do usuário).
- Cache de `getOwnedGames` no servidor.
- Cancelamento de import em andamento.
- Histórico/dashboard de importações.

---

## 3. Decisões de design

| Decisão | Escolha | Razão |
|---------|---------|-------|
| Provider | Apenas Steam | API mais aberta + único provider acordado |
| Auth | OpenID 2.0 caseiro (stateless mode) | Evitar libs depreciáveis; ~120 LOC; spec estável |
| Fila | pg-boss em banco PostgreSQL separado | Maturidade + sem Redis; banco aux mantém schema principal limpo |
| Destino do import | Escolha do usuário (nova OU existente) | Princípio user-first |
| Enriquecimento | 2 estágios: import rápido + enrich async | Combina UX rápida com dados completos |
| Cover | Download + reupload S3 (Sharp webp) | Consistência visual + resiliência a delisting |
| Sync de duplicatas | Detecta novos + atualiza só campos da Steam | Preserva trabalho do usuário em items editados |
| Filtros da lista | Client-side simples (chips + busca) | Sem custo backend; cobre 90% dos casos |
| Feedback de progresso | Socket.io tempo real + notificação ao final | Reusa infra existente; UX rica |
| Cancelamento | Não há | YAGNI; estado parcial seria confuso |
| Falhas | Retry pg-boss (3×) + graceful failure | Padrão maduro |
| Desconectar | Apaga link, items ficam intocados | Items são "do usuário" depois de importados |
| Trocar conta Steam | Bloqueado (precisa desconectar antes) | Evita mistura de bibliotecas no mesmo perfil |

---

## 4. Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│                     geek-social-api                        │
│                                                            │
│  ┌──────────────────────────────────────────────────┐      │
│  │  src/modules/integrations/steam/                 │      │
│  │   ├─ steam.openid.adapter.ts                     │      │
│  │   ├─ steam.api.client.ts                         │      │
│  │   ├─ steam.service.ts                            │      │
│  │   ├─ steam.controller.ts                         │      │
│  │   ├─ steam.routes.ts                             │      │
│  │   └─ steam.schema.ts                             │      │
│  │                                                  │      │
│  │  src/shared/infra/jobs/                          │      │
│  │   ├─ pgboss.adapter.ts                           │      │
│  │   ├─ jobs.types.ts                               │      │
│  │   └─ workers/                                    │      │
│  │      ├─ steam-import-game.worker.ts              │      │
│  │      └─ steam-enrich-game.worker.ts              │      │
│  └──────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────┘
        │                              │                │
        ▼                              ▼                ▼
   PostgreSQL                    PostgreSQL          AWS S3
   geek_social                   geek_social_jobs   (covers)
   (tabelas dom.)                (pg-boss schemas)
                                     │
                                     ▼
                              api.steampowered.com
                              store.steampowered.com
                              cdn.cloudflare.steamstatic.com
```

**Princípios:**
- Hexagonal pragmática mantida — service depende de contratos `IJobsQueue`, `ISteamApiClient`, `IOpenIdVerifier`.
- pg-boss em banco separado (`geek_social_jobs`); jobs carregam apenas IDs do banco principal (sem FK cross-database).
- Workers iniciam no boot do mesmo processo Fastify.
- Socket.io reutiliza o `chatGateway` existente, expandido com `emitImportProgress(userId, payload)` enviando para a sala `user:{userId}`.

---

## 5. Schema do banco

### 5.1 Migration `0013_steam_integration.sql` (banco `geek_social`)

```sql
ALTER TABLE users
  ADD COLUMN steam_id varchar(20) UNIQUE NULL,
  ADD COLUMN steam_linked_at timestamp NULL;

CREATE INDEX idx_users_steam_id ON users(steam_id) WHERE steam_id IS NOT NULL;

--> statement-breakpoint

ALTER TABLE field_definitions
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
```

### 5.2 Migration `0014_import_batch_finalized.sql` (banco `geek_social`)

```sql
CREATE TABLE import_batch_finalized (
  batch_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  total int NOT NULL,
  imported int NOT NULL,
  updated int NOT NULL,
  failed int NOT NULL,
  finalized_at timestamp NOT NULL DEFAULT NOW()
);

--> statement-breakpoint

CREATE INDEX idx_import_batch_finalized_user
  ON import_batch_finalized(user_id, finalized_at DESC);
```

### 5.3 Atualização do seed `field-definitions.seed.ts`

Dois campos novos no tipo `games`, gerenciados via `upsertSystem` (mesmo padrão dos outros, `isSystem: true`):

| Field key | Label | Tipo | `is_hidden` | Editável |
|-----------|-------|------|-------------|----------|
| `steam_appid` | Steam App ID | `number` | `true` | Não (chave de detecção; controller filtra) |
| `playtime_minutes` | Tempo jogado (min) | `number` | `false` | Sim (usuário pode resetar) |

`is_hidden: true` significa que o frontend não renderiza esse campo em `ItemFormView`. Backend ignora tentativas de set via API pública (controller filtra antes do `validateFields`).

### 5.4 Banco `geek_social_jobs`

Banco PostgreSQL separado, criado manualmente uma vez (documentado no README + entry no docker-compose dev se aplicável). pg-boss faz suas próprias migrations no startup (cria schema `pgboss` com `job`, `archive`, e auxiliares).

Conexão via env var nova `JOBS_DATABASE_URL`.

### 5.5 Tipos de job

| Nome | Payload | Worker |
|------|---------|--------|
| `steam.import-game` | `{ userId, collectionId, appId, importBatchId, expectedTotal, gameSnapshot?: { name, playtimeForever } }` | Cria/atualiza item, baixa cover |
| `steam.enrich-game` | `{ itemId, appId, importBatchId }` | Chama appdetails, atualiza fields |

`importBatchId` (uuid gerado no início do import) agrupa jobs do mesmo "Importar agora" — usado pra calcular progresso via `pgboss.job WHERE data->>'importBatchId' = $1`.

---

## 6. Backend

### 6.1 Estrutura de arquivos

```
src/
├── modules/integrations/steam/
│   ├── steam.openid.adapter.ts
│   ├── steam.api.client.ts
│   ├── steam.service.ts
│   ├── steam.controller.ts
│   ├── steam.routes.ts
│   └── steam.schema.ts
│
├── shared/contracts/
│   ├── steam-api.client.contract.ts
│   ├── openid-verifier.contract.ts
│   └── jobs-queue.contract.ts
│
└── shared/infra/jobs/
    ├── pgboss.adapter.ts
    ├── jobs.types.ts
    └── workers/
        ├── steam-import-game.worker.ts
        └── steam-enrich-game.worker.ts
```

### 6.2 Contratos

```typescript
// ISteamApiClient
interface ISteamApiClient {
  getOwnedGames(steamId: string): Promise<SteamOwnedGame[]>;
  getAppDetails(appId: number): Promise<SteamAppDetails | null>;
  downloadCover(appId: number): Promise<Buffer | null>;
}

interface SteamOwnedGame {
  appId: number;
  name: string;
  playtimeForever: number; // minutos
  imgIconUrl: string | null;
}

interface SteamAppDetails {
  appId: number;
  type: string; // 'game' | 'dlc' | 'tool' | ...
  name: string;
  shortDescription: string | null;
  releaseDate: { date: string | null }; // raw "26 Apr, 2026"
  developers: string[];
  publishers: string[];
  genres: Array<{ id: string; description: string }>;
}

// IOpenIdVerifier
interface IOpenIdVerifier {
  buildAuthUrl(returnUrl: string, realm: string): string;
  verifyResponse(query: Record<string, string>): Promise<{ steamId: string } | null>;
}

// IJobsQueue
type JobName = 'steam.import-game' | 'steam.enrich-game';

interface JobOptions {
  retryLimit?: number;
  retryDelay?: number; // segundos
  retryBackoff?: boolean;
  startAfter?: Date | number;
}

interface IJobsQueue {
  enqueue<T>(jobName: JobName, payload: T, options?: JobOptions): Promise<string>;
  registerWorker<T>(
    jobName: JobName,
    handler: (payload: T) => Promise<void>,
    options?: { teamSize?: number; teamConcurrency?: number }
  ): Promise<void>;
  getBatchStats(importBatchId: string): Promise<{
    totalImports: number;
    completedImports: number;
    failedImports: number;
    totalEnriches: number;
    completedEnriches: number;
    failedEnriches: number;
  }>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

### 6.3 Responsabilidades

| Arquivo | Responsabilidade |
|---------|------------------|
| `steam.openid.adapter.ts` | Implementa `IOpenIdVerifier`. Build da URL de auth + validação stateless via `check_authentication` POST ao Steam. Sem deps externas além de `fetch` global. |
| `steam.api.client.ts` | Implementa `ISteamApiClient`. Usa `undici`/`fetch` global. Throttle interno em `getAppDetails` (1 req / 1500ms) com fila simples (variável de módulo + Promise queue). |
| `steam.service.ts` | `linkAccount(userId, openidQuery)`, `unlinkAccount(userId)`, `listOwnedGames(userId)` (proxy direto, sem cache), `startImport(userId, dest, appIds)`. |
| `steam-import-game.worker.ts` | Idempotente. Cria ou atualiza item por `steam_appid`. Baixa cover → Sharp → S3. Enfileira `steam.enrich-game` no fim. Emite `chatGateway.emitImportProgress`. |
| `steam-enrich-game.worker.ts` | Chama `getAppDetails`. Atualiza só campos vindos da Steam (genre/release_year/developer) que estão vazios ou que mudaram. Nunca toca em campos do usuário. Detecta "último do batch" e emite `done` + cria notification. |

### 6.4 DI no `app.ts` (ordem nova)

```typescript
// Após instanciação de storageService, db, etc.
const steamApiClient = new SteamApiClient(env.STEAM_WEB_API_KEY);
const openIdVerifier = new SteamOpenIdAdapter();
const jobsQueue = new PgBossAdapter(env.JOBS_DATABASE_URL);
await jobsQueue.start();

const steamService = new SteamService(
  usersRepository,
  collectionsRepository,
  itemsRepository,
  steamApiClient,
  openIdVerifier,
  jobsQueue,
);

await registerSteamImportGameWorker(jobsQueue, {
  steamApiClient, storageService, itemsRepository,
  collectionsRepository, usersRepository, chatGateway,
});
await registerSteamEnrichGameWorker(jobsQueue, {
  steamApiClient, itemsRepository, collectionsRepository,
  notificationsService, chatGateway, db,
}, { teamSize: 1, teamConcurrency: 1 }); // garante throttle global

// Graceful shutdown
fastify.addHook('onClose', () => jobsQueue.stop());
```

---

## 7. Endpoints REST

Todos sob `/integrations/steam`. Todos `authenticate` exceto callback.

| Método | Rota | Auth | Body / Query | Resposta |
|--------|------|------|--------------|----------|
| `GET` | `/integrations/steam/login` | sim | — | `302` redirect para Steam OpenID |
| `GET` | `/integrations/steam/callback` | **não** | OpenID query params | `302` redirect para frontend |
| `DELETE` | `/integrations/steam/link` | sim | — | `204` |
| `GET` | `/integrations/steam/games` | sim | — | `{ games: [{ appId, name, playtimeForever, existingCollectionIds: string[] }] }` |
| `POST` | `/integrations/steam/import` | sim | `{ collectionId?, newCollectionName?, appIds: number[], gamesSnapshot?: [{ appId, name, playtimeForever }] }` | `{ batchId, collectionId, totalJobs }` |
| `GET` | `/integrations/steam/import/:batchId/status` | sim | — | `{ batchId, total, completed, failed, stage, collectionId, finishedAt? }` |

### 7.1 `/login`

Exige usuário logado no Geek Social (vinculação, não login social).

Estado do usuário entre login e callback é passado via **state opaco**: assinamos um JWT curto `{ userId, type: 'steam-link', exp: now + 5min }` com a chave já existente do projeto e injetamos no `return_to` como query param `state`.

### 7.2 `/callback`

Público (Steam que orquestra o redirect via browser).

Validação:
1. Verifica `state` JWT → extrai `userId`.
2. Roda `IOpenIdVerifier.verifyResponse(query)` → retorna `{ steamId }` ou `null`.
3. Se válido, chama `SteamService.linkAccount(userId, steamId)`.
4. Redireciona para `${PUBLIC_FRONTEND_URL}/settings?steam=connected` (sucesso) ou `?steam=error&code=...` (falha).

### 7.3 `/games`

Chama `GetOwnedGames` na hora (sem cache no MVP). Para cada jogo, adiciona `existingCollectionIds: string[]` — lista de coleções `games` do usuário onde aquele `steam_appid` já existe (vazio se não existir em lugar nenhum).

Query auxiliar:
```sql
SELECT
  (fields->>'steam_appid')::int AS app_id,
  array_agg(DISTINCT c.id::text) AS collection_ids
FROM items i
JOIN collections c ON c.id = i.collection_id
WHERE c.user_id = $1
  AND c.type = 'games'
  AND fields ? 'steam_appid'
GROUP BY app_id;
```

O frontend usa essa info pra decidir se mostra "Já na col." ou não, baseado na coleção destino atualmente selecionada.

### 7.4 `/import`

Aceita **um dos dois**: `collectionId` (existente) OU `newCollectionName`. Zod refine garante exclusividade. Sem nenhum dos dois → 400 `IMPORT_DESTINATION_REQUIRED`.

`gamesSnapshot` é opcional — vem do frontend que acabou de buscar `/games`. Workers usam ele se presente; senão consultam `GetOwnedGames` na primeira execução do batch e cacheiam em memória do processo (`Map<batchId, Map<appId, GameInfo>>`, TTL 30min).

### 7.5 `/import/:batchId/status`

Fallback caso o socket caia ou usuário recarregue a página. Retorna estado agregado lendo de `pgboss.job` (se batch ativo) ou de `import_batch_finalized` (se concluído).

### 7.6 Erros novos

| Code | Quando |
|------|--------|
| `STEAM_NOT_LINKED` | Endpoints de games/import sem `users.steam_id` |
| `STEAM_ALREADY_LINKED_TO_OTHER_USER` | Callback com steamID já vinculado a outro userId |
| `STEAM_ALREADY_LINKED_TO_THIS_USER` | (Reservado para mensagens UX; backend trata como no-op idempotente) |
| `STEAM_PROFILE_PRIVATE` | `GetOwnedGames` retorna `game_count: 0` apesar de `steam_id` válido |
| `STEAM_OPENID_INVALID` | Callback OpenID inválido / state JWT expirado |
| `STEAM_AUTH_FAILED` | API key Steam inválida ou recusada (401/403) |
| `IMPORT_DESTINATION_REQUIRED` | POST /import sem `collectionId` nem `newCollectionName` |
| `IMPORT_COLLECTION_NOT_GAMES_TYPE` | `collectionId` aponta pra coleção que não é `games` |
| `IMPORT_COLLECTION_NOT_OWNED` | `collectionId` aponta pra coleção de outro usuário |
| `IMPORT_ALREADY_IN_PROGRESS` | Já existe batch em andamento pro usuário |

---

## 8. Socket events

Room `user:{userId}`.

| Evento | Direção | Payload |
|--------|---------|---------|
| `steam:import:progress` | server→client | `{ batchId, total, completed, failed, stage: 'importing'\|'enriching'\|'done', currentName?: string }` |
| `steam:import:done` | server→client | `{ batchId, total, imported, updated, failed, collectionId, durationMs }` |

Notification ao final reusa o módulo `notifications` existente. Tipos novos no enum `notification_type`:

- `steam_import_done` — sem falhas.
- `steam_import_partial` — com falhas.

Click na notification leva para `/collections/:collectionId`.

---

## 9. Fluxo de auth (OpenID 2.0 caseiro)

Implementação stateless, sem `association`. Steam suporta esse modo perfeitamente. Total: ~120 LOC.

### 9.1 Diagrama do fluxo

```
1. GET /integrations/steam/login (autenticado)
   ├─ gera state JWT { userId, type: 'steam-link', exp: now+5min }
   ├─ monta URL OpenID
   └─ 302 redirect

2. Usuário loga na Steam, autoriza, é redirecionado pra:
   GET /integrations/steam/callback?state={JWT}
       &openid.ns=...
       &openid.mode=id_res
       &openid.op_endpoint=https://steamcommunity.com/openid/login
       &openid.claimed_id=https://steamcommunity.com/openid/id/{steamID64}
       &openid.identity=https://steamcommunity.com/openid/id/{steamID64}
       &openid.return_to=...
       &openid.response_nonce=...
       &openid.assoc_handle=...
       &openid.signed=signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle
       &openid.sig=...

3. Backend valida (steam.openid.adapter.ts):
   a. state JWT válido + não expirado → extrai userId
   b. openid.mode === 'id_res' (senão erro)
   c. openid.claimed_id casa regex ^https://steamcommunity\.com/openid/id/(\d{17})$
   d. POST stateless check_authentication para steamcommunity.com/openid/login
      ├─ body: todos os params openid.*, com openid.mode=check_authentication
      └─ resposta esperada: linha "is_valid:true"
   e. SteamService.linkAccount(userId, steamId)

4. Redirect:
   - sucesso: {PUBLIC_FRONTEND_URL}/settings?steam=connected
   - erro:    {PUBLIC_FRONTEND_URL}/settings?steam=error&code={CODE}
```

### 9.2 Esboço do adapter

```typescript
export class SteamOpenIdAdapter implements IOpenIdVerifier {
  private static readonly OP_ENDPOINT = 'https://steamcommunity.com/openid/login';
  private static readonly CLAIMED_ID_REGEX =
    /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

  buildAuthUrl(returnUrl: string, realm: string): string {
    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnUrl,
      'openid.realm': realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    return `${SteamOpenIdAdapter.OP_ENDPOINT}?${params.toString()}`;
  }

  async verifyResponse(query: Record<string, string>): Promise<{ steamId: string } | null> {
    if (query['openid.mode'] !== 'id_res') return null;

    const claimedId = query['openid.claimed_id'];
    const match = claimedId?.match(SteamOpenIdAdapter.CLAIMED_ID_REGEX);
    if (!match) return null;
    const steamId = match[1];

    const checkParams = new URLSearchParams({ ...query, 'openid.mode': 'check_authentication' });
    try {
      const res = await fetch(SteamOpenIdAdapter.OP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: checkParams.toString(),
      });
      const text = await res.text();
      const isValid = text.split('\n').some((line) => line.trim() === 'is_valid:true');
      return isValid ? { steamId } : null;
    } catch {
      return null;
    }
  }
}
```

### 9.3 Garantias de segurança

1. `check_authentication` callback ao próprio Steam garante que a query veio de fato da Steam.
2. State JWT impede CSRF.
3. Regex no `claimed_id` impede spoofing de URL.
4. Stateless: zero estado server-side entre login e callback além do JWT no próprio query string.

### 9.4 Limitações aceitas

- Sem `association` mode = uma chamada HTTP extra ao Steam por login (~300ms). Aceitável (login Steam é raro).
- Sem nonce replay protection sofisticado (Steam enforça server-side; copiar callback antigo dá `is_valid:false`).

---

## 10. Fluxo de import (jobs, fila, estágios)

### 10.1 Trigger (POST /integrations/steam/import)

```
1. Validações no controller:
   - users.steam_id existe → senão STEAM_NOT_LINKED
   - body válido (Zod)
   - se collectionId: pertence ao usuário + type='games' → senão erro
   - se newCollectionName: cria collection (visibility='private', auto_share_to_feed=false)
   - sem batch ativo do usuário → senão IMPORT_ALREADY_IN_PROGRESS

2. SteamService.startImport:
   - batchId = uuid()
   - para cada appId:
       jobsQueue.enqueue('steam.import-game', {
         userId, collectionId, appId, importBatchId: batchId,
         expectedTotal: appIds.length,
         gameSnapshot: snapshot?.[appId] // se vier no body
       }, { retryLimit: 3, retryDelay: 30 })
   - retorna { batchId, collectionId, totalJobs }
```

### 10.2 Worker `steam.import-game`

```
1. Carrega payload + (opcional) snapshot do batch.
2. Valida pré-condições:
   - users.steam_id ainda existe → senão cancela job
   - collection ainda existe → senão cancela job
3. Resolve gameInfo:
   - se payload.gameSnapshot: usa direto
   - senão: busca cache em memória do batch
   - senão: chama steamApiClient.getOwnedGames + cacheia
4. Verifica se item já existe:
   itemsRepository.findByAppId(collectionId, appId)
5. Se existe (UPDATE path):
   - sempre atualiza: fields.playtime_minutes
   - atualiza se mudou: name, fields (apenas chaves Steam: steam_appid)
   - NUNCA toca: rating, comment, status, data_que_zerou, custom fields
6. Se não existe (INSERT path):
   - cria item com: name, fields={ steam_appid, playtime_minutes, status: 'Na fila' }
7. Cover (se vazio OU se forçado):
   - steamApiClient.downloadCover(appId)
   - sharp(buf).resize(800, 1200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
   - storageService.upload(`items/${itemId}/cover.webp`, processed)
   - itemsRepository.updateCoverUrl(itemId, url)
8. Enfileira steam.enrich-game { itemId, appId, importBatchId }
9. emitImportProgress
```

### 10.3 Worker `steam.enrich-game`

```
1. Throttle: pg-boss config { teamSize: 1, teamConcurrency: 1 }.
   Adicional: variável de módulo lastCall: number;
   await aguardarAté(lastCall + 1500ms)
2. steamApiClient.getAppDetails(appId)
3. Mapeia resposta → fields:
   - genre ← genres[0].description (primeiro principal)
   - release_year ← parseInt do año em release_date.date
   - developer ← developers[0]
4. itemsRepository.update(itemId, fields):
   - Para cada campo Steam: se vazio OU diferente → atualiza
   - Preserva campos do usuário sempre
5. emitImportProgress (stage 'enriching')
6. Detecta "último do batch":
   stats = jobsQueue.getBatchStats(batchId)
   se completed === total:
     INSERT INTO import_batch_finalized ... ON CONFLICT DO NOTHING
     se INSERT afetou linha (RETURNING):
       chatGateway.emitImportDone
       notificationsService.create({
         type: failed === 0 ? 'steam_import_done' : 'steam_import_partial',
         ...
       })
```

### 10.4 Cálculo de progresso

`getBatchStats(importBatchId)` é uma query agregada à `pgboss.job`:

```sql
SELECT
  name,
  state,
  count(*)
FROM pgboss.job
WHERE data->>'importBatchId' = $1
GROUP BY name, state;
```

E sobre `pgboss.archive` para jobs finalizados (pg-boss arquiva após conclusão).

### 10.5 Erros e retry

- pg-boss retry automático: `retryLimit: 3`, `retryDelay: 30s`.
- Falha definitiva (3 tentativas) → job vai para `state='failed'` em `pgboss.archive`.
- Worker captura erro do try/catch antes de relançar → emite `progress` com `failed++`.
- Final do batch: detecção em `import_batch_finalized` com INSERT idempotente garante que apenas o "primeiro a chegar" dispara `emitImportDone` + cria notification.

### 10.6 Mapeamento status notification → mensagem

| Tipo | Mensagem |
|------|----------|
| `steam_import_done` | "🎮 Importação Steam concluída — {imported} jogos adicionados em {collectionName}" |
| `steam_import_partial` | "🎮 Importação Steam concluída — {imported} jogos importados, {failed} falharam" |

---

## 11. Frontend

### 11.1 Estrutura de arquivos

```
src/modules/integrations/steam/
├── services/
│   └── steamService.ts
├── stores/
│   └── useSteam.ts
├── composables/
│   └── useSteamImportSocket.ts
├── views/
│   └── SteamImportView.vue
└── components/
    ├── SteamConnectCard.vue
    ├── SteamGameRow.vue
    └── SteamImportBanner.vue
```

### 11.2 SettingsView — card "Contas conectadas"

`SteamConnectCard.vue` adicionado ao SettingsView com 2 estados:

**Não conectado:**
```
[logo Steam]  Steam
              Não conectada
                                              [ Conectar Steam ]
```

**Conectado:**
```
[logo Steam]  Steam
              Conectada como SteamID 7656...
              Vinculada em 26/04/2026
              [ Importar jogos ]   [ Desconectar ]
```

- "Conectar Steam" → `window.location.href = '${API}/integrations/steam/login'` (navegação real, não axios — necessário pra cookie de sessão).
- Após callback, redireciona para `/settings?steam=connected|error=...` que mostra toast + re-fetch do `useAuthStore.user`.
- "Desconectar" → confirm modal `<AppModal size="sm">` → `DELETE /integrations/steam/link` → atualiza store.

### 11.3 SteamImportView.vue (rota `/integrations/steam/import`)

Layout:

```
┌──────────────────────────────────────────────────────────┐
│ ←  Importar jogos da Steam                               │
├──────────────────────────────────────────────────────────┤
│  Destino:                                                │
│  ( ) Criar nova coleção  [Nome: ___________]             │
│  (•) Adicionar a uma coleção existente                   │
│       [Dropdown: Meus Jogos ▼]                           │
│                                                          │
│  Filtros: [Todos] [Jogados ≥1h] [Nunca jogados] [Top 20] │
│  Busca: [🔍 _________________________]                   │
│                                                          │
│  Selecionados: 47 / 312    [Selecionar visíveis] [Limpar]│
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ ☑ [cover] Hollow Knight        47h   Já na col.  │    │
│  │ ☐ [cover] Stardew Valley       12h               │    │
│  │ ...                                              │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│            [ Cancelar ]      [ Importar 47 jogos ]       │
└──────────────────────────────────────────────────────────┘
```

- `onMounted` → `useSteam.fetchGames()`.
- "Já na col." é chip cinza calculado client-side: `game.existingCollectionIds.includes(selectedDestinationId)`. Atualiza automaticamente quando o destino muda — sem refetch.
- Cover na lista usa direto a URL do CDN da Steam (`library_600x900_2x.jpg`) — fast-path visual; reupload S3 só acontece no worker.
- "Importar":
  1. POST `/integrations/steam/import` com `gamesSnapshot` (subset selecionado).
  2. Salva `currentImport` na store.
  3. Roteia pra `/collections/:collectionId`.
  4. Banner global aparece.

### 11.4 SteamImportBanner.vue (em App.vue)

Visível enquanto `useSteam.currentImport.stage !== 'done'`.

```
┌─────────────────────────────────────────────────────────────┐
│ ⚙ Importando da Steam... 47 / 94 (Hollow Knight)        [▾]│
└─────────────────────────────────────────────────────────────┘
```

- Composable `useSteamImportSocket` se inscreve em `steam:import:progress` e `steam:import:done`.
- Botão `[▾]` minimiza para ícone discreto na sidebar.
- Ao terminar:
  - Banner muda pra verde "✅ 94 jogos importados (2 falharam)" + botão "Ver coleção" + "X" pra fechar.
  - Notification do sino também aparece (sistema existente).
  - Auto-fecha em 30s.

### 11.5 Pinia store `useSteam`

```typescript
state: {
  isLinked: boolean,
  steamId: string | null,
  linkedAt: string | null,
  games: SteamGame[] | null,
  gamesLoadedAt: number | null,
  currentImport: {
    batchId: string,
    collectionId: string,
    total: number,
    completed: number,
    failed: number,
    stage: 'importing' | 'enriching' | 'done',
    currentName: string | null,
  } | null,
}
actions:
  fetchLinkStatus(), unlink(),
  fetchGames(), startImport(payload),
  fetchImportStatus(batchId)
```

### 11.6 Composable `useSteamImportSocket`

Inicializado em `App.vue` `onMounted` (após `connectSocket`). Listeners:
- `steam:import:progress` → atualiza `useSteam.currentImport`.
- `steam:import:done` → marca `stage='done'`, refaz `notificationsStore.fetchAll()`.

### 11.7 Reload automático do CollectionDetailView

Quando `currentImport.collectionId === current.id`, o view dispara um `refetchItems()` a cada **10 jobs concluídos** (verifica diff de `currentImport.completed`). Itens vão aparecendo aos poucos.

### 11.8 NotificationsView

Tipos novos `steam_import_done` e `steam_import_partial` ganham ícones próprios (logo Steam pequeno + check ou warning). Click → `/collections/:collectionId`.

---

## 12. Edge cases

| Cenário | Comportamento |
|---------|---------------|
| Perfil Steam privado (sem detalhes de jogos) | `GetOwnedGames` retorna `game_count: 0`. Service detecta + lança `STEAM_PROFILE_PRIVATE`. Frontend mostra modal explicativo com instruções. |
| Steam fora durante login | OpenID redirect falha; usuário fica preso na Steam. Quando voltar, tenta de novo. |
| Steam fora durante import | pg-boss retry 3× com backoff 30s. Persistente → jobs `failed`, agregados em notification final. |
| Cover 404 (jogo delisted) | `downloadCover` tenta `library_600x900_2x.jpg` → fallback `header.jpg` → null → item sem cover (frontend usa placeholder). |
| `appdetails` com `success: false` | Apps não-jogos (ferramentas Steam). Worker trata como "nada pra enriquecer", não falha. |
| Coleção destino deletada durante import | Workers detectam `collection not found` → marcam jobs do batch como `cancelled`. Notification: "Importação cancelada — coleção foi removida". |
| Item já importado deletado pelo usuário durante batch | Worker do enrich detecta `item not found` → ignora silenciosamente. |
| Usuário desconecta Steam durante import | Workers detectam `users.steam_id == null` → marcam restantes como `cancelled`. Já importados ficam (regra A1). |
| Backend reinicia no meio do batch | pg-boss persiste tudo. Workers retomam jobs `created`/`active` automaticamente. Frontend reconecta socket + composable busca `/import/:batchId/status` pra ressincronizar estado. |
| Race: dois "Importar" ao mesmo tempo | Validação `IMPORT_ALREADY_IN_PROGRESS` no controller. Proteção secundária no worker: se já tem outro batch ativo do usuário pra mesma coleção, marca como `cancelled`. |
| Steam Web API key inválida/expirada | Worker pega 401/403 → falha sem retry (`STEAM_AUTH_FAILED` é non-retryable). Logs `error`. Sem recovery automático — admin atualiza `.env`. |
| Rate limit 429 em `appdetails` | Worker captura → re-enfileira com delay 60s + decrementa retryLimit. Throttle interno deve evitar; safety net. |

---

## 13. Segurança

| Vetor | Mitigação |
|-------|-----------|
| CSRF no callback OpenID | State JWT (`type='steam-link'`, exp 5min) embutido no `return_to`. |
| Steal de steamID via callback forjado | `check_authentication` POST ao Steam valida que a query é genuína. |
| Steam Web API key vazando | Key em `.env` (`STEAM_WEB_API_KEY`), nunca no frontend nem em logs (logger Pino redige). |
| Vincular conta Steam de outra pessoa | OpenID garante posse — só quem loga na Steam vincula. |
| Re-link da mesma conta Steam por dois usuários | UNIQUE em `users.steam_id` + check no link → `STEAM_ALREADY_LINKED_TO_OTHER_USER`. |
| Spam de imports | `IMPORT_ALREADY_IN_PROGRESS` bloqueia paralelos por usuário. |

---

## 14. Observabilidade

- Logger Pino: cada worker loga `info` ao iniciar/finalizar job, `error` em falhas, `warn` em cover null/appdetails success:false.
- Estrutura: `logger.info({ batchId, appId, itemId, durationMs }, 'steam.import-game completed')`.
- Tabela `import_batch_finalized` é histórico permanente (jobs no pg-boss arquivam após 7 dias por padrão).
- Sem dashboards no MVP. Auditoria via `SELECT * FROM import_batch_finalized ORDER BY finalized_at DESC`.

---

## 15. Variáveis de ambiente

Novas:
```
STEAM_WEB_API_KEY=...                            # https://steamcommunity.com/dev/apikey
JOBS_DATABASE_URL=postgres://dev:dev@db:5432/geek_social_jobs
PUBLIC_API_URL=https://api.example.com           # usado no return_to do OpenID
PUBLIC_FRONTEND_URL=https://geek.example.com     # usado no redirect pós-callback
```

`PUBLIC_API_URL` e `PUBLIC_FRONTEND_URL` podem já existir parcialmente no `.env` (verificar antes de duplicar).

---

## 16. Testes

Vitest + mocks manuais `vi.fn()` das interfaces. Sem testes de controller. Sem testcontainers.

### 16.1 `steam.openid.adapter.test.ts`
- `buildAuthUrl` retorna URL com todos os params OpenID corretos.
- `verifyResponse` com `mode !== 'id_res'` → `null`.
- `verifyResponse` com `claimed_id` malformado → `null`.
- `verifyResponse` chama Steam com `mode=check_authentication` (mock `fetch`).
- Resposta `is_valid:true` → `{ steamId }`.
- Resposta `is_valid:false` → `null`.
- Erro de rede no fetch → `null` (não lança).

### 16.2 `steam.api.client.test.ts`
- `getOwnedGames` parseia resposta corretamente.
- `getOwnedGames` com `game_count: 0` retorna array vazio.
- `getAppDetails` parseia genres/release_date/developers; com `success: false` → `null`.
- `downloadCover` tenta `library_600x900_2x.jpg`, fallback `header.jpg` em 404, retorna `null` se ambos falham.
- Throttle: duas chamadas seguidas a `getAppDetails` esperam ≥1500ms (`vi.useFakeTimers`).

### 16.3 `steam.service.test.ts`
- `linkAccount` novo: persiste `steam_id` + `steam_linked_at`.
- `linkAccount` idempotente (mesmo userId+steamId).
- `linkAccount` com steamId em outro userId → `STEAM_ALREADY_LINKED_TO_OTHER_USER`.
- `unlinkAccount`: zera `steam_id` e `steam_linked_at`.
- `listOwnedGames` sem `steam_id` → `STEAM_NOT_LINKED`.
- `listOwnedGames` adiciona `existingCollectionIds` corretamente (jogo em 0, 1 ou múltiplas coleções).
- `listOwnedGames` com perfil privado → `STEAM_PROFILE_PRIVATE`.
- `startImport` valida destino (collectionId existente OU criação).
- `startImport` rejeita batch paralelo.
- `startImport` enfileira N jobs corretos + retorna `batchId/totalJobs`.

### 16.4 `steam-import-game.worker.test.ts`
- INSERT path: cria item com fields, baixa cover, sobe S3, atualiza cover_url.
- UPDATE path: detecta por `steam_appid`, atualiza só playtime/name/cover_url.
- Cover null: segue sem cover.
- Coleção deletada: marca cancelled, não cria órfão.
- Usuário desconectou Steam: marca cancelled.
- Sempre enfileira `enrich-game` no fim.
- Emite `steam:import:progress`.

### 16.5 `steam-enrich-game.worker.test.ts`
- appdetails sucesso: atualiza só campos vazios ou que mudaram.
- Preserva campos do usuário (rating/comment/status).
- appdetails `success: false`: ignora.
- Item deletado: ignora.
- "Último do batch": dispara `emitImportDone` + notification (mock do INSERT idempotente).

### 16.6 Sem testes de integração com pg-boss
`IJobsQueue` mockado nos testes de service e workers. pg-boss tem sua própria suíte. Confiamos no contrato.

### 16.7 Total estimado
~50 testes em 8 arquivos.

---

## 17. Migration plan

1. Criar banco `geek_social_jobs` no Postgres dev (`CREATE DATABASE geek_social_jobs;`).
2. Adicionar `JOBS_DATABASE_URL` no `.env`.
3. Aplicar migrations `0013` e `0014` no `geek_social`.
4. Atualizar seed de `field-definitions` (já roda no startup).
5. Documentar no README do `geek-social-api`: passo manual de criar o segundo banco em ambientes novos (dev e prod).
6. Obter Steam Web API key real e popular `STEAM_WEB_API_KEY`.

---

## 18. Itens fora do MVP (futuro)

- Sync periódico automático (cron diário re-importando deltas).
- Cache server-side de `getOwnedGames` (TTL ~30min).
- Cancelamento de import em andamento.
- Dashboard de importações com filtros e busca.
- Outros providers (Epic, GOG).
- Re-import forçado de itens já existentes (sobrescreve campos do usuário).
- Página dedicada de gerenciamento de field_definitions Steam (hoje hidden).
