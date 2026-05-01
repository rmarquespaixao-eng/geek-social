# E2E — Geek Social

Testes ponta-a-ponta com **Playwright**. Tudo é exercitado via UI (registro, login,
navegação, formulários, WebSocket de chat) — **sem atalhos pela API**. O intuito
é verificar que a interface funciona junto com o backend e detectar regressões
visuais/funcionais que testes unitários não pegam.

## Pré-requisitos

1. Stack rodando local:
   ```bash
   docker compose up -d
   ```
   Aguarda saúde de `db`, `minio`, `api-migrate`. A API fica em `:3000` e o
   front em `:8080` (via nginx do container).

2. Dependências do e2e:
   ```bash
   cd e2e
   npm install
   npx playwright install chromium   # ou --with-deps em CI
   ```

## Rodar

```bash
# Headless (default)
npm test

# Com browser visível
npm run test:headed

# Modo UI interativo do Playwright (timeline, retry rápido, debug)
npm run test:ui

# Debug com inspector (passo-a-passo)
npm run test:debug

# Ver relatório HTML do último run
npm run report
```

### Rodar contra Vite dev server (não dockerizado)

Se preferir usar `npm run dev` no `frontend/` (roda em `:5173`):

```bash
E2E_BASE_URL=http://localhost:5173 npm test
```

## Estrutura

```
e2e/
├── fixtures/
│   ├── test.ts       # extensão do test do Playwright + helpers (registerViaUI, loginViaUI)
│   └── files.ts      # PNG 1×1 em buffer pra uploads de capa/ícone
├── specs/
│   ├── auth.spec.ts            # registro, login, refresh, logout, change-password, forgot
│   ├── communities.spec.ts     # discover, criar comunidade, listar
│   ├── friends-chat.spec.ts    # 2 contexts: pedido → aceitar → DM em tempo real
│   ├── marketplace.spec.ts     # smoke da Vitrine (filtros + abas)
│   └── feed.spec.ts            # estado vazio + widgets + zero erros JS
├── playwright.config.ts        # base URL via E2E_BASE_URL, traces em falha
├── package.json
└── README.md
```

## Cobertura

| Spec | Profundidade |
|---|---|
| auth | **completo** — todos os fluxos críticos pós-correção (registro, login, logout, refresh, change-password com revogação, forgot, rota protegida) |
| communities | **médio** — criação completa com upload de imagens; deeper (tópicos, moderação) fica TODO |
| friends-chat | **completo** — pedido + aceitar + DM em tempo real (2 browsers em paralelo) |
| marketplace | **smoke** — listings completas exigem coleções+itens+field-defs seedados, fora do escopo agora |
| feed | **smoke + qualidade** — empty state, widgets, watchdog de erro JS |

## Princípios

- **Sem API setup.** Cada spec começa em `/register`. Mais lento, mas reflete
  a experiência real do usuário e captura bugs em todo o stack.
- **Cada spec cria seus próprios usuários** com email único (`prefix-timestamp-rnd@e2e.local`).
  Não há dependência entre tests; podem rodar em paralelo.
- **Locators semânticos** (`getByLabel`, `getByRole`, `getByPlaceholder`, `getByTestId`)
  em vez de classes CSS. Mais resiliente a refactor de estilo.
- **Falha rica em contexto:** trace + screenshot + vídeo gerados automaticamente
  em `test-results/` quando algum teste quebra. Abrir com:
  ```bash
  npx playwright show-trace test-results/<spec>/trace.zip
  ```

## Limitações conhecidas

- **Verificação de e-mail**: o `/auth/verify-email` precisa do token enviado
  por e-mail. Em dev o `ConsoleEmailAdapter` só loga no stdout da API; sem
  endpoint de captura, esse fluxo não é exercitado. Pra cobrir: adicionar um
  endpoint `GET /auth/test-only/last-verification-token/:userId` gateado por
  `NODE_ENV !== 'production'`.
- **Google OAuth**: não testado (exige conta real ou mock do provider).
- **Logout-all**: endpoint existe na API (`/auth/logout-all`) mas não há UI.
  Será testado quando a tela de "sessões ativas" for adicionada em `/settings`.

## Adicionando data-testid

Quando um seletor estiver frágil (ex.: depende de texto que vai mudar), adicione
`data-testid="..."` no template Vue e use `page.getByTestId('...')` no spec.
Não faça selector chains longas em CSS — quebra na primeira refatoração de classe.
