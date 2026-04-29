# Vitrine — Design Spec

**Data:** 2026-04-27
**Status:** Aprovado
**Escopo:** Unificação Marketplace + Trades + Fluxo de anúncio + Reputação bidirecional

---

## 1. Visão Geral

"Vitrine" substitui "Marketplace" e "Trocas" como feature unificada. O usuário gerencia seus anúncios de itens (à venda, para troca, ou ambos) a partir de uma tela dedicada, e visualiza anúncios de outros na mesma feature. Um sistema de reputação bidirecional guia usuários sobre com quem vale fazer negócio.

**Rotas afetadas:**
- `/marketplace` → `/vitrine`
- `/trades` → `/vitrine/ofertas`
- `/vitrine/meus-anuncios` (nova)
- Sidebar: substituir entradas "Marketplace" e "Trocas" por entrada única "Vitrine"

---

## 2. Decisões de Produto (consolidadas)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Escopo | Spec único |
| 2 | Nome da feature | **Vitrine** |
| 3 | Modelagem anúncio | Nova entidade `listings` separada do item |
| 4 | Forma de pagamento | Multi-select fixo: PIX, Dinheiro, Transferência, Cartão, A combinar |
| 5 | Quem avalia reputação | Ambos os lados (simétrico) |
| 6 | Janela de avaliação | 30 dias após `completed` |
| 7 | Visualização reputação | Média estrelas (1–5) + nº transações concluídas |
| 8 | Onde mostrar reputação | Card no marketplace, ProfileView, card de oferta |
| 9 | Bug dos forms | Corrigir junto com refatoração |
| 10 | Detalhes item no OfferDialog | Inline expandido |
| 11 | Aviso "não intermediamos" | Checkbox na criação + recap ao aceitar oferta |
| 12 | Meus anúncios | Dentro da Vitrine (sub-aba) |
| 13 | Migração dados existentes | Script migra `availability != 'none'` para listings |
| 14 | Estados do listing | `active`, `paused`, `closed` |
| 15 | Listings por item | Máximo 1 ativo por item |
| 16 | Reputação — quando aparece | Após 3 transações; antes mostra "Novo na vitrine" |
| 17 | Reputação retroativa | Não — conta só daqui pra frente |
| 18 | Editar avaliação | Pode editar/apagar dentro dos 30 dias; depois fixa |
| 19 | Pagamento em trade puro | Campo escondido |
| 20 | Pagamento em sale/both | Obrigatório selecionar ao menos 1 |
| 21 | Detalhes side-by-side no OfferDialog | Ambos os itens com detalhes expandidos |
| 22 | Visibilidade do listing | Herda da coleção (pública ou friends_only) |

---

## 3. Banco de Dados

### 3.1 Nova tabela `listings`

```sql
CREATE TYPE listing_status AS ENUM ('active', 'paused', 'closed');

CREATE TABLE listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  availability  item_availability NOT NULL,          -- reutiliza enum existente: sale|trade|both
  asking_price  NUMERIC(10,2),                       -- null se trade puro
  payment_methods TEXT[] NOT NULL DEFAULT '{}',      -- ['pix','money','transfer','card','negotiate']
  status        listing_status NOT NULL DEFAULT 'active',
  disclaimer_accepted_at TIMESTAMPTZ NOT NULL,       -- quando o user aceitou o aviso
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Apenas 1 listing ativo por item
CREATE UNIQUE INDEX listings_item_active_uniq
  ON listings(item_id)
  WHERE status = 'active';

-- Índices de listagem
CREATE INDEX listings_owner_status_idx ON listings(owner_id, status, created_at DESC);
CREATE INDEX listings_active_idx ON listings(status, updated_at DESC) WHERE status = 'active';
```

### 3.2 Remover colunas de `items`

```sql
-- Remover após migração (ver 3.4)
ALTER TABLE items DROP COLUMN IF EXISTS availability;
ALTER TABLE items DROP COLUMN IF EXISTS asking_price;
```

### 3.3 Nova tabela `listing_ratings`

```sql
CREATE TABLE listing_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id        UUID NOT NULL REFERENCES item_offers(id) ON DELETE CASCADE,
  rater_id        UUID NOT NULL REFERENCES users(id),
  ratee_id        UUID NOT NULL REFERENCES users(id),
  score           SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (offer_id, rater_id)   -- cada lado avalia 1 vez por oferta
);

CREATE INDEX listing_ratings_ratee_idx ON listing_ratings(ratee_id);
CREATE INDEX listing_ratings_offer_idx ON listing_ratings(offer_id);
```

### 3.4 Ajuste em `item_offers`

Adicionar `listing_id` em `item_offers` para rastrear qual anúncio gerou a oferta (necessário para fechar o listing correto ao completar a transação e para vincular avaliações ao ciclo de anúncio certo):

```sql
ALTER TABLE item_offers ADD COLUMN listing_id UUID REFERENCES listings(id) ON DELETE SET NULL;
CREATE INDEX item_offers_listing_idx ON item_offers(listing_id);
```

É nullable para manter compatibilidade com ofertas existentes. Novas ofertas sempre preenchem `listing_id`.

Após confirmar o `completed` de uma oferta: `listings.service.close(offer.listing_id)` é chamado automaticamente pelo `OffersService`.

### 3.5 Lifecycle de listing após transação

- Oferta `completed` → `OffersService` chama `ListingsService.close(listingId)` → status = `'closed'`
- Após fechado, o dono pode criar novo listing para o mesmo item (ciclo recomeça)
- Ofertas pendentes do mesmo listing recebem status `rejected` auto (comportamento existente das "irmãs" já implementado)

### 3.6 Migration de dados existentes

Script de migração cria 1 `listing` ativo para cada item que tenha `availability != 'none'`, preenchendo:
- `item_id`, `owner_id` (via collections.user_id)
- `availability` (do item)
- `asking_price` (do item)
- `payment_methods = []` (vazio — usuário pode editar)
- `disclaimer_accepted_at = now()` (assumido aceito)
- `status = 'active'`

Após migração bem-sucedida, remover colunas de `items`.

---

## 4. Backend

### 4.1 Módulo `listings`

**Repository (`listings.repository.ts`):**
- `create(data)` — cria listing
- `findById(id)` — busca por id
- `findActiveByItemId(itemId)` — listing ativo de um item (nullable)
- `findByOwnerId(ownerId, status?)` — listagem do dono com filtro de status
- `searchMarketplace(params)` — migrado de `items.repository.searchMarketplace`, com JOIN em `listings` em vez de `items`
- `update(id, data)` — atualiza status/preço/pagamentos
- `close(id)` — fecha listing (`status = 'closed'`)
- `getFieldSchemasForListings(listingIds[])` — batch fetch de schemas (igual ao de collections)

**Service (`listings.service.ts`):**
- `create(userId, input)` — valida 1 ativo por item, cria listing
- `pause(userId, listingId)` — `active → paused`
- `resume(userId, listingId)` — `paused → active`
- `close(userId, listingId)` — `* → closed`
- `listOwn(userId, status?)` — anúncios do próprio user com items embutidos
- `listMarketplace(viewerId, params)` — anúncios públicos de outros com fieldSchema em batch

**Controller + Routes:**
- `POST /listings` — criar anúncio
- `GET /listings/mine` — meus anúncios
- `PATCH /listings/:id` — editar preço/pagamentos
- `PATCH /listings/:id/pause` — pausar
- `PATCH /listings/:id/resume` — reativar
- `DELETE /listings/:id` — fechar
- `GET /marketplace` — mantém rota existente, passa a consultar `listings` em vez de `items.availability`

**Item cleanup:** remover `searchMarketplace` de `items.repository`, `listMarketplace` de `items.service`, `marketplaceRoutes` de `items.routes`.

### 4.2 Módulo `listing-ratings`

**Repository:**
- `create(data)` — registra avaliação
- `update(id, data)` — edita dentro de 30 dias
- `delete(id, raterId)` — apaga dentro de 30 dias
- `findByOffer(offerId)` — avaliações de uma oferta (máx 2)
- `getReputationSummary(userId)` — `{ avg: number, count: number }` — media + total de notas recebidas

**Service (`listing-ratings.service.ts`):**
- `rate(raterId, offerId, score)` — valida: oferta `completed`, raterId é parte, dentro de 30d, sem nota duplicada
- `updateRating(raterId, ratingId, score)` — valida dentro de 30d
- `deleteRating(raterId, ratingId)` — idem
- `getReputation(userId)` — retorna `{ avg, count, showScore: count >= 3 }` — esconde score se < 3 avaliações

**Notificação:** ao ser avaliado, usuário recebe notificação `rating_received` (novo tipo).

**Routes:**
- `POST /ratings` — criar avaliação (body: offerId, score)
- `PATCH /ratings/:id` — editar
- `DELETE /ratings/:id` — apagar
- `GET /users/:id/reputation` — reputação pública de um usuário

### 4.3 Integração com `OffersService`

Ao transição de oferta para `completed`:
- Criar notificação para ambos os lados convidando a avaliar (`rating_invite`)
- Job cron diário: 31 dias após completed, invalidar avaliações ainda não feitas (limpeza, opcional)

### 4.4 Ajuste no `OfferDialog` — item oferecido

Endpoint existente `GET /collections/:id/items/:itemId` já retorna detalhes do item. O frontend faz fetch do item escolhido para exibir inline. Sem mudança de backend necessária.

---

## 5. Frontend

### 5.1 Renomear / unificar rotas

| Antes | Depois |
|-------|--------|
| `/marketplace` | `/vitrine` |
| `/trades` | `/vitrine/ofertas` |
| — | `/vitrine/meus-anuncios` |

**AppSidebar:** substituir entradas "Marketplace" e "Trocas" por "Vitrine" única com sub-abas (ou badge de não lidos nas ofertas).

### 5.2 VitrineView (`/vitrine`)

Tela unificada com tabs:
- **Explorar** (antes: Marketplace) — grid de listings públicos + filtros (tipo, collection type, preço)
- **Ofertas** (antes: Trades) — recebidas / enviadas com chips de status
- **Meus anúncios** — listings do próprio user com ações de pausar/reativar/fechar

Cada card de listing mostra:
- Capa do item, nome, badge availability (À venda / Para troca / Venda ou troca)
- Avatar + nome do dono + **badge de reputação** (`★ 4.8 · 12` ou "Novo na vitrine")
- Botões no hover: "Ver detalhes" + "Fazer oferta"

### 5.3 Fluxo "Disponibilizar item"

**Remoção:** seção "Disponibilidade" sai do `ItemFormView` (radio cards + preço).

**Novo fluxo:**
1. Em `ItemCard` / `ItemDetailContent`: botão "Disponibilizar" (aparece só se `!listing_active && isOwner`)
2. Clique abre `ListingFormModal` (novo componente):
   - Step 1: **Tipo** — radio: "À venda", "Para troca", "Venda e troca"
   - Step 2 (condicional): **Preço** (se sale ou both) + **Formas de pagamento** (multi-select chips: PIX / Dinheiro / Transferência / Cartão / A combinar) — mínimo 1 obrigatório
   - Step 3: **Aviso legal** — caixa de texto explicativa + checkbox "Li e concordo que a plataforma não intermedia a transação financeira, apenas facilita o contato entre as partes"
   - Botão "Publicar anúncio"
3. Após publicar: item ganha badge âmbar "À venda / Para troca / Venda e troca" no `ItemCard`

**Editar anúncio:** via "Meus anúncios", não pelo form do item.

### 5.4 Meus Anúncios (sub-aba da Vitrine)

Lista dos próprios listings com:
- Card do item (capa, nome, coleção)
- Status badge (Ativo / Pausado / Fechado)
- Preço + formas de pagamento
- Contagem de ofertas pendentes recebidas
- Ações: Editar preço/tipo | Pausar / Reativar | Fechar anúncio

### 5.5 OfferDialog — detalhes side-by-side

Quando `offerType === 'trade'` e offerer escolhe item próprio:
- Fetch de `GET /collections/:id/items/:itemId` para o item escolhido
- Exibição: 2 colunas side-by-side reusando `ItemDetailContent variant="compact"`
  - Coluna esquerda: "Você oferece" — item do offerer
  - Coluna direita: "Você quer" — item do listing
- Loading state enquanto busca
- Error state se fetch falhar

### 5.6 Aviso ao aceitar oferta

No `TradesView` / `OfferCard`, ao clicar "Aceitar":
- `AppConfirmDialog` com recap: nome dos itens/preço + aviso "Lembre-se: a plataforma não intermedia a transação. O combinado é responsabilidade das partes."
- Checkbox não necessário (já foi aceito na criação do anúncio); só confirmação visual.

### 5.7 Sistema de reputação

**`useReputation` composable:**
- `fetchReputation(userId)` → `{ avg, count, showScore }`
- `submitRating(offerId, score)` → cria avaliação
- `updateRating(ratingId, score)` → edita
- `deleteRating(ratingId)` → apaga

**`ReputationBadge.vue`** (novo, reutilizável):
- Props: `userId`, `compact?: boolean`
- `compact = true`: `★ 4.8 · 12` (uma linha; usado em cards)
- `compact = false`: bloco com média, barra por estrela não (B escolhido — só media + count), botão "Ver histórico" futuro
- Se `showScore = false`: mostra "Novo na vitrine" (ícone Sparkles âmbar)

**Onde usar `ReputationBadge`:**
1. `MarketplaceItemCard` (grid da Vitrine) — `compact=true` abaixo do nome do dono
2. `ProfileView` — seção "Vitrine" com `compact=false` + total de transações concluídas
3. `OfferCard` (TradesView) — `compact=true` ao lado do avatar da contraparte

**`RatingDialog.vue`** (novo):
- Abre após oferta `completed` (botão "Avaliar" aparece no card)
- 5 estrelas clicáveis (sem comentário — só nota)
- Mostra "Você já avaliou ★ X" se já avaliou + botão "Editar" dentro de 30d
- Fecha com sucesso state

### 5.8 Bug fixes (junto com refatoração)

Todos os pontos identificados são corrigidos naturalmente pelo novo código:

1. **`OfferDialog` loading infinito** — `loadMyCollections` ganha `try/finally` com reset de flag
2. **`ItemFormView` loading eterno** — `fetchCollection` ganha `try/finally`; erro exibe empty state em vez de loading infinito
3. **`listCollections` sem catch** — `try/catch` adicionado; erro exibe mensagem explícita
4. **`selected` nulo no render** — `v-if="selected && offerOpen"` garante que props chegam válidos

---

## 6. Fluxo de dados completo — criar anúncio

```
ItemCard [Disponibilizar]
  → ListingFormModal
      → POST /listings { itemId, availability, askingPrice, paymentMethods, disclaimerAccepted: true }
      → listings.service.create
          → valida 1 ativo por item
          → INSERT listings
      → response: Listing
  → ItemCard atualiza badge
```

## 7. Fluxo de reputação

```
OfferCard (status=completed)
  → Botão "Avaliar" (disponível por 30d)
  → RatingDialog
      → POST /ratings { offerId, score }
      → listing-ratings.service.rate
          → valida: completed, dentro de 30d, sem duplicata
          → INSERT listing_ratings
      → notificação rating_received para ratee
  → OfferCard atualiza "Você avaliou ★ X"
```

---

## 8. Componentes a criar / renomear

| Componente | Ação |
|-----------|------|
| `MarketplaceView.vue` | Renomear → `VitrineView.vue`, adicionar tabs |
| `TradesView.vue` | Mover conteúdo pra sub-aba "Ofertas" dentro de Vitrine |
| `ListingFormModal.vue` | Criar (substitui seção do ItemFormView) |
| `ReputationBadge.vue` | Criar |
| `RatingDialog.vue` | Criar |
| `OfferDialog.vue` | Estender com side-by-side de itens |
| `ItemFormView.vue` | Remover seção "Disponibilidade" |
| `ItemCard.vue` | Adicionar botão "Disponibilizar" + badge de listing ativo |
| `AppSidebar.vue` | Substituir 2 entradas por "Vitrine" |

---

## 9. Módulos / serviços a criar

| Arquivo | Ação |
|---------|------|
| `src/modules/listings/` | Criar (repository, service, controller, routes, schema) |
| `src/modules/listing-ratings/` | Criar |
| `src/modules/offers/services/listingsService.ts` (frontend) | Criar |
| `src/modules/offers/services/ratingsService.ts` (frontend) | Criar |
| `src/modules/offers/composables/useReputation.ts` | Criar |
| `src/modules/items/items.repository.ts` | Remover `searchMarketplace` |
| `src/modules/items/items.service.ts` | Remover `listMarketplace` |

---

## 10. Migrations necessárias (em ordem)

1. `0027_listings.sql` — enum `listing_status`, tabela `listings`, índices, unique constraint
2. `0028_listing_ratings.sql` — tabela `listing_ratings`, índices
3. `0029_item_offers_listing_id.sql` — `ALTER TABLE item_offers ADD COLUMN listing_id UUID REFERENCES listings(id)`
4. `0030_migrate_item_availability.sql` — script que cria listings dos itens existentes + preenche `item_offers.listing_id` retroativamente onde possível
5. `0031_remove_item_availability.sql` — drop columns `availability` e `asking_price` de `items`; remover enum `item_availability` do backend (ou manter reutilizado em `listings`)

---

## 11. Testes

- `listings.service.test.ts` — criar/pausar/reativar/fechar, validação 1 ativo por item
- `listing-ratings.service.test.ts` — avaliação válida, fora de janela, duplicata, edição/deleção
- Atualizar mocks de `IItemRepository` (sem `searchMarketplace`)
- Integration tests: `POST /listings`, `POST /ratings`, `GET /marketplace`

---

## 12. Out of scope (desta entrega)

- Comentários ou texto livre na avaliação (por decisão de produto)
- Reputação retroativa (por decisão de produto)
- Chat direto a partir de anúncio (usuário usa DM existente)
- Moderação de anúncios (admin review)
- Anúncios com múltiplas fotos (usa cover do item)
