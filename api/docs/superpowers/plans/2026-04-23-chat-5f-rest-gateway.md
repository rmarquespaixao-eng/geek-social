# Chat — Fase F: REST Layer + Socket.io Gateway + Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor todos os endpoints REST do chat, criar o gateway Socket.io e integrar tudo em app.ts.

**Architecture:** Controller é uma classe com métodos de handler. Routes registra os handlers no Fastify. ChatGateway recebe os services + uma função de verify JWT (app.jwt.verify) para não precisar de dep extra. Sem testes de controller ou gateway.

**Tech Stack:** Fastify 5, socket.io, Zod, TypeScript

**Pré-requisito:** Todas as fases anteriores completas.

---

### Task 1: chat.schema.ts — Zod schemas para validação REST

**Files:**
- Create: `src/modules/chat/chat.schema.ts`

- [ ] **Criar chat.schema.ts**

```typescript
import { z } from 'zod'

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
})

export const inviteMemberSchema = z.object({
  userId: z.string().uuid(),
})

export const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
})

export const updateMemberPermissionsSchema = z.object({
  can_send_messages: z.boolean(),
  can_send_files: z.boolean(),
})

export const openDmSchema = z.object({
  friendId: z.string().uuid(),
})

export const sendDmRequestSchema = z.object({
  receiverId: z.string().uuid(),
})

export const registerPushSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
})

export const getHistoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
```

- [ ] **Commit**

```bash
git add src/modules/chat/chat.schema.ts
git commit -m "feat: schemas Zod para endpoints REST do chat"
```

---

### Task 2: chat.controller.ts

**Files:**
- Create: `src/modules/chat/chat.controller.ts`

- [ ] **Criar chat.controller.ts**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ConversationsService } from './conversations.service.js'
import type { MessagesService } from './messages.service.js'
import type { DmRequestsService } from './dm-requests.service.js'
import type { PushService } from './push.service.js'
import type { ChatGateway } from './chat.gateway.js'
import { ChatError } from './chat.errors.js'
import {
  createGroupSchema, updateGroupSchema, inviteMemberSchema,
  updateMemberRoleSchema, updateMemberPermissionsSchema,
  openDmSchema, sendDmRequestSchema, registerPushSchema,
  getHistoryQuerySchema,
} from './chat.schema.js'

function handleChatError(error: unknown, reply: FastifyReply) {
  if (error instanceof ChatError) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      FORBIDDEN: 403,
      ALREADY_EXISTS: 409,
      ALREADY_MEMBER: 409,
      NOT_PENDING: 409,
      FRIENDS_USE_DM: 422,
      NOT_FRIENDS: 422,
      SELF_REQUEST: 422,
      EMPTY_MESSAGE: 422,
    }
    return reply.status(statusMap[error.code] ?? 400).send({ error: error.code })
  }
  throw error
}

export class ChatController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly dmRequestsService: DmRequestsService,
    private readonly pushService: PushService,
    private readonly chatGateway: ChatGateway,
  ) {}

  // DM direto entre amigos
  async openDm(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const { friendId } = openDmSchema.parse(req.body)
    try {
      const conversation = await this.conversationsService.openDirectDm(userId, friendId)
      return reply.status(201).send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  // Pedidos de DM
  async sendDmRequest(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const { receiverId } = sendDmRequestSchema.parse(req.body)
    try {
      const request = await this.dmRequestsService.sendRequest(userId, receiverId)
      return reply.status(201).send(request)
    } catch (e) { return handleChatError(e, reply) }
  }

  async listDmRequests(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const requests = await this.dmRequestsService.listReceivedPending(userId)
    return reply.send(requests)
  }

  async acceptDmRequest(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    try {
      const conversation = await this.dmRequestsService.acceptRequest(req.params.id, userId)
      return reply.status(201).send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  async rejectDmRequest(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    try {
      await this.dmRequestsService.rejectRequest(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  // Grupos
  async createGroup(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const data = createGroupSchema.parse(req.body)
    const conversation = await this.conversationsService.createGroup(userId, data)
    return reply.status(201).send(conversation)
  }

  async getGroup(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    try {
      const conversation = await this.conversationsService.getConversation(req.params.id, userId)
      return reply.send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  async updateGroup(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const data = updateGroupSchema.parse(req.body)
    try {
      const conversation = await this.conversationsService.updateGroup(req.params.id, userId, data)
      return reply.send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  async deleteGroup(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    try {
      await this.conversationsService.deleteGroup(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async uploadGroupCover(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const file = await req.file()
    if (!file) return reply.status(400).send({ error: 'FILE_REQUIRED' })
    const buffer = await file.toBuffer()
    try {
      const conversation = await this.conversationsService.uploadGroupCover(req.params.id, userId, buffer, file.mimetype)
      return reply.send(conversation)
    } catch (e) { return handleChatError(e, reply) }
  }

  // Membros
  async inviteMember(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const { userId: targetUserId } = inviteMemberSchema.parse(req.body)
    try {
      const member = await this.conversationsService.inviteMember(req.params.id, userId, targetUserId)
      this.chatGateway.emitMemberAdded(req.params.id, member)
      return reply.status(201).send(member)
    } catch (e) { return handleChatError(e, reply) }
  }

  async removeMember(req: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const callerId = (req.user as any).sub as string
    try {
      await this.conversationsService.removeMember(req.params.id, callerId, req.params.userId)
      this.chatGateway.emitMemberRemoved(req.params.id, req.params.userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async updateMemberRole(req: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const callerId = (req.user as any).sub as string
    const { role } = updateMemberRoleSchema.parse(req.body)
    try {
      await this.conversationsService.updateMemberRole(req.params.id, callerId, req.params.userId, role)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async updateMemberPermissions(req: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) {
    const callerId = (req.user as any).sub as string
    const permissions = updateMemberPermissionsSchema.parse(req.body)
    try {
      await this.conversationsService.updateMemberPermissions(req.params.id, callerId, req.params.userId, permissions)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async leaveConversation(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    try {
      await this.conversationsService.leaveConversation(req.params.id, userId)
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  // Mensagens
  async getHistory(req: FastifyRequest<{ Params: { id: string }; Querystring: unknown }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const { cursor, limit } = getHistoryQuerySchema.parse(req.query)
    try {
      const messages = await this.messagesService.getHistory(req.params.id, userId, cursor, limit)
      return reply.send(messages)
    } catch (e) { return handleChatError(e, reply) }
  }

  async deleteMessage(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    try {
      await this.messagesService.deleteMessage(req.params.id, userId)
      // gateway emite message:deleted — precisa do conversationId; buscar antes de deletar
      return reply.status(204).send()
    } catch (e) { return handleChatError(e, reply) }
  }

  async uploadAttachment(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } })
    if (!file) return reply.status(400).send({ error: 'FILE_REQUIRED' })
    const buffer = await file.toBuffer()
    try {
      const attachment = await this.messagesService.uploadAttachment(
        req.params.id, userId, buffer, file.mimetype, file.filename, buffer.length,
      )
      return reply.status(201).send(attachment)
    } catch (e) { return handleChatError(e, reply) }
  }

  // Conversas
  async listConversations(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const conversations = await this.conversationsService.listConversations(userId)
    return reply.send(conversations)
  }

  // Push
  async registerPush(req: FastifyRequest, reply: FastifyReply) {
    const userId = (req.user as any).sub as string
    const data = registerPushSchema.parse(req.body)
    const subscription = await this.pushService.registerSubscription(userId, data)
    return reply.status(201).send(subscription)
  }

  async removePush(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    await this.pushService.removeSubscription(req.params.id)
    return reply.status(204).send()
  }
}
```

- [ ] **Commit**

```bash
git add src/modules/chat/chat.controller.ts
git commit -m "feat: ChatController — handlers REST para todos os endpoints de chat"
```

---

### Task 3: chat.routes.ts

**Files:**
- Create: `src/modules/chat/chat.routes.ts`

- [ ] **Criar chat.routes.ts**

```typescript
import type { FastifyInstance } from 'fastify'
import type { ConversationsService } from './conversations.service.js'
import type { MessagesService } from './messages.service.js'
import type { DmRequestsService } from './dm-requests.service.js'
import type { PushService } from './push.service.js'
import type { ChatGateway } from './chat.gateway.js'
import { ChatController } from './chat.controller.js'

type ChatRoutesOptions = {
  conversationsService: ConversationsService
  messagesService: MessagesService
  dmRequestsService: DmRequestsService
  pushService: PushService
  chatGateway: ChatGateway
}

export async function chatRoutes(app: FastifyInstance, opts: ChatRoutesOptions) {
  const ctrl = new ChatController(
    opts.conversationsService,
    opts.messagesService,
    opts.dmRequestsService,
    opts.pushService,
    opts.chatGateway,
  )

  const auth = { onRequest: [app.authenticate] }

  // DM direto entre amigos
  app.post('/dm', { ...auth }, ctrl.openDm.bind(ctrl))

  // Pedidos de DM
  app.post('/dm-requests', { ...auth }, ctrl.sendDmRequest.bind(ctrl))
  app.get('/dm-requests', { ...auth }, ctrl.listDmRequests.bind(ctrl))
  app.post('/dm-requests/:id/accept', { ...auth }, ctrl.acceptDmRequest.bind(ctrl))
  app.post('/dm-requests/:id/reject', { ...auth }, ctrl.rejectDmRequest.bind(ctrl))

  // Grupos
  app.post('/groups', { ...auth }, ctrl.createGroup.bind(ctrl))
  app.get('/groups/:id', { ...auth }, ctrl.getGroup.bind(ctrl))
  app.patch('/groups/:id', { ...auth }, ctrl.updateGroup.bind(ctrl))
  app.delete('/groups/:id', { ...auth }, ctrl.deleteGroup.bind(ctrl))
  app.post('/groups/:id/cover', { ...auth }, ctrl.uploadGroupCover.bind(ctrl))

  // Membros
  app.post('/groups/:id/members', { ...auth }, ctrl.inviteMember.bind(ctrl))
  app.delete('/groups/:id/members/:userId', { ...auth }, ctrl.removeMember.bind(ctrl))
  app.patch('/groups/:id/members/:userId/role', { ...auth }, ctrl.updateMemberRole.bind(ctrl))
  app.patch('/groups/:id/members/:userId/permissions', { ...auth }, ctrl.updateMemberPermissions.bind(ctrl))
  app.post('/groups/:id/leave', { ...auth }, ctrl.leaveConversation.bind(ctrl))

  // Mensagens
  app.get('/conversations/:id/messages', { ...auth }, ctrl.getHistory.bind(ctrl))
  app.delete('/messages/:id', { ...auth }, ctrl.deleteMessage.bind(ctrl))
  app.post('/conversations/:id/attachments', { ...auth }, ctrl.uploadAttachment.bind(ctrl))

  // Conversas
  app.get('/conversations', { ...auth }, ctrl.listConversations.bind(ctrl))

  // Push
  app.post('/push-subscriptions', { ...auth }, ctrl.registerPush.bind(ctrl))
  app.delete('/push-subscriptions/:id', { ...auth }, ctrl.removePush.bind(ctrl))
}
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/modules/chat/chat.routes.ts
git commit -m "feat: chatRoutes — registro de todos os endpoints REST do chat no Fastify"
```

---

### Task 4: chat.gateway.ts — Socket.io

**Files:**
- Create: `src/modules/chat/chat.gateway.ts`

- [ ] **Criar chat.gateway.ts**

```typescript
import { Server as SocketIOServer } from 'socket.io'
import type { Server as HttpServer } from 'node:http'
import type { ConversationsService } from './conversations.service.js'
import type { MessagesService } from './messages.service.js'
import type { PresenceService } from './presence.service.js'
import type { PushService } from './push.service.js'
import type { ConversationMember } from '../../shared/contracts/conversations.repository.contract.js'
import { env } from '../../config/env.js'

type JwtVerifyFn = (token: string) => { sub: string; [key: string]: unknown }

export class ChatGateway {
  private io: SocketIOServer

  constructor(
    httpServer: HttpServer,
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly presenceService: PresenceService,
    private readonly pushService: PushService,
    private readonly jwtVerify: JwtVerifyFn,
  ) {
    this.io = new SocketIOServer(httpServer, {
      cors: { origin: env.FRONTEND_URL, credentials: true },
    })
    this.setup()
  }

  private setup(): void {
    // Middleware de autenticação JWT
    this.io.use(async (socket, next) => {
      const token = (socket.handshake.auth as Record<string, string>).token
        ?? (socket.handshake.query as Record<string, string>).token
      if (!token) return next(new Error('UNAUTHORIZED'))
      try {
        const payload = this.jwtVerify(token as string)
        socket.data.userId = payload.sub
        next()
      } catch {
        next(new Error('UNAUTHORIZED'))
      }
    })

    this.io.on('connection', async (socket) => {
      const userId = socket.data.userId as string

      // Entrar nas rooms de todas as conversas do usuário
      const convIds = await this.conversationsService.getConversationIds(userId)
      for (const convId of convIds) {
        socket.join(`conv:${convId}`)
      }
      socket.join('presence')

      // Marcar online e notificar
      this.presenceService.userConnected(userId, socket.id)
      this.io.to('presence').emit('presence:update', { userId, online: true, lastSeenAt: null })

      // message:send
      socket.on('message:send', async (data: { conversationId: string; content?: string; attachmentIds?: string[] }) => {
        try {
          const message = await this.messagesService.sendMessage(data.conversationId, userId, {
            content: data.content,
            attachmentIds: data.attachmentIds,
          })
          this.io.to(`conv:${data.conversationId}`).emit('message:new', { message })

          // Push para membros offline
          const members = await this.conversationsService.getConversationMembers(data.conversationId)
          for (const member of members) {
            if (member.userId !== userId && !this.presenceService.isOnline(member.userId)) {
              await this.pushService.notify(member.userId, {
                title: 'Nova mensagem',
                body: message.content ?? '📎 Anexo',
                conversationId: data.conversationId,
              }).catch(() => {})
            }
          }
        } catch (e: any) {
          socket.emit('error', { code: e.code ?? 'INTERNAL_ERROR' })
        }
      })

      // conversation:read
      socket.on('conversation:read', async (data: { conversationId: string }) => {
        await this.conversationsService.markAsRead(data.conversationId, userId).catch(() => {})
      })

      // typing
      socket.on('typing:start', (data: { conversationId: string }) => {
        socket.to(`conv:${data.conversationId}`).emit('typing', { conversationId: data.conversationId, userId, isTyping: true })
      })

      socket.on('typing:stop', (data: { conversationId: string }) => {
        socket.to(`conv:${data.conversationId}`).emit('typing', { conversationId: data.conversationId, userId, isTyping: false })
      })

      // Disconnect
      socket.on('disconnect', async () => {
        const isNowOffline = this.presenceService.userDisconnected(userId, socket.id)
        if (isNowOffline) {
          const lastSeenAt = await this.presenceService.persistLastSeen(userId)
          this.io.to('presence').emit('presence:update', { userId, online: false, lastSeenAt })
        }
      })
    })
  }

  emitMessageDeleted(conversationId: string, messageId: string): void {
    this.io.to(`conv:${conversationId}`).emit('message:deleted', { messageId, conversationId })
  }

  emitMemberAdded(conversationId: string, member: ConversationMember): void {
    this.io.to(`conv:${conversationId}`).emit('member:added', { conversationId, member })
  }

  emitMemberRemoved(conversationId: string, userId: string): void {
    this.io.to(`conv:${conversationId}`).emit('member:removed', { conversationId, userId })
  }

  emitConversationUpdated(conversationId: string, conversation: unknown): void {
    this.io.to(`conv:${conversationId}`).emit('conversation:updated', { conversation })
  }
}
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/modules/chat/chat.gateway.ts
git commit -m "feat: ChatGateway — Socket.io com auth JWT, rooms por conversa e presença"
```

---

### Task 5: Integrar chat em app.ts

**Files:**
- Modify: `src/app.ts`

- [ ] **Adicionar imports do módulo chat no topo de app.ts**

Após o último import existente (acima de `import { fileURLToPath }`), adicionar:

```typescript
import { ConversationsRepository } from './modules/chat/conversations.repository.js'
import { ConversationsService } from './modules/chat/conversations.service.js'
import { MessagesRepository } from './modules/chat/messages.repository.js'
import { MessagesService } from './modules/chat/messages.service.js'
import { DmRequestsRepository } from './modules/chat/dm-requests.repository.js'
import { DmRequestsService } from './modules/chat/dm-requests.service.js'
import { PresenceRepository } from './modules/chat/presence.repository.js'
import { PresenceService } from './modules/chat/presence.service.js'
import { PushRepository } from './modules/chat/push.repository.js'
import { PushService } from './modules/chat/push.service.js'
import { ChatGateway } from './modules/chat/chat.gateway.js'
import { chatRoutes } from './modules/chat/chat.routes.js'
```

- [ ] **Instanciar serviços de chat após `itemsService` em buildApp()**

Localizar a linha `return app` no final de `buildApp()` e adicionar o bloco de chat ANTES do `return app`:

```typescript
  // Chat
  PushService.configure(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_CONTACT)

  const conversationsRepository = new ConversationsRepository(db)
  const conversationsService = new ConversationsService(conversationsRepository, friendsRepository, storageService)

  const messagesRepository = new MessagesRepository(db)
  const messagesService = new MessagesService(messagesRepository, conversationsRepository, storageService)

  const dmRequestsRepository = new DmRequestsRepository(db)
  const dmRequestsService = new DmRequestsService(dmRequestsRepository, conversationsRepository, friendsRepository)

  const presenceRepository = new PresenceRepository(db)
  const presenceService = new PresenceService(presenceRepository)

  const pushRepository = new PushRepository(db)
  const pushService = new PushService(pushRepository)

  const chatGateway = new ChatGateway(
    app.server,
    conversationsService,
    messagesService,
    presenceService,
    pushService,
    (token: string) => app.jwt.verify(token) as { sub: string },
  )

  await app.register(chatRoutes, {
    prefix: '/chat',
    conversationsService,
    messagesService,
    dmRequestsService,
    pushService,
    chatGateway,
  })
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Verificar que todos os testes passam**

```bash
npx vitest run
```

Expected: todos os testes PASS (nenhuma regressão).

- [ ] **Commit**

```bash
git add src/app.ts
git commit -m "feat: integrar módulo de chat em app.ts — Sub-projeto 5 completo"
```

---

### Task 6: Smoke test manual

- [ ] **Subir a stack local**

```bash
cd /home/dev/workspace_ssh/local-env-dev
docker compose up -d
```

- [ ] **Iniciar o servidor**

```bash
cd /home/dev/workspace_ssh/geek-social-api
npm run dev
```

Expected: servidor sobe na porta 3000 sem erros, migration 0004 executada.

- [ ] **Verificar endpoints com curl**

```bash
# Health check
curl -s http://localhost:3000/health || echo "sem health route — ok"

# Deve retornar 401 (authenticate middleware ativo)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/chat/conversations
```

Expected: 401.

- [ ] **Commit final de documentação**

```bash
git tag -a v5.0.0 -m "Sub-projeto 5 — Chat em tempo real (sem E2E encryption)"
```
