# Design — Sistema de Eventos ("Rolê")

**Data:** 2026-04-28
**Status:** spec aprovado, aguardando plano de implementação
**Branch de trabalho:** `claude/jovial-chandrasekhar-4c5050` (worktree)
**Nome de produto:** Rolê
**Nome técnico:** `events` (módulo, tabela, rotas, store)

---

## 1. Objetivo

Permitir que usuários da rede social criem encontros (presenciais ou online) entre múltiplos usuários, com cadastro completo, gestão de inscrições, lista de espera, lembretes automáticos e visibilidade configurável.

## 2. Decisões de produto

| Tema | Decisão |
|------|---------|
| Nome de produto | **Rolê** (UI). Código usa `events`. |
| Visibilidade | Híbrida — anfitrião escolhe `público` / `só amigos` / `por convite` (default `público`). Lista de descoberta filtra por isso. |
| Tempo do evento | Início + Duração (dropdown: 1h, 2h, 3h, 4h, 6h, "noite toda" = 6h, "dia todo" = 10h). `ends_at = starts_at + duration`. |
| Conflito de inscrição | Sobreposição de intervalos `[starts_at, ends_at]` entre rolês em que o user está como `subscribed` ou `confirmed`. |
| Lembretes | T-48h (notificação com ação `Confirmar`/`Desistir`); T-2h (notificação ping, sem ação). |
| Status de participação | `subscribed` (default ao se inscrever), `confirmed` (clicou em confirmar), `waitlist` (após capacidade), `left` (saiu por vontade própria ou desistiu). |
| Capacidade | Lista de espera com auto-promoção. Quando alguém sai, o primeiro da fila vira `subscribed` e recebe notificação "Sua vaga foi confirmada". |
| Edição pelo anfitrião | Permitida. Mudança em campos **sensíveis** (`startsAt`, `duration`, `type`, `address`, `onlineLink`, `capacity`, `visibility`) dispara notificação pra inscritos. Capa/nome/descrição = silencioso. |
| Conflito gerado por edição | Se nova data conflitar com outro Rolê do inscrito, ele recebe notificação especial e decide qual manter. Não há auto-remoção. |
| Cancelamento | Anfitrião pode cancelar a qualquer momento, com `motivo` opcional (≤500 chars). Todos os inscritos recebem notificação WS. |
| Endereço (presencial) | Estruturado: `cep`, `logradouro`, `numero`, `complemento` (opt), `bairro`, `cidade`, `estado`. Sem geocoding/mapa nesta versão. ViaCEP opcional no frontend. |
| Online | `meeting_url` (obrigatório) + `extra_details` (opt, texto). |
| Capa | Obrigatória. Upload via MinIO/S3 (mesmo padrão de avatar/post media). 5MB máximo, `image/jpeg|png|webp`. |
| Eventos passados | Job hourly atualiza status para `ended` quando `now() > ends_at`. Permanecem visíveis (read-only) no perfil de quem participou e na própria página. |
| Comentários/chat dentro do Rolê | Fora de escopo. Usuários usam DM. |
| Descoberta | Lista paginada de Rolês visíveis para o user logado (público + amigos quando aplicável + onde foi convidado). Filtros: data (próximos 7d / 30d / todos), tipo (presencial/online), cidade (texto livre, só presencial). Ordenação por proximidade de data. |

## 3. Arquitetura geral

```
┌─────────────────────┐         ┌────────────────────────────────────┐
│  Frontend Vue 3     │         │  API Fastify                       │
│  (modules/events)   │ ──HTTP──►  modules/events/                   │
│                     │         │    ├── events.routes.ts            │
│  - Pinia store      │         │    ├── events.controller.ts        │
│  - Views/Components │         │    ├── events.service.ts           │
│  - Composables      │         │    ├── events.repository.ts        │
│  - Tests (Vitest)   │         │    ├── events.schema.ts (Zod)      │
└─────────────────────┘         │    └── participants.{ctrl|svc|repo}│
       ▲                        └────────────────────────────────────┘
       │                                    │           │           │
       │ Socket.io                          ▼           ▼           ▼
       └─────────────── chat.gateway ─ notifications  pg-boss     S3/MinIO
                       (emite WS)      service        jobs        adapter
                                          │              │
                                          ▼              ▼
                                       Postgres      Postgres (jobs)
```

## 4. Schema do banco (Drizzle)

Adicionar a `api/src/shared/infra/database/schema.ts`:

```ts
export const eventTypeEnum = pgEnum('event_type', ['presencial', 'online'])
export const eventVisibilityEnum = pgEnum('event_visibility', ['public', 'friends', 'invite'])
export const eventStatusEnum = pgEnum('event_status', ['scheduled', 'cancelled', 'ended'])
export const eventParticipantStatusEnum = pgEnum('event_participant_status',
  ['subscribed', 'confirmed', 'waitlist', 'left'])

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  hostUserId: uuid('host_user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  coverUrl: varchar('cover_url').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(), // = starts_at + duration_minutes
  type: eventTypeEnum('type').notNull(),
  visibility: eventVisibilityEnum('visibility').notNull().default('public'),
  capacity: integer('capacity'), // null = sem limite
  status: eventStatusEnum('status').notNull().default('scheduled'),
  cancellationReason: text('cancellation_reason'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  visibilityStartsAtIdx: index('events_visibility_starts_at_idx')
    .on(table.visibility, table.startsAt),
  hostStartsAtIdx: index('events_host_starts_at_idx')
    .on(table.hostUserId, table.startsAt),
  statusEndsAtIdx: index('events_status_ends_at_idx')
    .on(table.status, table.endsAt), // p/ job de finalização
}))

export const eventAddresses = pgTable('event_addresses', {
  eventId: uuid('event_id').primaryKey()
    .references(() => events.id, { onDelete: 'cascade' }),
  cep: varchar('cep', { length: 9 }).notNull(),       // "00000-000"
  logradouro: varchar('logradouro', { length: 200 }).notNull(),
  numero: varchar('numero', { length: 20 }).notNull(),
  complemento: varchar('complemento', { length: 100 }),
  bairro: varchar('bairro', { length: 100 }).notNull(),
  cidade: varchar('cidade', { length: 100 }).notNull(),
  estado: varchar('estado', { length: 2 }).notNull(), // UF
}, (table) => ({
  cidadeIdx: index('event_addresses_cidade_idx').on(table.cidade), // p/ filtro
}))

export const eventOnlineDetails = pgTable('event_online_details', {
  eventId: uuid('event_id').primaryKey()
    .references(() => events.id, { onDelete: 'cascade' }),
  meetingUrl: varchar('meeting_url', { length: 500 }).notNull(),
  extraDetails: text('extra_details'),
})

export const eventParticipants = pgTable('event_participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  status: eventParticipantStatusEnum('status').notNull(),
  waitlistPosition: integer('waitlist_position'), // populated only when status='waitlist'
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  leftAt: timestamp('left_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueEventUser: uniqueIndex('event_participants_event_user_uniq')
    .on(table.eventId, table.userId),
  userStatusIdx: index('event_participants_user_status_idx')
    .on(table.userId, table.status), // p/ "meus rolês" + checagem de conflito
  eventStatusIdx: index('event_participants_event_status_idx')
    .on(table.eventId, table.status), // p/ listar participantes
  waitlistIdx: index('event_participants_waitlist_idx')
    .on(table.eventId, table.waitlistPosition), // p/ promoção
}))

export const eventInvites = pgTable('event_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  invitedUserId: uuid('invited_user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  invitedBy: uuid('invited_by').notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueInvite: uniqueIndex('event_invites_event_user_uniq')
    .on(table.eventId, table.invitedUserId),
}))
```

**Notas:**
- `event_invites` materializa quem foi convidado em rolês `visibility=invite` — controle simples de quem pode ver/inscrever.
- `endsAt` é persistido (não computed column) pra simplificar índices e queries de conflito. Service garante consistência com `durationMinutes`.
- Sem soft-delete em `events` (usa `status='cancelled'`).
- **Discriminação por tipo:** se `events.type='presencial'`, deve existir 1 row em `event_addresses` (validado em service + criado em transação). Se `type='online'`, deve existir 1 row em `event_online_details`. Garantido na camada de serviço, não via constraint de DB.
- **Validação de capacity:** Zod aceita `null` (sem limite) ou inteiro `>= 1`. Zero não é válido.
- **Mapeamento da Duration UI → minutos:** `'1h'→60, '2h'→120, '3h'→180, '4h'→240, '6h'→360, 'noite'→360, 'dia'→600`. Backend valida `duration_minutes` ∈ `{60, 120, 180, 240, 360, 600}` (set fechado de valores permitidos pra UX consistente; pode ser estendido depois sem migration).
- **Conflito de horário** usa `tstzrange(starts_at, ends_at, '[)')` — fim exclusivo, então rolê das 19h–22h e outro 22h–01h **não** conflitam (back-to-back ok).

## 5. API — endpoints

Prefixo: `/events`

### Eventos

| Método | Path | Auth | Body | Resposta |
|--------|------|------|------|----------|
| `POST` | `/events` | ✅ | multipart: campos do evento + `cover` (file) | `201 { event }` |
| `GET` | `/events` | ✅ | query: `from`, `to`, `type`, `cidade`, `cursor`, `limit` | `200 { events, nextCursor }` |
| `GET` | `/events/:id` | ✅ | — | `200 { event, participants: [...], iAmIn: { status }, hostInfo }` |
| `PATCH` | `/events/:id` | ✅ (host only) | campos parciais; `cover` via multipart se incluído | `200 { event, sensitiveChanged: bool }` |
| `DELETE` | `/events/:id` | ✅ (host only) | `{ reason?: string }` | `204` |
| `GET` | `/events/me/hosted` | ✅ | query: `status`, `cursor`, `limit` | `200 { events, nextCursor }` |
| `GET` | `/events/me/attending` | ✅ | query: `status`, `from`, `cursor`, `limit` | `200 { events, nextCursor }` |

### Participantes

| Método | Path | Auth | Body | Resposta |
|--------|------|------|------|----------|
| `POST` | `/events/:id/participants` | ✅ | — | `201 { status: 'subscribed' \| 'waitlist', position? }` |
| `DELETE` | `/events/:id/participants/me` | ✅ | — | `204` |
| `POST` | `/events/:id/participants/me/confirm` | ✅ | — | `200 { status: 'confirmed' }` |
| `GET` | `/events/:id/participants` | ✅ | query: `status`, `cursor`, `limit` | `200 { participants, nextCursor }` |

### Convites (visibility=invite)

| Método | Path | Auth | Body | Resposta |
|--------|------|------|------|----------|
| `POST` | `/events/:id/invites` | ✅ (host only) | `{ userIds: string[] }` | `201 { invited, alreadyInvited }` |
| `DELETE` | `/events/:id/invites/:userId` | ✅ (host only) | — | `204` |
| `GET` | `/events/:id/invites` | ✅ (host only) | — | `200 { invites }` |

### Códigos de erro (Zod + EventsError)

- `400` validação Zod
- `403` `NOT_HOST`, `NOT_INVITED`, `EVENT_CANCELLED`
- `404` `EVENT_NOT_FOUND`, `PARTICIPATION_NOT_FOUND`
- `409` `TIME_CONFLICT`, `ALREADY_SUBSCRIBED`, `EVENT_ALREADY_STARTED`
- `422` `INVALID_DURATION`, `INVALID_CAPACITY`, `MISSING_ADDRESS_FOR_PRESENCIAL`, `MISSING_MEETING_URL_FOR_ONLINE`

## 6. Regras de negócio detalhadas

### 6.1 Inscrição (`POST /events/:id/participants`)

```
1. Carregar evento; falhar se status != 'scheduled' ou starts_at <= now().
2. Verificar visibilidade:
   - public → ok
   - friends → user precisa ser amigo de host
   - invite → precisa ter row em event_invites
3. Verificar conflito de horário:
   SELECT 1 FROM event_participants ep
     JOIN events e ON e.id = ep.event_id
   WHERE ep.user_id = :userId
     AND ep.status IN ('subscribed', 'confirmed')
     AND e.status = 'scheduled'
     AND tstzrange(e.starts_at, e.ends_at) &&
         tstzrange(:newStartsAt, :newEndsAt)
   Se existir → 409 TIME_CONFLICT.
4. Em transação:
   - SELECT count(*) ... WHERE event_id=:id AND status IN ('subscribed','confirmed')
   - Se < capacity (ou capacity is null): INSERT status='subscribed'
   - Senão: INSERT status='waitlist', waitlist_position = max(waitlist_position)+1 OR 1
5. Retornar status + posição (se waitlist).
```

### 6.2 Sair (`DELETE /participants/me`)

```
1. Atualizar participação para status='left', leftAt=now().
2. Se era 'subscribed' ou 'confirmed' E o evento tem capacity:
   - SELECT primeiro da waitlist (ORDER BY waitlist_position)
   - UPDATE para status='subscribed', waitlistPosition=null
   - Reordenar posições dos demais (UPDATE ... SET waitlist_position = waitlist_position - 1)
   - Disparar notificação 'event_promoted_from_waitlist' pro promovido
   - Se faltarem ≤48h pro evento, mandar lembrete imediato pra ele tb
3. Notificar host: 'event_participant_left' (silencioso, badge no painel do host).
```

### 6.3 Confirmar (`POST /participants/me/confirm`)

```
1. Status atual deve ser 'subscribed'. Se 'waitlist' → 409.
2. UPDATE status='confirmed', confirmedAt=now().
```

### 6.4 Edição (`PATCH /events/:id`)

```
1. Validar host.
2. Diff campos sensíveis: startsAt, durationMinutes, type, address.*, meetingUrl, capacity, visibility.
3. Persistir mudanças (transação).
4. Se algum sensível mudou:
   - Buscar todos participantes em ('subscribed', 'confirmed').
   - Notificação 'event_updated' com lista de campos mudados.
   - Se startsAt/duration mudaram, recalcular ends_at.
   - Para cada participante: re-checar conflito; se novo conflito,
     enviar notificação extra 'event_conflict_after_edit' indicando os 2 rolês.
5. Se capacity diminuiu abaixo do count atual de subscribed+confirmed:
   - Não remover ninguém (não é auto-kick).
   - Apenas mover novas inscrições pra waitlist quando count >= novo capacity.
6. Se capacity aumentou: promover N pessoas da waitlist (mesmo fluxo de 6.2).
```

### 6.5 Cancelamento (`DELETE /events/:id`)

```
1. UPDATE status='cancelled', cancellationReason, cancelledAt=now().
2. Cancelar jobs de lembrete (pg-boss cancel).
3. Notificar todos participantes (qualquer status) com 'event_cancelled'.
```

### 6.6 Job de finalização (cron hourly)

```
UPDATE events SET status='ended' WHERE status='scheduled' AND ends_at < now()
```

### 6.7 Notificações

Adicionar ao enum `NotificationType`:
- `event_reminder_48h` — payload: `{ eventId, eventName, requireAction: true }`
- `event_reminder_2h` — payload: `{ eventId, eventName }`
- `event_cancelled` — payload: `{ eventId, eventName, reason? }`
- `event_updated` — payload: `{ eventId, eventName, changedFields: string[] }`
- `event_conflict_after_edit` — payload: `{ eventId, conflictingEventId }`
- `event_promoted_from_waitlist` — payload: `{ eventId, eventName }`
- `event_invited` — payload: `{ eventId, eventName, invitedBy }`

Cada notificação cria row + emite Socket.io via emitter já registrado.

### 6.8 Jobs (pg-boss)

- `event.reminder_48h` — agendar `startAfter = startsAt - 48h - now()`. Worker fanouts pra todos `subscribed/confirmed` no momento do disparo.
- `event.reminder_2h` — agendar `startAfter = startsAt - 2h - now()`. Mesma lógica.
- Cron `event.finalize_ended` — hourly (mesmo padrão do `offers-expire.cron.js`).

Ao criar/editar evento: enfileirar/reenfileirar jobs (cancelar antigos se starts_at mudou).

## 7. Frontend (Vue 3 + Pinia + Tailwind 4)

### 7.1 Estrutura de pastas

```
frontend/src/modules/events/
  ├── views/
  │   ├── EventsDiscoverView.vue       # GET /events (descoberta)
  │   ├── EventDetailView.vue          # GET /events/:id
  │   ├── EventCreateView.vue
  │   ├── EventEditView.vue            # host only
  │   └── MyEventsView.vue             # tabs: Inscritos | Anfitrião
  ├── components/
  │   ├── EventTicketCard.vue          # formato ingresso (lista + detalhes)
  │   ├── EventStatusBadge.vue         # scheduled/ended/cancelled
  │   ├── EventTypeBadge.vue           # presencial/online
  │   ├── ParticipantList.vue          # modal/section com lista clicável
  │   ├── ParticipantItem.vue          # avatar + nome → link perfil
  │   ├── EventForm.vue                # cria/edita (mesmo componente)
  │   ├── AddressFields.vue            # cep + viacep autocomplete
  │   ├── DurationPicker.vue
  │   ├── CapacityIndicator.vue        # "8/10 vagas" + waitlist count
  │   └── WaitlistPositionBadge.vue
  ├── composables/
  │   ├── useEvents.ts                 # listagem + filtros
  │   ├── useEventDetail.ts
  │   ├── useEventActions.ts           # subscribe/leave/confirm/cancel
  │   └── useViaCep.ts
  ├── stores/
  │   └── eventsStore.ts               # Pinia: cache de eventos visualizados
  ├── services/
  │   └── eventsApi.ts                 # wrappers do axios shared
  ├── types.ts                         # tipos compartilhados
  └── __tests__/                       # convive com componentes
      ├── unit/
      └── integration/
```

### 7.2 Rotas (em `frontend/src/router/index.ts`)

```ts
{ path: '/roles', component: () => import('@/modules/events/views/EventsDiscoverView.vue'), meta: { requiresAuth: true } }
{ path: '/roles/novo', component: () => import('@/modules/events/views/EventCreateView.vue'), meta: { requiresAuth: true } }
{ path: '/roles/:id', component: () => import('@/modules/events/views/EventDetailView.vue'), meta: { requiresAuth: true } }
{ path: '/roles/:id/editar', component: () => import('@/modules/events/views/EventEditView.vue'), meta: { requiresAuth: true } }
{ path: '/meus-roles', component: () => import('@/modules/events/views/MyEventsView.vue'), meta: { requiresAuth: true } }
```

URLs em PT (`/roles`, `/meus-roles`) seguem o nome de produto. Código continua `events`.

### 7.3 EventTicketCard — design

Layout de ingresso:

```
┌─────────────────────────────────────────────────────────┐
│ [    capa do evento (cover)    ] ◐ status   ▣ tipo     │
│                                                         │
│ NOME DO ROLÊ                              ────────      │
│                                                         │
│ 📅 Sex, 02 Mai · 19h–22h                                │
│ 📍 Cafeteria X · São Paulo  (ou: 🌐 Online)             │
│ 👥 8/10 inscritos · 2 na lista de espera               │
│ 👤 por Anfitrião Nome                                   │
│                                                         │
│ ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐   │
│ │ Inscrever-se│ │ Ver detalhes │ │ Ver participantes│   │
│ └─────────────┘ └──────────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Estilo "ingresso": canto perfurado (CSS mask + radial-gradient), borda tracejada vertical separando "stub" do corpo, fontes monoespaçadas pra horário/numeração.

Botão "Inscrever-se" muda contextualmente:
- Não inscrito + vagas → `Inscrever-se`
- Não inscrito + cheio → `Entrar na lista de espera (3 na fila)`
- Inscrito (`subscribed`) → `Confirmar presença` (se T-48h passou) OU `Sair`
- Confirmado → `Sair`
- Waitlist → `Sair da fila (posição 2)`
- Encerrado → desabilitado, "Encerrado"
- Cancelado → desabilitado, "Cancelado"
- Anfitrião próprio → `Editar` + `Cancelar Rolê`

Mesmas três ações disponíveis dentro do card (compacto) e dentro da view de detalhes (expandido com mapa textual / link de meeting).

### 7.4 Pinia store — esboço

```ts
// stores/eventsStore.ts
export const useEventsStore = defineStore('events', () => {
  const cache = reactive(new Map<string, EventDetail>())
  const myEvents = ref<EventSummary[]>([])
  // ...
  return { cache, myEvents, fetchEvent, fetchMyEvents, subscribe, leave, confirm, cancel }
})
```

Listener de Socket.io (no setup global) atualiza o cache quando recebe `event_*` notifications relevantes.

## 8. Testes

### 8.1 Backend (Vitest e2e)

`api/tests/e2e/events.e2e.test.ts` cobre:

- Criação completa (presencial e online), incluindo upload de capa
- Validação Zod (campos obrigatórios condicionais)
- Listagem com filtros (data/cidade/tipo) e paginação
- Inscrição com vagas livres → status=subscribed
- Inscrição com vagas cheias → status=waitlist + posição
- Conflito de horário → 409
- Saída de inscrito promove primeiro da waitlist
- Confirmação muda status
- Edição de campo sensível dispara notificação
- Edição que cria conflito dispara notificação extra
- Cancelamento notifica todos + cancela jobs
- Convite (visibility=invite): só convidado consegue inscrever
- Acesso a evento friends-only por não-amigo → 403
- Job hourly finaliza eventos passados
- Lembretes T-48h e T-2h disparam notificações pros inscritos

### 8.2 Frontend (Vitest + Vue Test Utils + MSW)

**Setup novo no projeto** (frontend ainda não tem testes — adicionar config):
- `vitest.config.ts` em `frontend/`
- `@vue/test-utils`, `@testing-library/vue`, `msw`, `happy-dom`, `vitest`, `@vitest/coverage-v8` em `devDependencies`
- Script `npm test` em `frontend/package.json`
- Setup file: `frontend/tests/setup.ts` (configura MSW handlers padrão + Pinia testing)

**Testes unitários** (componentes puros):
- `EventTicketCard` — render correto pra cada combinação de status/inscrição
- `EventStatusBadge`, `EventTypeBadge`, `WaitlistPositionBadge`
- `DurationPicker` — emit valor correto
- `AddressFields` — debounce do ViaCEP, preenchimento automático
- `CapacityIndicator` — texto "8/10" / "lista de espera (3)"

**Testes de integração** (mount completo + MSW mockando API):
- `EventsDiscoverView` — carrega lista, aplica filtros, paginação cursor
- `EventDetailView` — render do evento, lista participantes, ações de subscribe/leave/confirm
- `EventCreateView` — fluxo presencial e online, upload de capa, validação
- `MyEventsView` — tabs e listas separadas
- `eventsStore` — cache, atualização via WS mockado, race conditions
- Fluxo end-to-end frontend (mocked): criar → listar → inscrever → confirmar → ver participantes

Cobertura mínima alvo: 80% dos arquivos do módulo.

## 9. Documentação (`docs/`)

- Adicionar página em `docs/content/` com guia "Sistema de Rolês" — fluxo de criação, inscrição, lista de espera, lembretes, edição.
- Atualizar OpenAPI export (`api/scripts/export-openapi.*`) automaticamente captura novos endpoints.
- Atualizar DBML export.
- Após implementação backend pronta: rodar `docker compose exec api npm run export:all && docker compose exec docs npm run gen`.

## 10. Plano de implementação (alto nível)

Fases com paralelização explícita:

```
Fase 1 — Schema & contratos (sequencial, fundação)
  └─ Schema Drizzle + migration + Zod schemas exportados

Fase 2 — implementação paralela
  ├─ Backend: routes/services/repos + e2e tests
  ├─ Frontend: setup de testes + store + composables + componentes + testes
  └─ (não começar docs ainda — espera 3)

Fase 3 — integração & docs
  ├─ Smoke test full-stack via docker compose
  ├─ Atualizar Fumadocs + regenerar OpenAPI/DBML
  └─ Code review + ajustes

Fase 4 — entrega
  └─ PR pronto pra merge na main (push só com aprovação do usuário)
```

Detalhes de tarefas, dependências e ordem ficam no plano de implementação (próximo passo, via skill `writing-plans`).

## 11. Fora de escopo (registrado pra evitar scope creep)

- Comentários ou chat dentro do Rolê
- Galeria de capas pré-definidas
- Geocoding/mapa pro endereço presencial
- Reports/moderação específicos de Rolê (usa o sistema de reports geral existente)
- Recorrência (rolê semanal, etc.)
- Calendário externo (.ics, Google Calendar)
- Pagamento / Rolês pagos
- "Curtir" / reagir num Rolê
- Notificação push (web push) específica desta feature — usa o pipeline genérico existente
- Filtros geográficos por raio/coordenadas (só cidade texto livre)

## 12. Riscos conhecidos & mitigação

| Risco | Mitigação |
|-------|-----------|
| Host deleta conta → todos os Rolês dele somem (cascade) | Aceitável no alpha. Em v2, considerar soft-delete de user com transferência de host. |
| Race condition na inscrição (2 users pegam última vaga) | Transação com `SELECT ... FOR UPDATE` no count + insert. Único índice `(event_id, user_id)` evita inscrição dupla. |
| Race condition na promoção waitlist (2 leaves simultâneos) | Mesma transação faz leave + promote. `FOR UPDATE SKIP LOCKED` na busca do primeiro waitlist garante 1 promoção por leave. |
| Job de lembrete dispara depois do evento já cancelado | Worker checa `events.status` antes de criar notificação; ignora se `cancelled` ou `ended`. |
| Edição muda startsAt após T-48h já passou | Reagendar jobs: cancelar antigos, recriar com nova hora; se nova hora < 48h no futuro, disparar lembrete imediato. |
| Upload de capa enorme | Validação `5MB` no controller (mesmo padrão de posts media). Mime type checado. |
