# Sub-projeto 5 — Chat em Tempo Real

**Data:** 2026-04-23
**Status:** Aprovado

---

## Contexto

Chat em tempo real para a rede geek. Usuários trocam mensagens diretas (DMs) e participam de salas de grupo criadas por eles mesmos. Comunicação via Socket.io embutido no Fastify — single instance, sem Redis adapter por enquanto (projeto experimental/portfólio).

---

## Modelo de Dados

### `conversations`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| type | enum: `dm \| group` | |
| name | text | nullable — só grupos |
| description | text | nullable — só grupos |
| cover_url | text | nullable — só grupos |
| created_by | uuid FK → users | nullable — só grupos |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### `conversation_members`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid FK → conversations CASCADE | |
| user_id | uuid FK → users CASCADE | |
| role | enum: `owner \| admin \| member` | DMs sempre `member` |
| permissions | jsonb | `{ can_send_messages: bool, can_send_files: bool }` — default ambos true |
| joined_at | timestamptz | |
| last_read_at | timestamptz | base para contagem de não lidas |

**Constraint:** `UNIQUE(conversation_id, user_id)`

---

### `dm_requests`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| sender_id | uuid FK → users CASCADE | |
| receiver_id | uuid FK → users CASCADE | |
| status | enum: `pending \| accepted \| rejected` | |
| conversation_id | uuid FK → conversations | nullable — preenchido ao aceitar |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Constraint:** `UNIQUE(sender_id, receiver_id)`

> Amigos confirmados abrem DM diretamente sem pedido. Pedido de DM é só para não-amigos.

---

### `messages`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| conversation_id | uuid FK → conversations CASCADE | |
| user_id | uuid FK → users CASCADE | |
| content | text | nullable — mensagem pode ser só com anexo |
| deleted_at | timestamptz | nullable — soft delete |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Índice:** `(conversation_id, created_at DESC)` — paginação cursor-based

Conteúdo suporta emojis nativamente via UTF-8 — sem processamento especial.

---

### `message_attachments`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| message_id | uuid FK → messages CASCADE | |
| url | text | URL no S3 |
| filename | text | nome original do arquivo |
| mime_type | text | |
| size_bytes | integer | |
| display_order | integer | |

---

### `push_subscriptions`

| campo | tipo | observação |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users CASCADE | |
| endpoint | text UNIQUE | URL do push service |
| p256dh | text | chave pública |
| auth | text | segredo de autenticação |
| created_at | timestamptz | |

> Infra backend pronta; entrega de push só funciona quando o frontend (Vue 3) existir.

---

### `user_presence`

| campo | tipo | observação |
|---|---|---|
| user_id | uuid PK FK → users CASCADE | |
| last_seen_at | timestamptz | upsertado ao desconectar |
| updated_at | timestamptz | |

Online/offline em tempo real fica em memória no Socket.io. `user_presence` persiste `last_seen_at` entre reinicializações.

---

## Arquitetura de Código

```
src/modules/chat/
  chat.gateway.ts              Socket.io — conecta ao httpServer, auth middleware, event handlers
  chat.routes.ts               REST routes
  chat.controller.ts           REST controllers
  chat.schema.ts               schemas Zod compartilhados
  conversations.service.ts     CRUD de conversas, membros e permissões
  messages.service.ts          Envio, deleção, histórico, upload de anexos
  dm-requests.service.ts       Pedidos de DM (enviar, aceitar, rejeitar)
  presence.service.ts          Map em memória de online/offline + upsert last_seen_at
  push.service.ts              Web Push via web-push (infra pronta)
  conversations.repository.ts
  messages.repository.ts
  dm-requests.repository.ts
  presence.repository.ts       upsert/select de user_presence
  push.repository.ts           CRUD de push_subscriptions

src/shared/contracts/
  conversations.repository.contract.ts
  messages.repository.contract.ts
  dm-requests.repository.contract.ts
  push.repository.contract.ts
```

**Princípio de isolamento:** `ChatGateway` é o único ponto que conhece o Socket.io. Os services não sabem que existe WebSocket — recebem chamadas do gateway e retornam dados. O gateway emite os eventos para as rooms após cada operação.

**Integração em `src/app.ts`:**

```typescript
// rotas REST registradas antes de listen()
await app.register(chatRoutes, { prefix: '/chat', conversationsService, messagesService, dmRequestsService })

// Socket.io conectado ao httpServer após listen()
const httpServer = await app.listen(...)
const chatGateway = new ChatGateway(httpServer, conversationsService, messagesService, presenceService)
```

**Migration:** `0004_chat.sql` — enums + 6 tabelas novas.

---

## Real-time (Socket.io)

**Namespace:** `/chat`

**Autenticação:** JWT passado no handshake (header ou query param). O middleware do Socket.io valida com a mesma lógica do `authenticate` do Fastify, populando `socket.data.userId`. Conexão recusada se token inválido.

**Rooms:** cada conversa é uma room `conv:${conversationId}`. Ao conectar, o servidor junta o usuário em todas as suas conversas ativas. Presença global usa uma room especial `presence`.

### Eventos — Cliente → Servidor

| evento | payload | descrição |
|---|---|---|
| `message:send` | `{ conversationId, content?, attachmentIds? }` | enviar mensagem |
| `conversation:read` | `{ conversationId }` | atualiza `last_read_at` |
| `typing:start` | `{ conversationId }` | começou a digitar |
| `typing:stop` | `{ conversationId }` | parou de digitar |

### Eventos — Servidor → Cliente

| evento | payload | descrição |
|---|---|---|
| `message:new` | `{ message }` | nova mensagem |
| `message:deleted` | `{ messageId, conversationId }` | mensagem deletada |
| `typing` | `{ conversationId, userId, isTyping }` | indicador de digitação |
| `presence:update` | `{ userId, online, lastSeenAt }` | status de presença |
| `conversation:updated` | `{ conversation }` | sala atualizada |
| `member:added` | `{ conversationId, member }` | novo membro |
| `member:removed` | `{ conversationId, userId }` | membro removido |

**Presença:** `Map<userId, Set<socketId>>` em memória. Ao desconectar o último socket, emite `presence:update { online: false }` e faz upsert em `user_presence`. Typing indicators são puramente in-memory, sem persistência.

**Deleção de mensagem:** via REST (`DELETE /chat/messages/:id`). Após a deleção, o controller notifica o gateway que emite `message:deleted` para a room da conversa.

**Upload de anexos:** arquivos **não** passam pelo WebSocket. Fluxo: `POST /chat/attachments` (REST) → recebe `attachmentId` → inclui no `message:send`.

---

## Endpoints REST

Todas as rotas exigem `authenticate`. Bloqueio (sub-projeto 3) se aplica — usuário bloqueado recebe 404.

### DMs e Pedidos

```
POST   /chat/dm-requests                   enviar pedido de DM (para não-amigos)
GET    /chat/dm-requests                   listar pedidos recebidos (pending)
POST   /chat/dm-requests/:id/accept        aceitar pedido → cria conversa
POST   /chat/dm-requests/:id/reject        rejeitar pedido
POST   /chat/dm                            abrir DM direto com amigo (sem pedido)
```

### Salas de Grupo

```
POST   /chat/groups                        criar sala
GET    /chat/groups/:id                    detalhes da sala
PATCH  /chat/groups/:id                    editar nome/descrição/cover (owner ou admin)
DELETE /chat/groups/:id                    deletar sala (só owner)
POST   /chat/groups/:id/cover              upload da imagem da sala
```

### Membros

```
POST   /chat/groups/:id/members            convidar membro
DELETE /chat/groups/:id/members/:userId    remover membro (admin ou owner)
PATCH  /chat/groups/:id/members/:userId    alterar role ou permissions
POST   /chat/groups/:id/leave             sair da sala
```

### Mensagens

```
GET    /chat/conversations/:id/messages    histórico cursor-based (?cursor=&limit=50)
DELETE /chat/messages/:id                  deletar mensagem (soft delete — só autor)
```

### Anexos

```
POST   /chat/attachments                   upload multipart → { attachmentId, url, filename, mimeType, sizeBytes }
```

### Conversas

```
GET    /chat/conversations                 lista DMs + grupos do usuário com last_message + unread_count
```

### Push

```
POST   /chat/push-subscriptions            registrar subscription
DELETE /chat/push-subscriptions/:id        cancelar subscription
```

---

## Regras de Negócio

### DMs

- Amigos confirmados: abrem DM direto via `POST /chat/dm` — sem pedido necessário
- Não-amigos: fluxo de pedido (`dm_requests`) — receiver aceita ou rejeita
- Usuário bloqueado em qualquer direção → 404
- Pedido duplicado → ALREADY_EXISTS
- Pedido de amigo via dm-requests → erro (deve usar `POST /chat/dm`)

### Salas de Grupo

- Criador entra como `owner`
- Owner transfere ownership promovendo outro membro a owner — criador vira admin
- Owner sai sem transferir → admin mais antigo vira owner automaticamente; se não houver admin, membro mais antigo vira owner; se for o último membro, sala é deletada
- Admin não pode remover ou alterar role de outro admin ou do owner
- Só owner pode deletar a sala

### Permissões por Membro

- Default ao entrar: `{ can_send_messages: true, can_send_files: true }`
- Owner ou admin pode alterar permissions de qualquer membro (exceto do próprio owner)
- Mensagem enviada com `can_send_messages: false` → 403
- Arquivo enviado com `can_send_files: false` → 403

### Mensagens

- `content` e `attachmentIds` são ambos opcionais, mas pelo menos um deve estar presente
- Soft delete: `deleted_at` preenchido, conteúdo substituído por `[mensagem deletada]` no retorno
- Apenas o autor pode deletar a própria mensagem
- Histórico usa cursor-based pagination `(createdAt DESC, id DESC)` — mesmo padrão do feed

### Presença

- Online: usuário tem pelo menos um socket conectado
- Offline: último socket desconectou — persiste `last_seen_at`
- `typing` emitido para a room da conversa, excluindo o próprio emissor
- Typing não persiste — puramente in-memory

### Push Notifications

- Backend envia push quando usuário está offline (nenhum socket conectado) e recebe mensagem nova
- Biblioteca: `web-push` com VAPID keys configuradas via env
- Delivery real depende do frontend registrar uma service worker — infra de backend pronta

---

## Upload de Arquivos

- `POST /chat/attachments` — multipart, mesmo pipeline do projeto (Sharp + S3)
- Imagens: resize 1200×1200 max, webp quality 85
- Outros arquivos (PDF, ZIP, etc.): upload direto sem processamento
- Limite: 10 MB por arquivo
- Retorna `attachmentId` antes de enviar a mensagem — permite reuso e cancelamento

---

## Testes

Padrão: Vitest + mocks manuais das interfaces, sem testes de gateway ou controller.

### `conversations.service.test.ts`
- Criar sala de grupo — happy path
- Criar DM direto entre amigos — happy path
- Tentar DM direto com não-amigo → erro
- Editar sala — owner (ok), admin (ok), membro (403), sala inexistente (404)
- Deletar sala — owner (ok), não-owner (403)
- Sair da sala como owner sem transferir → próximo admin vira owner
- Convidar membro — admin (ok), membro comum (403), usuário bloqueado (404)
- Remover membro — owner remove admin (ok), admin remove membro (ok), admin tenta remover admin (403)
- Alterar role para owner → transfere ownership (criador vira admin)
- Alterar permissions — admin pode, membro não pode

### `dm-requests.service.test.ts`
- Enviar pedido para não-amigo — happy path
- Enviar pedido para amigo → erro
- Enviar pedido para usuário bloqueado → 404
- Pedido duplicado → ALREADY_EXISTS
- Aceitar pedido — receiver (ok), não-receiver (404), status já aceito (NOT_PENDING)
- Rejeitar pedido — receiver (ok), já rejeitado (NOT_PENDING)

### `messages.service.test.ts`
- Enviar mensagem com texto — happy path
- Enviar mensagem só com anexo — happy path
- Enviar sem conteúdo nem anexo → erro
- Enviar em conversa que não é membro → 404
- Enviar com `can_send_messages: false` → 403
- Enviar arquivo com `can_send_files: false` → 403
- Deletar mensagem — autor (ok), não-autor (403)
- Histórico — cursor encode/decode correto, sem duplicatas entre páginas

### `presence.service.test.ts`
- Usuário conecta → aparece online no Map
- Usuário desconecta último socket → sai do Map, persiste `last_seen_at`
- Usuário com múltiplos sockets — só desconecta quando todos fecham

---

## Fora de Escopo (fases futuras)

- E2E encryption — sub-projeto 8
- Menções (`@usuario`) dentro de mensagens
- Threads/respostas aninhadas
- Reações com emoji em mensagens específicas
- Edição de mensagens enviadas
- Chamadas de voz/vídeo
- Integração de sala com coleções (canal de uma coleção específica)
