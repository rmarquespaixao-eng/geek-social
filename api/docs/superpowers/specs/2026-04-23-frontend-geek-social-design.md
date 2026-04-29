# Rede Social Geek — Frontend Design

**Data:** 2026-04-23  
**Repositório:** `geek-social-frontend` (novo, independente do `portal-frontend`)  
**Backend:** `geek-social-api` — Fastify + JWT próprio + Socket.io

---

## Objetivo

Construir o frontend da Rede Social Geek: uma SPA Vue 3 + TypeScript responsiva, com visual dark soft, autenticação JWT própria (sem Keycloak), Socket.io para tempo real e suporte a PWA com Web Push.

A implementação segue a mesma ordem de sub-projetos do backend:
1. Auth + Perfil
2. Coleções e Itens
3. Amigos e Privacidade
4. Feed e Interações
5. Chat em Tempo Real

Cada sub-projeto terá seu próprio plano de implementação.

---

## Stack

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Framework | Vue 3 + TypeScript | Familiaridade do dev, Composition API para composables reutilizáveis |
| Build | Vite + `vite-plugin-pwa` | Suporte a PWA nativo, hot reload rápido |
| Estilo | Tailwind CSS v4 | Liberdade visual total, sem componentes prontos que limitam identidade |
| Roteamento | Vue Router 4 | Lazy-loading por módulo, route guards de auth |
| Estado | Pinia | Store por módulo, TypeScript nativo |
| HTTP | Axios | Instância singleton com interceptors de auth (inject JWT, refresh, logout on 401) |
| Real-time | socket.io-client | Conecta ao gateway do backend |
| Icons | lucide-vue-next | Consistente com o portal-frontend existente |
| PWA | vite-plugin-pwa + Workbox | Service worker, manifest, Web Push |

---

## Arquitetura — Módulos + Shared Layer

```
src/
├── shared/
│   ├── http/           # axios instance configurada + interceptors
│   ├── socket/         # socket.io-client singleton + composable useSocket()
│   ├── auth/           # composable useAuth() — token storage, login state
│   ├── ui/             # componentes base: AppSidebar, AppButton, AppAvatar,
│   │                   # AppModal, AppToast, AppBadge, UserCard
│   └── types/          # interfaces TypeScript espelhando respostas da API
│
├── modules/
│   ├── auth/           # login, registro, editar perfil, configurações
│   ├── collections/    # coleções, itens, field definitions, capa upload
│   ├── friends/        # amigos, bloqueios, busca de usuários, pedidos
│   ├── feed/           # posts, reactions, comentários, compositor
│   └── chat/           # DMs, grupos, mensagens, presença, upload de anexos
│
├── router/             # rotas lazy-loaded + guards de autenticação
├── App.vue             # layout raiz: AppSidebar + <RouterView>
└── main.ts             # bootstrap: Pinia + Router + Socket + PWA
```

Cada módulo em `modules/` tem estrutura interna consistente:
```
<módulo>/
├── components/   # componentes visuais do módulo (não reutilizados fora dele)
├── composables/  # lógica: use<Módulo>Store(), use<Feature>()
├── services/     # chamadas HTTP via shared/http (um arquivo por recurso da API)
├── views/        # páginas roteáveis (<NomeView>.vue)
└── types.ts      # tipos locais do módulo
```

**Regra de dependência:** módulos nunca importam entre si. Comunicação cruzada via stores Pinia ou eventos de socket.

---

## Design System

### Paleta — Dark Soft

| Token | Valor | Uso |
|-------|-------|-----|
| `bg-base` | `#0f0f1a` | Fundo da página |
| `bg-surface` | `#1a1b2e` | Sidebar, headers |
| `bg-card` | `#1e2038` | Cards, inputs, modais |
| `bg-elevated` | `#252640` | Hover states, inputs ativos |
| `border` | `#252640` | Bordas de cards e divisores |
| `text-primary` | `#e2e8f0` | Títulos e texto principal |
| `text-secondary` | `#94a3b8` | Labels, metadados |
| `text-muted` | `#475569` | Placeholders, timestamps |
| `accent-amber` | `#f59e0b` | CTAs primários, itens ativos na sidebar, rating |
| `accent-blue` | `#60a5fa` | Links, badges informativos |
| `accent-purple` | `#a78bfa` | Badges secundários, platina 🏆 |
| `online` | `#22c55e` | Indicador de presença online |
| `offline` | `#475569` | Indicador de presença offline |
| `danger` | `#ef4444` | Badges de erro, contagem de notificações |

### Tipografia
- Font family: sistema (San Francisco / Segoe UI / Inter)
- Tamanhos: 10px (meta), 11px (labels), 12px (body small), 13px (body), 15–16px (títulos de seção)
- Peso: 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

### Border radius
- `4px` — badges, chips pequenos
- `6px` — botões, inputs
- `8–10px` — cards
- `50%` — avatares

---

## Navegação — Sidebar Colapsável

Padrão Discord: sidebar sempre visível, texto + ícones no desktop, só ícones no mobile.

**Breakpoint de colapso:** `< 768px` — sidebar passa de 220px para 52px

**Itens da sidebar (ordem):**
1. 🏠 Feed
2. 🎮 Coleções
3. 👥 Amigos _(badge vermelho com contagem de pedidos pendentes)_
4. 💬 Chat _(badge âmbar com contagem de mensagens não lidas)_
5. 🔔 Notificações
6. ─── (separador)
7. Avatar + nome + status online (rodapé) → abre menu de perfil/configurações

**Route guards:** todas as rotas exceto `/login` e `/register` requerem JWT válido. Expiração detectada pelo interceptor Axios (401) → redirect para `/login`.

---

## Responsividade

| Breakpoint | Sidebar | Layout principal |
|------------|---------|-----------------|
| `≥ 1024px` | 220px expandida (ícone + texto) | Feed: duas colunas (posts + painel lateral) |
| `768–1023px` | 52px colapsada (só ícones) | Feed: coluna única |
| `< 768px` | 52px colapsada | Coluna única, padding reduzido |

Coleções: grid de capas passa de 4 colunas (desktop) → 3 colunas (tablet) → 2 colunas (mobile).

---

## Módulos — Telas por Sub-projeto

### Sub-projeto 1 — Auth + Perfil
- `/login` — formulário email + senha, link para registro
- `/register` — cadastro com nome de exibição, email, senha
- `/profile/:username` — perfil público: capa, avatar, stats, abas (feed / coleções / amigos)
- `/settings` — editar perfil: foto, nome, sobre mim, privacidade, trocar senha

### Sub-projeto 2 — Coleções e Itens
- `/collections` — grid 2×N de cards de coleção com capa customizável
- `/collections/:id` — detalhe: banner de capa + grade de itens (toggle ⊞/≡)
- `/collections/:id/items/:itemId` — detalhe do item com campos dinâmicos por tipo

**Comportamento da capa de coleção:**
- Usuário faz upload de foto (JPEG/PNG) → backend processa com Sharp → S3
- Sem capa: placeholder com ícone do tipo da coleção (🎮 📚 🃏 🎲)
- Botão 📷 sobreposto sobre a capa para trocar a imagem

**Itens:** exibidos como cards portrait 3:4 com capa, avaliação em estrelas e badge 🏆 (platinado). Vista lista alternativa: capa pequena + título + tipo + ano + avaliação.

### Sub-projeto 3 — Amigos e Privacidade
- `/friends` — abas: Amigos (online primeiro) / Pedidos (aceitar/recusar) / Bloqueados
- Busca de usuários (campo de search em `/friends`)
- Pedidos de amizade recebidos com contador no badge da sidebar

### Sub-projeto 4 — Feed e Interações
- `/` (raiz) → `/feed` — posts cronológicos dos amigos, compositor de post
- Posts: texto, imagem, evento de coleção ("adicionou X à coleção Y")
- Reações ⚡ (curtida), 💬 comentários inline
- Painel lateral no desktop: amigos online + suas coleções

### Sub-projeto 5 — Chat
- `/chat` — layout dividido: lista de conversas (esquerda) + área de mensagens (direita)
- DMs e grupos (até 15 membros)
- Bolhas de mensagem com timestamps, indicador de digitação (três pontos animados)
- Upload de anexos (imagens, arquivos)
- Presença em tempo real: dot verde (online) / cinza (offline) nos avatares
- Pedidos de DM para não-amigos (banner de solicitação na conversa)

---

## PWA

- **Manifest:** nome "GeekNet", ícone 512×512 (âmbar sobre dark), `theme_color: #0f0f1a`
- **Service worker:** via Workbox (vite-plugin-pwa), estratégia `NetworkFirst` para API, `CacheFirst` para assets estáticos
- **Web Push:** ao fazer login, o frontend solicita permissão de notificação → chama `POST /chat/push` com a PushSubscription do browser → backend armazena e envia via VAPID quando o usuário estiver offline

---

## Auth — JWT Próprio

O backend emite JWT com payload `{ sub: userId, exp }`. Sem Keycloak.

**Fluxo no frontend:**
1. `POST /auth/login` → recebe `{ token, user }`
2. Token salvo em `localStorage`
3. Axios interceptor injeta `Authorization: Bearer <token>` em todas as requisições
4. Interceptor de resposta: se 401 → limpa token + redireciona para `/login` (sem refresh — backend não tem endpoint de refresh)
5. `useAuth()` composable expõe: `user`, `isAuthenticated`, `login()`, `logout()`

---

## Socket.io — Integração

- Conexão iniciada após login bem-sucedido, com `auth: { token }`
- Singleton gerenciado em `shared/socket/socket.ts`
- Composable `useSocket()` expõe: `on()`, `emit()`, `off()`
- Eventos recebidos pelo frontend:
  - `message:new` — nova mensagem no chat
  - `message:deleted` — mensagem removida
  - `typing` — indicador de digitação
  - `presence:update` — usuário ficou online/offline
  - `member:added` / `member:removed` — membros de grupo
  - `conversation:updated` — grupo atualizado (nome, capa)

---

## Decomposição em Planos de Implementação

Cada sub-projeto gera um plano independente em `docs/superpowers/plans/`:

| Plano | Conteúdo |
|-------|----------|
| `frontend-1-auth-profile` | Setup do repo, Tailwind, router, shared layer, login, registro, perfil |
| `frontend-2-collections` | Coleções CRUD, itens, upload de capa, grade/lista |
| `frontend-3-friends` | Lista de amigos, pedidos, busca, bloqueios |
| `frontend-4-feed` | Feed, compositor, reações, comentários |
| `frontend-5-chat` | Socket.io client, DMs, grupos, presença, push |
