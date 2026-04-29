# Privacidade e estado do chat — design

**Data:** 2026-04-26
**Escopo:** Mute por conversa, visibilidade de presença, read receipts (visto) com toggle recíproco
**Status:** Aprovado para implementação

---

## 1. Resumo

Três features que compartilham o padrão "flag persistida + filtro server-side":

1. **Mute** — usuário silencia uma conversa específica (DM ou grupo).
2. **Visibilidade de presença** — usuário esconde online + last seen para os amigos.
3. **Read receipts** — checks de "enviado" e "visto" estilo WhatsApp em mensagens próprias, com toggle recíproco.

Tudo configurável via `SettingsView`. Não-amigos nunca veem presença independente de toggle (regra de privacidade do projeto).

---

## 2. Decisões de produto

| Tópico | Decisão | Alternativa descartada |
|---|---|---|
| Granularidade de mute | Boolean simples on/off | Duração (8h / 1 semana / sempre) |
| Visibilidade de presença | Toggle único `showPresence` (online + last seen juntos) | Dois toggles independentes |
| Quem vê presença | Apenas amigos (independente do toggle) | Todos |
| Read receipts | 2 estados — enviado / visto | 3 estados (entregue separado) |
| Read receipts em grupo | Visto = todos os outros leram | Pelo menos um leu |
| Privacidade dos checks | Recíproco — desligar = não vê os dos outros | Unilateral |

---

## 3. Schema (migration 0012)

```sql
ALTER TABLE conversation_members
  ADD COLUMN is_muted boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN show_presence boolean NOT NULL DEFAULT true,
  ADD COLUMN show_read_receipts boolean NOT NULL DEFAULT true;
```

Defaults garantem comportamento atual preservado para usuários existentes.

---

## 4. Feature 1 — Mute por conversa

### 4.1 Backend

**Endpoints novos:**
- `POST /chat/conversations/:id/mute` — autentica, valida que viewer é membro, set `is_muted=true`.
- `POST /chat/conversations/:id/unmute` — idem, set `is_muted=false`.

**Service:** `ConversationsService.setMuted(userId, conversationId, muted: boolean)` no `chat/conversations.service.ts`.

**Repository:** método `updateMemberMuted(conversationId, userId, muted)` em `conversations.repository.ts`.

**Exposição:** `Conversation.isMuted: boolean` (do membro requisitante) populado em:
- `findUserConversations` (mappers já fazem join com `conversation_members`)
- `findConversationWithMeta`

### 4.2 Frontend

**`ChatView` header:**
- Botão `Bell` ↔ `BellOff` (lucide) à direita do nome, antes do menu `⋮`.
- Click: `chatStore.toggleMute(convId)` que chama o serviço e atualiza local.

**`ConversationItem`:**
- Ícone `BellOff` 14px cinza ao lado do nome quando `conversation.isMuted`.
- Badge unread fica cinza (`bg-bg-elevated text-text-secondary`) em vez de âmbar (`bg-amber text-bg-base`) quando muted.

**Sidebar (`AppSidebar`):**
- `chatStore.totalUnread` agora soma `unreadCount` apenas de conversas com `isMuted=false`. Ponto colorido na sidebar reflete só não-mutadas.

### 4.3 Notificações

Dentro do escopo desta fase, o efeito de mute é apenas visual (badge cinza, contador filtrado). Quando push notifications/som forem implementados, eles consultam `is_muted` para decidir se disparam.

---

## 5. Feature 2 — Visibilidade de presença

### 5.1 Estado atual (a refatorar)

Hoje em `chat.gateway.ts`:
- Todo socket autenticado entra no room `presence`.
- `io.to('presence').emit('presence:update', ...)` broadcasta pra todos.
- `presence:bulk` no connect é uma lista global.

Isso vaza presença pra desconhecidos e não respeita toggle nenhum.

### 5.2 Refatoração — salas por dono

**Modelo de salas:**
- Para cada usuário X, existe uma sala lógica `presence:{X}` que representa "quem observa a presença de X".
- Os sockets dos **amigos** de X entram em `presence:{X}` ao conectar.
- O próprio X **não entra** em `presence:{X}`.
- Sala global `presence` é descontinuada.

**Conexão (`chat.gateway.ts` no handler de connect):**
1. Buscar amigos do usuário conectando (`friendsRepo.findFriendIds(userId)`).
2. `socket.join('presence:{friendId}')` para cada amigo.
3. Persistir presença, e se `user.showPresence === true`, emitir `presence:update` para `presence:{userId}`.
4. Enviar `presence:bulk` ao socket — lista dos amigos online com `show_presence=true`.

**Mudança de presença:**
- `setOnline/setOffline` em `presence.service`: emitir `presence:update` para `presence:{userId}` somente se o user em questão tem `show_presence=true`. Senão, suprime o emit.

**Convite/aceite de amizade:**
- Quando A aceita amizade de B, sockets ativos de A precisam entrar em `presence:{B}` e vice-versa.
- `friendsService.acceptRequest` ganha hook que chama `chatGateway.linkFriendship(aId, bId)`, método novo no gateway que itera os sockets conectados das duas pontas e faz `socket.join('presence:{otherUserId}')`.
- Mesma chamada também emite `presence:update` retroativo se a outra ponta está online e tem `showPresence=true`.

**Bloqueio:**
- Já desfaz amizade. `friendsService.block` ganha hook `chatGateway.unlinkFriendship(aId, bId)` que faz `socket.leave('presence:{otherUserId}')` nos sockets ativos das duas pontas. Ao reconectar, naturalmente já não está na sala.

### 5.3 Filtro em REST

- `usersService.getProfile(targetId, viewerId)`:
  - Se `viewer` não é amigo de `target` OU `target.show_presence === false` → omitir `isOnline` e `lastSeenAt` da resposta.
- `findUserConversations` e `findConversationWithMeta`:
  - Em `participants[]`, mesma regra para cada participante (já filtra bloqueio; agora filtra presence).

### 5.4 Frontend

- `SettingsView` ganha toggle "Aparecer online e mostrar quando foi visto pela última vez" (`showPresence`).
- Componentes que renderizam `isOnline`/`lastSeenAt` (`ConversationItem`, `ChatView` header, `ProfileView`) já têm v-if condicional — quando o backend não envia, o indicador some sozinho.

---

## 6. Feature 3 — Read receipts

### 6.1 Modelo

Mensagens **próprias** (do viewer) ganham campo `seen`:

- **DM**: `seen: boolean | null`. `true` quando `peer.lastReadAt >= message.createdAt`. `null` quando o filtro recíproco oculta.
- **Grupo**: `seen: { count: number, total: number } | null`. `count` = quantos outros membros leram. `total` = `participants.length - 1`. Visto pleno quando `count === total`.

Mensagens de outros usuários **não recebem** `seen` (não faz sentido na UI).

### 6.2 Filtro recíproco

Em DM:
- Se `viewer.show_read_receipts === false` OU `peer.show_read_receipts === false` → `seen = null`.

Em grupo:
- Se `viewer.show_read_receipts === false` → `seen = null` para todas as mensagens próprias do grupo.
- Senão, `count` inclui apenas membros com `show_read_receipts === true`. Membros com a flag desligada são contados como "não leram" do ponto de vista do `count`, mas o `total` permanece `participants.length - 1`. Resultado: visto pleno só quando todos os membros com a flag ligada leram.

### 6.3 Backend

`messages.service.ts` no `enrichMessages`:
1. Recebe `viewerId` e `viewer.showReadReceipts` (já no contexto da rota).
2. Para mensagens com `userId === viewerId`:
   - Carrega `conversation_members` da conversa (1 query: `lastReadAt` + `users.show_read_receipts` por membro).
   - Computa `seen` conforme as regras acima.
3. Mensagens de outros: pula.

`markAsRead` permanece inalterado — sempre persiste `lastReadAt`.

### 6.4 Socket

Novo evento server→client: `message:read` com `{ conversationId, userId, lastReadAt }`.
- Emitido por `markAsRead` para a sala da conversa.
- Frontend recalcula `seen` localmente das mensagens próprias afetadas (sem refetch).

### 6.5 Frontend

`MessageBubble` (apenas mensagens próprias, qualquer tipo: text/audio/image/call):

| Estado | Renderização |
|---|---|
| `seen === null` | nada (ou só timestamp) |
| DM, `seen === false` | `Check` 14px cinza |
| DM, `seen === true` | `CheckCheck` 14px âmbar |
| Grupo, `count < total` | `CheckCheck` cinza + tooltip "Visto por X de Y" |
| Grupo, `count === total` | `CheckCheck` âmbar + tooltip "Visto por todos" |

Toggle em `SettingsView`: "Mostrar confirmação de leitura — se desligado, você também não verá quando outros leram suas mensagens".

---

## 7. Feature 4 — Endpoint de settings

### 7.1 Backend

**Endpoint novo:** `PATCH /users/me/settings`
- Body: `{ showPresence?: boolean, showReadReceipts?: boolean }` (parcial).
- Validação Zod: ambos opcionais, booleanos.
- Service `usersService.updateSettings(userId, patch)`.

**Side-effects do PATCH:**
- `showPresence: true → false`: `chatGateway.emitPresence(userId, { isOnline: false, lastSeenAt: null })` para `presence:{userId}` — peers veem o usuário "sumir".
- `showPresence: false → true`: emit com estado real (`isOnline=true, lastSeenAt=null` se conectado).
- `showReadReceipts` muda: `chatGateway.emitConversationsRefresh([userId, ...peerIdsDasDmsAtivas])` — frontend refaz fetch e checks aparecem/somem.

**`GET /users/me`** (já existe): passa a incluir `showPresence`, `showReadReceipts`.

### 7.2 Frontend

`SettingsView` (já existe): nova seção "Privacidade do chat" com 2 toggles.
- Estado refletido em `useAuthStore.user` (já tem o user logado).
- Ao alterar, chama `userService.updateSettings({ ... })` e atualiza store local.

---

## 8. Diagrama — fluxo de presença

```
┌─────────┐  connect           ┌──────────┐
│ Socket  │───────────────────▶│ Gateway  │
│ user A  │                    │          │
└─────────┘                    └──────────┘
                                     │
                                     ▼ findFriendIds(A)
                               [B, C, D]
                                     │
                                     ▼
                               socket.join('presence:B')
                               socket.join('presence:C')
                               socket.join('presence:D')
                                     │
                                     ▼ if A.showPresence
                               emit 'presence:update' → 'presence:A'
                                     │
                  ┌──────────────────┼──────────────────┐
                  ▼                  ▼                  ▼
            sockets em        sockets em        sockets em
            presence:A        presence:A        presence:A
            (B online)        (C online)        (D online)
```

---

## 9. Fora do escopo

- **Push notifications** — flag `is_muted` será consultada quando push for implementado, mas não está nesta fase.
- **Som de mensagem** — idem.
- **Mute com duração** (8h, 1 semana). Migra de `is_muted boolean` para `muted_until timestamp` numa fase futura sem perda de dados.
- **Read receipts em mensagens de outros usuários** — não retornado pelo backend.
- **Per-conversation toggle de read receipts** — apenas global.

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Refatoração de presence rooms quebra chamadas em andamento | Manter `presence:{userId}` paralelo ao `presence` global por uma versão; remover global na próxima |
| Custo da query de read receipts em grupos grandes | Limitar enrich aos N últimos messages (já é o caso — pagination); membros são <50 em grupos típicos |
| Race em mute/unmute durante mensagem chegando | Ordem irrelevante — mute afeta UI e contador, mensagem ainda persiste |
| `friendship:established` não recebido por socket offline | Re-join na próxima conexão é suficiente |

---

## 11. Critérios de aceitação

- [ ] Migration 0012 aplica sem erro em base existente.
- [ ] Mutar uma DM esconde unread âmbar, vira cinza, e some do contador da sidebar.
- [ ] `SettingsView` salva `showPresence=false` → `ProfileView` de outro amigo deixa de mostrar online/visto.
- [ ] DM com peer com `showReadReceipts=false`: minhas mensagens não mostram checks.
- [ ] Grupo: enviar mensagem, todos os outros membros lerem → check duplo âmbar com tooltip "Visto por todos".
- [ ] Backend: 0 erros TS. Frontend: 0 erros TS.
- [ ] Testes do `messages.service` passam (incluindo novos casos de `seen`).

---

## 12. Próximo passo

Plano de implementação em `docs/superpowers/plans/2026-04-26-chat-privacidade.md` (gerado pela skill `writing-plans`).
