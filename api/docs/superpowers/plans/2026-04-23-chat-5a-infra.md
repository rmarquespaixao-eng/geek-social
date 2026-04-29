# Chat — Fase A: Infraestrutura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar toda a base do Sub-projeto 5: dependências, migration SQL, schema Drizzle, env vars e contratos de repositório.

**Architecture:** Migration manual SQL + tabelas Drizzle em schema.ts centralizado. Contratos em `src/shared/contracts/` definem as interfaces que os repositórios implementarão nas fases seguintes.

**Tech Stack:** socket.io, web-push, Drizzle ORM (pg-core), Zod

---

### Task 1: Instalar Dependências

**Files:**
- Modify: `package.json`

- [ ] **Instalar socket.io e web-push**

```bash
cd /home/dev/workspace_ssh/geek-social-api
npm install socket.io web-push
npm install --save-dev @types/web-push
```

Expected: packages adicionados a `package.json`, sem erros.

- [ ] **Verificar instalação**

```bash
node -e "require('socket.io'); console.log('socket.io ok')"
node -e "require('web-push'); console.log('web-push ok')"
```

Expected: ambos imprimem `ok`.

- [ ] **Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: instalar socket.io e web-push para chat em tempo real"
```

---

### Task 2: Migration SQL 0004_chat.sql

**Files:**
- Create: `src/shared/infra/database/migrations/0004_chat.sql`

- [ ] **Criar migration**

Conteúdo completo de `src/shared/infra/database/migrations/0004_chat.sql`:

```sql
CREATE TYPE "public"."conversation_type" AS ENUM('dm', 'group');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."dm_request_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "conversation_type" NOT NULL,
	"name" varchar(100),
	"description" text,
	"cover_url" varchar,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"permissions" jsonb DEFAULT '{"can_send_messages":true,"can_send_files":true}' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE "dm_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"status" "dm_request_status" DEFAULT 'pending' NOT NULL,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "user_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_requests" ADD CONSTRAINT "dm_requests_sender_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_requests" ADD CONSTRAINT "dm_requests_receiver_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_requests" ADD CONSTRAINT "dm_requests_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_members_unique" ON "conversation_members" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_requests_unique" ON "dm_requests" USING btree ("sender_id","receiver_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_at_idx" ON "messages" USING btree ("conversation_id","created_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");
```

- [ ] **Commit**

```bash
git add src/shared/infra/database/migrations/0004_chat.sql
git commit -m "db: migration 0004 — tabelas de chat (conversations, messages, dm_requests)"
```

---

### Task 3: Atualizar schema.ts com tabelas de chat

**Files:**
- Modify: `src/shared/infra/database/schema.ts`

- [ ] **Adicionar enums e tabelas de chat ao final do arquivo**

Acrescentar ao final de `src/shared/infra/database/schema.ts`:

```typescript
export const conversationTypeEnum = pgEnum('conversation_type', ['dm', 'group'])
export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member'])
export const dmRequestStatusEnum = pgEnum('dm_request_status', ['pending', 'accepted', 'rejected'])

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: conversationTypeEnum('type').notNull(),
  name: varchar('name', { length: 100 }),
  description: text('description'),
  coverUrl: varchar('cover_url'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const conversationMembers = pgTable('conversation_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRoleEnum('role').notNull().default('member'),
  permissions: jsonb('permissions').notNull().$type<{ can_send_messages: boolean; can_send_files: boolean }>().default({ can_send_messages: true, can_send_files: true }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('conversation_members_unique').on(table.conversationId, table.userId),
])

export const dmRequests = pgTable('dm_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: uuid('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: dmRequestStatusEnum('status').notNull().default('pending'),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('dm_requests_unique').on(table.senderId, table.receiverId),
])

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('messages_conversation_created_at_idx').on(table.conversationId, table.createdAt),
])

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
])

export const userPresence = pgTable('user_presence', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Verificar TypeScript sem erros**

```bash
cd /home/dev/workspace_ssh/geek-social-api
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/shared/infra/database/schema.ts
git commit -m "db: adicionar tabelas de chat ao schema Drizzle"
```

---

### Task 4: Adicionar VAPID keys ao env.ts

**Files:**
- Modify: `src/config/env.ts`

- [ ] **Adicionar VAPID keys ao schema Zod**

Em `src/config/env.ts`, adicionar dentro do objeto passado para `z.object({...})` após a linha do `KEYCLOAK_CLIENT_SECRET`:

```typescript
  VAPID_PUBLIC_KEY: z.string(),
  VAPID_PRIVATE_KEY: z.string(),
  VAPID_CONTACT: z.string().email(),
```

- [ ] **Gerar VAPID keys para o .env local**

```bash
node -e "const wp = require('web-push'); const keys = wp.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY=' + keys.publicKey); console.log('VAPID_PRIVATE_KEY=' + keys.privateKey)"
```

Copiar as duas linhas geradas para o arquivo `.env` local e adicionar também:
```
VAPID_CONTACT=seu@email.com
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/config/env.ts
git commit -m "config: adicionar VAPID keys para push notifications"
```

---

### Task 5: Contratos de repositório do chat

**Files:**
- Create: `src/shared/contracts/dm-requests.repository.contract.ts`
- Create: `src/shared/contracts/conversations.repository.contract.ts`
- Create: `src/shared/contracts/messages.repository.contract.ts`
- Create: `src/shared/contracts/push.repository.contract.ts`
- Create: `src/shared/contracts/presence.repository.contract.ts`

- [ ] **Criar dm-requests.repository.contract.ts**

```typescript
export type DmRequestStatus = 'pending' | 'accepted' | 'rejected'

export type DmRequest = {
  id: string
  senderId: string
  receiverId: string
  status: DmRequestStatus
  conversationId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface IDmRequestsRepository {
  create(senderId: string, receiverId: string): Promise<DmRequest>
  findById(id: string): Promise<DmRequest | null>
  findExisting(senderId: string, receiverId: string): Promise<DmRequest | null>
  findReceivedPending(receiverId: string): Promise<DmRequest[]>
  updateStatus(id: string, status: 'accepted' | 'rejected', conversationId?: string): Promise<DmRequest>
}
```

- [ ] **Criar conversations.repository.contract.ts**

```typescript
export type ConversationType = 'dm' | 'group'
export type MemberRole = 'owner' | 'admin' | 'member'

export type MemberPermissions = {
  can_send_messages: boolean
  can_send_files: boolean
}

export type Conversation = {
  id: string
  type: ConversationType
  name: string | null
  description: string | null
  coverUrl: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type ConversationMember = {
  id: string
  conversationId: string
  userId: string
  role: MemberRole
  permissions: MemberPermissions
  joinedAt: Date
  lastReadAt: Date | null
}

export type ConversationWithMeta = Conversation & {
  lastMessage: { content: string | null; createdAt: Date } | null
  unreadCount: number
}

export interface IConversationsRepository {
  create(data: { type: ConversationType; name?: string; description?: string; createdBy?: string }): Promise<Conversation>
  findById(id: string): Promise<Conversation | null>
  update(id: string, data: { name?: string; description?: string; coverUrl?: string }): Promise<Conversation>
  delete(id: string): Promise<void>

  addMember(conversationId: string, userId: string, role: MemberRole): Promise<ConversationMember>
  findMember(conversationId: string, userId: string): Promise<ConversationMember | null>
  updateMember(conversationId: string, userId: string, data: { role?: MemberRole; permissions?: MemberPermissions }): Promise<ConversationMember>
  removeMember(conversationId: string, userId: string): Promise<void>
  findMembers(conversationId: string): Promise<ConversationMember[]>
  findMembersByUserId(userId: string): Promise<ConversationMember[]>

  findExistingDm(userAId: string, userBId: string): Promise<Conversation | null>
  findUserConversations(userId: string): Promise<ConversationWithMeta[]>
  updateLastReadAt(conversationId: string, userId: string): Promise<void>
}
```

- [ ] **Criar messages.repository.contract.ts**

```typescript
export type Message = {
  id: string
  conversationId: string
  userId: string
  content: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type MessageAttachment = {
  id: string
  messageId: string | null
  uploadedBy: string
  url: string
  filename: string
  mimeType: string
  sizeBytes: number
  displayOrder: number
}

export type MessageWithAttachments = Message & {
  attachments: MessageAttachment[]
}

export type MessageCursor = { createdAt: string; id: string }

export interface IMessagesRepository {
  createMessage(data: { conversationId: string; userId: string; content?: string }): Promise<Message>
  findMessageById(id: string): Promise<MessageWithAttachments | null>
  softDeleteMessage(id: string): Promise<Message>

  createAttachment(data: {
    uploadedBy: string
    url: string
    filename: string
    mimeType: string
    sizeBytes: number
    displayOrder: number
  }): Promise<MessageAttachment>
  linkAttachments(messageId: string, attachmentIds: string[]): Promise<void>
  findAttachmentsByUploader(uploadedBy: string, ids: string[]): Promise<MessageAttachment[]>

  findMessagesByConversation(params: {
    conversationId: string
    cursor?: MessageCursor
    limit: number
  }): Promise<MessageWithAttachments[]>
}
```

- [ ] **Criar push.repository.contract.ts**

```typescript
export type PushSubscription = {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: Date
}

export interface IPushRepository {
  create(userId: string, data: { endpoint: string; p256dh: string; auth: string }): Promise<PushSubscription>
  findByUserId(userId: string): Promise<PushSubscription[]>
  delete(id: string): Promise<void>
}
```

- [ ] **Criar presence.repository.contract.ts**

```typescript
export type UserPresence = {
  userId: string
  lastSeenAt: Date
  updatedAt: Date
}

export interface IPresenceRepository {
  upsertLastSeen(userId: string, lastSeenAt: Date): Promise<void>
  findByUserId(userId: string): Promise<UserPresence | null>
}
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/shared/contracts/dm-requests.repository.contract.ts \
        src/shared/contracts/conversations.repository.contract.ts \
        src/shared/contracts/messages.repository.contract.ts \
        src/shared/contracts/push.repository.contract.ts \
        src/shared/contracts/presence.repository.contract.ts
git commit -m "contracts: interfaces de repositório para o módulo de chat"
```
