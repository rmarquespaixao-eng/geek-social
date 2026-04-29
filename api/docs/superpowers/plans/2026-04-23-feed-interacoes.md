# Feed e Interações — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar Feed + Interações — posts manuais, item_share opt-in, reações geek, comentários planos e feed com cursor-based pagination.

**Architecture:** Pull model com índices compostos. `FeedRepository` faz query direta com cursor `(createdAt, id)`. Módulo `src/modules/posts/` contém posts, comentários, reações e feed. `ItemsService` ganha dependência opcional em `IPostsService`.

**Tech Stack:** Fastify 5, Drizzle ORM (pg-core), PostgreSQL 17, Vitest, Sharp, AWS S3

---

## File Map

**Criar:**
```
src/shared/infra/database/migrations/0003_feed_posts.sql
src/shared/contracts/posts.repository.contract.ts
src/shared/contracts/posts.service.contract.ts
src/shared/contracts/comments.repository.contract.ts
src/shared/contracts/reactions.repository.contract.ts
src/shared/contracts/feed.repository.contract.ts
src/modules/posts/posts.schema.ts
src/modules/posts/posts.service.ts
src/modules/posts/posts.repository.ts
src/modules/posts/posts.controller.ts
src/modules/posts/posts.routes.ts
src/modules/posts/comments.service.ts
src/modules/posts/comments.repository.ts
src/modules/posts/comments.controller.ts
src/modules/posts/comments.routes.ts
src/modules/posts/reactions.service.ts
src/modules/posts/reactions.repository.ts
src/modules/posts/reactions.controller.ts
src/modules/posts/reactions.routes.ts
src/modules/posts/feed.service.ts
src/modules/posts/feed.repository.ts
src/modules/posts/feed.controller.ts
src/modules/posts/feed.routes.ts
tests/modules/posts/posts.service.test.ts
tests/modules/posts/comments.service.test.ts
tests/modules/posts/reactions.service.test.ts
tests/modules/posts/feed.service.test.ts
```

**Modificar:**
```
src/shared/infra/database/schema.ts              — 4 novas tabelas + 3 enums
src/shared/contracts/friends.repository.contract.ts — +findAllBlockRelationUserIds
src/modules/friends/friends.repository.ts        — implementar findAllBlockRelationUserIds
src/modules/items/items.schema.ts                — +shareToFeed
src/modules/items/items.service.ts               — +IPostsService opcional
src/app.ts                                       — DI + rotas
tests/modules/friends/friends.service.test.ts    — +findAllBlockRelationUserIds no mock
tests/modules/items/items.service.test.ts        — +findAllBlockRelationUserIds + shareToFeed
tests/modules/collections/collections.service.test.ts — +findAllBlockRelationUserIds no mock
tests/modules/users/users.service.test.ts        — +findAllBlockRelationUserIds no mock
```

---

## Task 1: DB Schema + Migration

**Files:**
- Modify: `src/shared/infra/database/schema.ts`
- Create: `src/shared/infra/database/migrations/0003_feed_posts.sql`

- [ ] **Step 1: Adicionar `index` aos imports e os 3 novos enums em `schema.ts`**

Adicione `index` ao import existente:
```typescript
import {
  pgTable, pgEnum, uuid, varchar, text,
  boolean, timestamp, integer, smallint, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core'
```

Adicione após `friendshipStatusEnum`:
```typescript
export const postTypeEnum = pgEnum('post_type', ['manual', 'item_share'])
export const postVisibilityEnum = pgEnum('post_visibility', ['public', 'friends_only', 'private'])
export const reactionTypeEnum = pgEnum('reaction_type', ['power_up', 'epic', 'critical', 'loot', 'gg'])
```

- [ ] **Step 2: Adicionar as 4 novas tabelas ao final de `schema.ts`**

```typescript
export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: postTypeEnum('type').notNull(),
  content: text('content'),
  visibility: postVisibilityEnum('visibility').notNull(),
  itemId: uuid('item_id').references(() => items.id, { onDelete: 'cascade' }),
  collectionId: uuid('collection_id').references(() => collections.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userCreatedAtIdx: index('posts_user_created_at_idx').on(table.userId, table.createdAt),
  visibilityCreatedAtIdx: index('posts_visibility_created_at_idx').on(table.visibility, table.createdAt),
  itemIdx: index('posts_item_id_idx').on(table.itemId),
}))

export const postMedia = pgTable('post_media', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  displayOrder: integer('display_order').notNull(),
})

export const postReactions = pgTable('post_reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: reactionTypeEnum('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueUserPost: uniqueIndex('post_reactions_post_user_unique').on(table.postId, table.userId),
}))

export const postComments = pgTable('post_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  postCreatedAtIdx: index('post_comments_post_created_at_idx').on(table.postId, table.createdAt),
}))
```

- [ ] **Step 3: Criar o arquivo de migration**

Criar `src/shared/infra/database/migrations/0003_feed_posts.sql`:
```sql
CREATE TYPE "public"."post_type" AS ENUM('manual', 'item_share');--> statement-breakpoint
CREATE TYPE "public"."post_visibility" AS ENUM('public', 'friends_only', 'private');--> statement-breakpoint
CREATE TYPE "public"."reaction_type" AS ENUM('power_up', 'epic', 'critical', 'loot', 'gg');--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "post_type" NOT NULL,
	"content" text,
	"visibility" "post_visibility" NOT NULL,
	"item_id" uuid,
	"collection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"url" text NOT NULL,
	"display_order" integer NOT NULL
);--> statement-breakpoint
CREATE TABLE "post_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "reaction_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_reactions_post_user_unique" ON "post_reactions" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "posts_user_created_at_idx" ON "posts" USING btree ("user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "posts_visibility_created_at_idx" ON "posts" USING btree ("visibility","created_at" DESC);--> statement-breakpoint
CREATE INDEX "posts_item_id_idx" ON "posts" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "post_comments_post_created_at_idx" ON "post_comments" USING btree ("post_id","created_at");
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/shared/infra/database/schema.ts src/shared/infra/database/migrations/0003_feed_posts.sql
git commit -m "feat: schema e migration das tabelas de posts, mídia, reações e comentários"
```

---

## Task 2: Contratos (Interfaces)

**Files:**
- Create: `src/shared/contracts/posts.repository.contract.ts`
- Create: `src/shared/contracts/posts.service.contract.ts`
- Create: `src/shared/contracts/comments.repository.contract.ts`
- Create: `src/shared/contracts/reactions.repository.contract.ts`
- Create: `src/shared/contracts/feed.repository.contract.ts`
- Modify: `src/shared/contracts/friends.repository.contract.ts`

- [ ] **Step 1: Criar `posts.repository.contract.ts`**

```typescript
export type PostType = 'manual' | 'item_share'
export type PostVisibility = 'public' | 'friends_only' | 'private'

export type PostMedia = {
  id: string
  postId: string
  url: string
  displayOrder: number
}

export type Post = {
  id: string
  userId: string
  type: PostType
  content: string | null
  visibility: PostVisibility
  itemId: string | null
  collectionId: string | null
  media: PostMedia[]
  createdAt: Date
  updatedAt: Date
}

export type CreatePostData = {
  userId: string
  type: PostType
  content?: string | null
  visibility: PostVisibility
  itemId?: string | null
  collectionId?: string | null
}

export type UpdatePostData = {
  content?: string | null
  visibility?: PostVisibility
}

export interface IPostsRepository {
  create(data: CreatePostData): Promise<Post>
  findById(id: string): Promise<Post | null>
  update(id: string, data: UpdatePostData): Promise<Post>
  delete(id: string): Promise<void>
  addMedia(postId: string, url: string, displayOrder: number): Promise<PostMedia>
  removeMedia(mediaId: string): Promise<void>
  findMediaById(mediaId: string): Promise<PostMedia | null>
  countMedia(postId: string): Promise<number>
}
```

- [ ] **Step 2: Criar `posts.service.contract.ts`**

```typescript
export type ItemShareParams = {
  userId: string
  itemId: string
  collectionId: string
  collectionVisibility: string
}

export interface IPostsService {
  createItemShare(params: ItemShareParams): Promise<void>
}
```

- [ ] **Step 3: Criar `comments.repository.contract.ts`**

```typescript
export type Comment = {
  id: string
  postId: string
  userId: string
  content: string
  createdAt: Date
  updatedAt: Date
}

export type CommentCursor = {
  createdAt: Date
  id: string
}

export interface ICommentsRepository {
  create(postId: string, userId: string, content: string): Promise<Comment>
  findById(id: string): Promise<Comment | null>
  update(id: string, content: string): Promise<Comment>
  delete(id: string): Promise<void>
  findByPostId(postId: string, cursor?: CommentCursor, limit?: number): Promise<{ comments: Comment[]; nextCursor: CommentCursor | null }>
}
```

- [ ] **Step 4: Criar `reactions.repository.contract.ts`**

```typescript
export type ReactionType = 'power_up' | 'epic' | 'critical' | 'loot' | 'gg'

export type Reaction = {
  id: string
  postId: string
  userId: string
  type: ReactionType
  createdAt: Date
}

export type ReactionCounts = Record<ReactionType, number>

export interface IReactionsRepository {
  upsert(postId: string, userId: string, type: ReactionType): Promise<Reaction>
  delete(postId: string, userId: string): Promise<void>
  findByPostAndUser(postId: string, userId: string): Promise<Reaction | null>
  countsByPostId(postId: string): Promise<ReactionCounts>
}
```

- [ ] **Step 5: Criar `feed.repository.contract.ts`**

```typescript
import type { Post } from './posts.repository.contract.js'

export type FeedCursor = {
  createdAt: Date
  id: string
}

export type GetFeedParams = {
  viewerId: string
  friendIds: string[]
  blockedIds: string[]
  cursor?: FeedCursor
  limit: number
}

export type GetProfilePostsParams = {
  ownerId: string
  viewerIsFriend: boolean
  cursor?: FeedCursor
  limit: number
}

export interface IFeedRepository {
  getFeed(params: GetFeedParams): Promise<{ posts: Post[]; nextCursor: FeedCursor | null }>
  getProfilePosts(params: GetProfilePostsParams): Promise<{ posts: Post[]; nextCursor: FeedCursor | null }>
}
```

- [ ] **Step 6: Adicionar `findAllBlockRelationUserIds` à `IFriendsRepository`**

Em `src/shared/contracts/friends.repository.contract.ts`, adicione ao final da interface:
```typescript
  findAllBlockRelationUserIds(userId: string): Promise<string[]>
```

- [ ] **Step 7: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```
Esperado: erro apontando que `FriendsRepository` não implementa `findAllBlockRelationUserIds`. Isso é esperado — será corrigido na Task 9.

- [ ] **Step 8: Commit**

```bash
git add src/shared/contracts/
git commit -m "feat: contratos de posts, comentários, reações, feed e IPostsService"
```

---

## Task 3: Zod Schemas

**Files:**
- Create: `src/modules/posts/posts.schema.ts`
- Modify: `src/modules/items/items.schema.ts`

- [ ] **Step 1: Criar `posts.schema.ts`**

```typescript
import { z } from 'zod'

export const createPostSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  visibility: z.enum(['public', 'friends_only', 'private']),
})

export const updatePostSchema = z.object({
  content: z.string().min(1).max(5000).nullable().optional(),
  visibility: z.enum(['public', 'friends_only', 'private']).optional(),
})

export const addCommentSchema = z.object({
  content: z.string().min(1).max(2000),
})

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
})

export const addReactionSchema = z.object({
  type: z.enum(['power_up', 'epic', 'critical', 'loot', 'gg']),
})

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type CreatePostInput = z.infer<typeof createPostSchema>
export type UpdatePostInput = z.infer<typeof updatePostSchema>
export type AddCommentInput = z.infer<typeof addCommentSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>
export type AddReactionInput = z.infer<typeof addReactionSchema>
export type FeedQueryInput = z.infer<typeof feedQuerySchema>
```

- [ ] **Step 2: Atualizar `items.schema.ts`**

Adicionar `shareToFeed` aos dois schemas:
```typescript
import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  fields: z.record(z.string(), z.unknown()).default({}),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
  shareToFeed: z.boolean().default(false),
})

export const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
})

export type CreateItemInput = z.infer<typeof createItemSchema>
export type UpdateItemInput = z.infer<typeof updateItemSchema>
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```
Esperado: erros de `FriendsRepository` (pendente Task 9) e nada mais.

- [ ] **Step 4: Commit**

```bash
git add src/modules/posts/posts.schema.ts src/modules/items/items.schema.ts
git commit -m "feat: schemas Zod para posts, comentários, reações, feed e shareToFeed"
```

---

## Task 4: PostsService (TDD)

**Files:**
- Create: `tests/modules/posts/posts.service.test.ts`
- Create: `src/modules/posts/posts.service.ts`

- [ ] **Step 1: Escrever `posts.service.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PostsService } from '../../../src/modules/posts/posts.service.js'
import type { IPostsRepository, Post, PostMedia } from '../../../src/shared/contracts/posts.repository.contract.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'

function createMockPostsRepository(): IPostsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMedia: vi.fn(),
    removeMedia: vi.fn(),
    findMediaById: vi.fn(),
    countMedia: vi.fn(),
  }
}

function createMockStorageService(): IStorageService {
  return {
    upload: vi.fn(),
    delete: vi.fn(),
    getUrl: vi.fn(),
  }
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    userId: 'user-1',
    type: 'manual',
    content: 'Olá geeks!',
    visibility: 'public',
    itemId: null,
    collectionId: null,
    media: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('PostsService', () => {
  let repo: IPostsRepository
  let storage: IStorageService
  let service: PostsService

  beforeEach(() => {
    repo = createMockPostsRepository()
    storage = createMockStorageService()
    service = new PostsService(repo, storage)
    vi.clearAllMocks()
  })

  describe('createPost', () => {
    it('deve criar post manual com visibilidade public', async () => {
      vi.mocked(repo.create).mockResolvedValue(makePost())

      const result = await service.createPost('user-1', { content: 'Olá geeks!', visibility: 'public' })

      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'manual',
        content: 'Olá geeks!',
        visibility: 'public',
        itemId: null,
        collectionId: null,
      })
      expect(result.type).toBe('manual')
    })

    it('deve criar post com visibilidade friends_only', async () => {
      vi.mocked(repo.create).mockResolvedValue(makePost({ visibility: 'friends_only' }))

      await service.createPost('user-1', { visibility: 'friends_only' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'friends_only' }))
    })
  })

  describe('createItemShare', () => {
    it('deve criar post item_share com visibilidade da coleção', async () => {
      vi.mocked(repo.create).mockResolvedValue(makePost({ type: 'item_share', visibility: 'public' }))

      await service.createItemShare({
        userId: 'user-1',
        itemId: 'item-1',
        collectionId: 'col-1',
        collectionVisibility: 'public',
      })

      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'item_share',
        content: null,
        visibility: 'public',
        itemId: 'item-1',
        collectionId: 'col-1',
      })
    })

    it('deve criar item_share com friends_only quando coleção é friends_only', async () => {
      vi.mocked(repo.create).mockResolvedValue(makePost({ type: 'item_share', visibility: 'friends_only' }))

      await service.createItemShare({
        userId: 'user-1',
        itemId: 'item-1',
        collectionId: 'col-1',
        collectionVisibility: 'friends_only',
      })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'friends_only' }))
    })

    it('não deve criar post quando coleção é private', async () => {
      await service.createItemShare({
        userId: 'user-1',
        itemId: 'item-1',
        collectionId: 'col-1',
        collectionVisibility: 'private',
      })

      expect(repo.create).not.toHaveBeenCalled()
    })
  })

  describe('getPost', () => {
    it('deve retornar post existente para o próprio autor (private)', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ visibility: 'private', userId: 'user-1' }))

      const result = await service.getPost('post-1', 'user-1')

      expect(result.id).toBe('post-1')
    })

    it('deve lançar NOT_FOUND para post private de outro usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ visibility: 'private', userId: 'user-1' }))

      await expect(service.getPost('post-1', 'user-2')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND para post inexistente', async () => {
      vi.mocked(repo.findById).mockResolvedValue(null)

      await expect(service.getPost('nao-existe', 'user-1')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('updatePost', () => {
    it('deve editar conteúdo do post manual', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1', type: 'manual' }))
      vi.mocked(repo.update).mockResolvedValue(makePost({ content: 'novo conteúdo' }))

      const result = await service.updatePost('user-1', 'post-1', { content: 'novo conteúdo' })

      expect(repo.update).toHaveBeenCalledWith('post-1', { content: 'novo conteúdo' })
      expect(result.content).toBe('novo conteúdo')
    })

    it('deve lançar NOT_FOUND para post de outro usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))

      await expect(service.updatePost('user-2', 'post-1', {})).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar CANNOT_EDIT_ITEM_SHARE para posts automáticos', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1', type: 'item_share' }))

      await expect(service.updatePost('user-1', 'post-1', {})).rejects.toThrow('CANNOT_EDIT_ITEM_SHARE')
    })
  })

  describe('deletePost', () => {
    it('deve deletar post do próprio autor', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))
      vi.mocked(repo.delete).mockResolvedValue()

      await service.deletePost('user-1', 'post-1')

      expect(repo.delete).toHaveBeenCalledWith('post-1')
    })

    it('deve lançar NOT_FOUND para post de outro usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))

      await expect(service.deletePost('user-2', 'post-1')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('addMedia', () => {
    it('deve fazer upload e adicionar mídia ao post', async () => {
      vi.mocked(repo.findById)
        .mockResolvedValueOnce(makePost({ userId: 'user-1' }))
        .mockResolvedValueOnce(makePost({ userId: 'user-1', media: [{ id: 'm-1', postId: 'post-1', url: 'https://s3/img.webp', displayOrder: 0 }] }))
      vi.mocked(repo.countMedia).mockResolvedValue(0)
      vi.mocked(storage.upload).mockResolvedValue('https://s3/img.webp')
      vi.mocked(repo.addMedia).mockResolvedValue({ id: 'm-1', postId: 'post-1', url: 'https://s3/img.webp', displayOrder: 0 })

      const buf = Buffer.from('fake-image')
      const result = await service.addMedia('user-1', 'post-1', [buf])

      expect(storage.upload).toHaveBeenCalledTimes(1)
      expect(repo.addMedia).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
    })

    it('deve lançar MEDIA_LIMIT_EXCEEDED ao tentar adicionar a 5ª imagem', async () => {
      vi.mocked(repo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))
      vi.mocked(repo.countMedia).mockResolvedValue(4)

      await expect(
        service.addMedia('user-1', 'post-1', [Buffer.from('img')])
      ).rejects.toThrow('MEDIA_LIMIT_EXCEEDED')

      expect(storage.upload).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar falha**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/posts/posts.service.test.ts 2>&1 | tail -15
```
Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Criar `posts.service.ts`**

```typescript
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import type { IPostsRepository, Post, PostMedia } from '../../shared/contracts/posts.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { IPostsService, ItemShareParams } from '../../shared/contracts/posts.service.contract.js'
import type { CreatePostInput, UpdatePostInput } from './posts.schema.js'

export class PostsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'PostsError'
  }
}

export class PostsService implements IPostsService {
  constructor(
    private readonly repo: IPostsRepository,
    private readonly storageService?: IStorageService,
  ) {}

  async createPost(userId: string, input: CreatePostInput): Promise<Post> {
    return this.repo.create({
      userId,
      type: 'manual',
      content: input.content ?? null,
      visibility: input.visibility,
      itemId: null,
      collectionId: null,
    })
  }

  async createItemShare(params: ItemShareParams): Promise<void> {
    if (params.collectionVisibility === 'private') return
    const visibility = params.collectionVisibility === 'friends_only' ? 'friends_only' as const : 'public' as const
    await this.repo.create({
      userId: params.userId,
      type: 'item_share',
      content: null,
      visibility,
      itemId: params.itemId,
      collectionId: params.collectionId,
    })
  }

  async getPost(id: string, viewerId: string): Promise<Post> {
    const post = await this.repo.findById(id)
    if (!post) throw new PostsError('NOT_FOUND')
    if (post.visibility === 'private' && post.userId !== viewerId) throw new PostsError('NOT_FOUND')
    return post
  }

  async updatePost(userId: string, postId: string, input: UpdatePostInput): Promise<Post> {
    const post = await this.repo.findById(postId)
    if (!post || post.userId !== userId) throw new PostsError('NOT_FOUND')
    if (post.type === 'item_share') throw new PostsError('CANNOT_EDIT_ITEM_SHARE')
    return this.repo.update(postId, input)
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    const post = await this.repo.findById(postId)
    if (!post || post.userId !== userId) throw new PostsError('NOT_FOUND')
    await this.repo.delete(postId)
  }

  async addMedia(userId: string, postId: string, buffers: Buffer[]): Promise<PostMedia[]> {
    if (!this.storageService) throw new PostsError('STORAGE_NOT_CONFIGURED')
    const post = await this.repo.findById(postId)
    if (!post || post.userId !== userId) throw new PostsError('NOT_FOUND')
    const currentCount = await this.repo.countMedia(postId)
    if (currentCount + buffers.length > 4) throw new PostsError('MEDIA_LIMIT_EXCEEDED')
    for (let i = 0; i < buffers.length; i++) {
      const webp = await sharp(buffers[i])
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      const key = `posts/${postId}/media/${randomUUID()}.webp`
      const url = await this.storageService.upload(key, webp, 'image/webp')
      await this.repo.addMedia(postId, url, currentCount + i)
    }
    return (await this.repo.findById(postId))!.media
  }

  async removeMedia(userId: string, postId: string, mediaId: string): Promise<void> {
    const post = await this.repo.findById(postId)
    if (!post || post.userId !== userId) throw new PostsError('NOT_FOUND')
    const media = await this.repo.findMediaById(mediaId)
    if (!media || media.postId !== postId) throw new PostsError('NOT_FOUND')
    await this.repo.removeMedia(mediaId)
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar aprovação**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/posts/posts.service.test.ts 2>&1 | tail -10
```
Esperado: todos passando.

- [ ] **Step 5: Commit**

```bash
git add tests/modules/posts/posts.service.test.ts src/modules/posts/posts.service.ts
git commit -m "feat: PostsService com TDD — create, item_share, get, update, delete, media"
```

---

## Task 5: CommentsService (TDD)

**Files:**
- Create: `tests/modules/posts/comments.service.test.ts`
- Create: `src/modules/posts/comments.service.ts`

- [ ] **Step 1: Escrever `comments.service.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommentsService } from '../../../src/modules/posts/comments.service.js'
import type { ICommentsRepository, Comment } from '../../../src/shared/contracts/comments.repository.contract.js'
import type { IPostsRepository, Post } from '../../../src/shared/contracts/posts.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockCommentsRepo(): ICommentsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByPostId: vi.fn(),
  }
}

function createMockPostsRepo(): IPostsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMedia: vi.fn(),
    removeMedia: vi.fn(),
    findMediaById: vi.fn(),
    countMedia: vi.fn(),
  }
}

function createMockFriendsRepo(): IFriendsRepository {
  return {
    createRequest: vi.fn(),
    findRequestById: vi.fn(),
    findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(),
    findSentRequests: vi.fn(),
    updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(),
    areFriends: vi.fn(),
    removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(),
    deleteBlock: vi.fn(),
    isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(),
    findBlocksByBlocker: vi.fn(),
    findAllBlockRelationUserIds: vi.fn(),
  }
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1', userId: 'author-1', type: 'manual', content: 'texto',
    visibility: 'public', itemId: null, collectionId: null, media: [],
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-1', postId: 'post-1', userId: 'commenter-1',
    content: 'ótimo post!', createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

describe('CommentsService', () => {
  let commentsRepo: ICommentsRepository
  let postsRepo: IPostsRepository
  let friendsRepo: IFriendsRepository
  let service: CommentsService

  beforeEach(() => {
    commentsRepo = createMockCommentsRepo()
    postsRepo = createMockPostsRepo()
    friendsRepo = createMockFriendsRepo()
    service = new CommentsService(commentsRepo, postsRepo, friendsRepo)
    vi.clearAllMocks()
  })

  describe('addComment', () => {
    it('deve adicionar comentário em post público', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost())
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(commentsRepo.create).mockResolvedValue(makeComment())

      const result = await service.addComment('commenter-1', 'post-1', 'ótimo post!')

      expect(commentsRepo.create).toHaveBeenCalledWith('post-1', 'commenter-1', 'ótimo post!')
      expect(result.content).toBe('ótimo post!')
    })

    it('deve lançar NOT_FOUND para post private de outro usuário', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ visibility: 'private', userId: 'author-1' }))

      await expect(service.addComment('commenter-1', 'post-1', 'oi')).rejects.toThrow('NOT_FOUND')
      expect(commentsRepo.create).not.toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND para post de usuário bloqueado', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.addComment('commenter-1', 'post-1', 'oi')).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND para post inexistente', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(null)

      await expect(service.addComment('commenter-1', 'nao-existe', 'oi')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('updateComment', () => {
    it('deve editar comentário do próprio autor', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))
      vi.mocked(commentsRepo.update).mockResolvedValue(makeComment({ content: 'editado' }))

      const result = await service.updateComment('commenter-1', 'post-1', 'comment-1', 'editado')

      expect(commentsRepo.update).toHaveBeenCalledWith('comment-1', 'editado')
      expect(result.content).toBe('editado')
    })

    it('deve lançar FORBIDDEN para comentário de outro usuário', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))

      await expect(service.updateComment('outro-user', 'post-1', 'comment-1', 'editado')).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('deleteComment', () => {
    it('deve deletar comentário pelo próprio autor', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(commentsRepo.delete).mockResolvedValue()

      await service.deleteComment('commenter-1', 'post-1', 'comment-1')

      expect(commentsRepo.delete).toHaveBeenCalledWith('comment-1')
    })

    it('deve deletar comentário pelo autor do post', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(commentsRepo.delete).mockResolvedValue()

      await service.deleteComment('author-1', 'post-1', 'comment-1')

      expect(commentsRepo.delete).toHaveBeenCalledWith('comment-1')
    })

    it('deve lançar FORBIDDEN para terceiro', async () => {
      vi.mocked(commentsRepo.findById).mockResolvedValue(makeComment({ userId: 'commenter-1' }))
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))

      await expect(service.deleteComment('terceiro', 'post-1', 'comment-1')).rejects.toThrow('FORBIDDEN')
    })
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar falha**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/posts/comments.service.test.ts 2>&1 | tail -10
```
Esperado: FAIL.

- [ ] **Step 3: Criar `comments.service.ts`**

```typescript
import type { ICommentsRepository, Comment, CommentCursor } from '../../shared/contracts/comments.repository.contract.js'
import type { IPostsRepository } from '../../shared/contracts/posts.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'

export class CommentsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'CommentsError'
  }
}

export class CommentsService {
  constructor(
    private readonly commentsRepo: ICommentsRepository,
    private readonly postsRepo: IPostsRepository,
    private readonly friendsRepo: IFriendsRepository,
  ) {}

  private async assertCanInteract(viewerId: string, postId: string): Promise<void> {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new CommentsError('NOT_FOUND')
    if (post.visibility === 'private' && post.userId !== viewerId) throw new CommentsError('NOT_FOUND')
    const blocked = await this.friendsRepo.isBlockedEitherDirection(viewerId, post.userId)
    if (blocked) throw new CommentsError('NOT_FOUND')
  }

  async addComment(userId: string, postId: string, content: string): Promise<Comment> {
    await this.assertCanInteract(userId, postId)
    return this.commentsRepo.create(postId, userId, content)
  }

  async listComments(userId: string | null, postId: string, cursorToken?: string, limit = 20) {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new CommentsError('NOT_FOUND')
    if (post.visibility === 'private' && post.userId !== userId) throw new CommentsError('NOT_FOUND')
    const cursor = cursorToken ? decodeCursor(cursorToken) : undefined
    const result = await this.commentsRepo.findByPostId(postId, cursor, limit)
    return {
      comments: result.comments,
      nextCursor: result.nextCursor ? encodeCursor(result.nextCursor) : null,
    }
  }

  async updateComment(userId: string, postId: string, commentId: string, content: string): Promise<Comment> {
    const comment = await this.commentsRepo.findById(commentId)
    if (!comment || comment.postId !== postId) throw new CommentsError('NOT_FOUND')
    if (comment.userId !== userId) throw new CommentsError('FORBIDDEN')
    return this.commentsRepo.update(commentId, content)
  }

  async deleteComment(userId: string, postId: string, commentId: string): Promise<void> {
    const comment = await this.commentsRepo.findById(commentId)
    if (!comment || comment.postId !== postId) throw new CommentsError('NOT_FOUND')
    const post = await this.postsRepo.findById(postId)
    const isCommentAuthor = comment.userId === userId
    const isPostAuthor = post?.userId === userId
    if (!isCommentAuthor && !isPostAuthor) throw new CommentsError('FORBIDDEN')
    await this.commentsRepo.delete(commentId)
  }
}

function encodeCursor(cursor: CommentCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString('base64')
}

function decodeCursor(token: string): CommentCursor {
  const { createdAt, id } = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
  return { createdAt: new Date(createdAt), id }
}
```

- [ ] **Step 4: Rodar os testes e confirmar aprovação**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/posts/comments.service.test.ts 2>&1 | tail -10
```
Esperado: todos passando.

- [ ] **Step 5: Commit**

```bash
git add tests/modules/posts/comments.service.test.ts src/modules/posts/comments.service.ts
git commit -m "feat: CommentsService com TDD — add, list, update, delete com controle de bloqueio"
```

---

## Task 6: ReactionsService (TDD)

**Files:**
- Create: `tests/modules/posts/reactions.service.test.ts`
- Create: `src/modules/posts/reactions.service.ts`

- [ ] **Step 1: Escrever `reactions.service.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactionsService } from '../../../src/modules/posts/reactions.service.js'
import type { IReactionsRepository, Reaction, ReactionCounts } from '../../../src/shared/contracts/reactions.repository.contract.js'
import type { IPostsRepository, Post } from '../../../src/shared/contracts/posts.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'

function createMockReactionsRepo(): IReactionsRepository {
  return {
    upsert: vi.fn(),
    delete: vi.fn(),
    findByPostAndUser: vi.fn(),
    countsByPostId: vi.fn(),
  }
}

function createMockPostsRepo(): IPostsRepository {
  return {
    create: vi.fn(), findById: vi.fn(), update: vi.fn(), delete: vi.fn(),
    addMedia: vi.fn(), removeMedia: vi.fn(), findMediaById: vi.fn(), countMedia: vi.fn(),
  }
}

function createMockFriendsRepo(): IFriendsRepository {
  return {
    createRequest: vi.fn(), findRequestById: vi.fn(), findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(), findSentRequests: vi.fn(), updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(), areFriends: vi.fn(), removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(), deleteBlock: vi.fn(), isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(), findBlocksByBlocker: vi.fn(),
    findAllBlockRelationUserIds: vi.fn(),
  }
}

const emptyCounts: ReactionCounts = { power_up: 0, epic: 0, critical: 0, loot: 0, gg: 0 }

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1', userId: 'author-1', type: 'manual', content: 'texto',
    visibility: 'public', itemId: null, collectionId: null, media: [],
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  }
}

function makeReaction(overrides: Partial<Reaction> = {}): Reaction {
  return { id: 'r-1', postId: 'post-1', userId: 'user-2', type: 'epic', createdAt: new Date(), ...overrides }
}

describe('ReactionsService', () => {
  let reactionsRepo: IReactionsRepository
  let postsRepo: IPostsRepository
  let friendsRepo: IFriendsRepository
  let service: ReactionsService

  beforeEach(() => {
    reactionsRepo = createMockReactionsRepo()
    postsRepo = createMockPostsRepo()
    friendsRepo = createMockFriendsRepo()
    service = new ReactionsService(reactionsRepo, postsRepo, friendsRepo)
    vi.clearAllMocks()
  })

  describe('react', () => {
    it('deve adicionar reação em post de terceiro', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(reactionsRepo.upsert).mockResolvedValue(makeReaction({ type: 'epic' }))
      vi.mocked(reactionsRepo.countsByPostId).mockResolvedValue({ ...emptyCounts, epic: 1 })

      const result = await service.react('user-2', 'post-1', 'epic')

      expect(reactionsRepo.upsert).toHaveBeenCalledWith('post-1', 'user-2', 'epic')
      expect(result.epic).toBe(1)
    })

    it('deve trocar reação (upsert)', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(false)
      vi.mocked(reactionsRepo.upsert).mockResolvedValue(makeReaction({ type: 'gg' }))
      vi.mocked(reactionsRepo.countsByPostId).mockResolvedValue({ ...emptyCounts, gg: 1 })

      const result = await service.react('user-2', 'post-1', 'gg')

      expect(reactionsRepo.upsert).toHaveBeenCalledWith('post-1', 'user-2', 'gg')
      expect(result.gg).toBe(1)
    })

    it('deve lançar SELF_REACTION ao reagir no próprio post', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'user-1' }))

      await expect(service.react('user-1', 'post-1', 'epic')).rejects.toThrow('SELF_REACTION')
      expect(reactionsRepo.upsert).not.toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND para post de usuário bloqueado', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost({ userId: 'author-1' }))
      vi.mocked(friendsRepo.isBlockedEitherDirection).mockResolvedValue(true)

      await expect(service.react('user-2', 'post-1', 'epic')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('removeReaction', () => {
    it('deve remover reação existente', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost())
      vi.mocked(reactionsRepo.delete).mockResolvedValue()

      await service.removeReaction('user-2', 'post-1')

      expect(reactionsRepo.delete).toHaveBeenCalledWith('post-1', 'user-2')
    })
  })

  describe('getReactions', () => {
    it('deve retornar contagens e reação do viewer', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost())
      vi.mocked(reactionsRepo.countsByPostId).mockResolvedValue({ ...emptyCounts, power_up: 3 })
      vi.mocked(reactionsRepo.findByPostAndUser).mockResolvedValue(makeReaction({ type: 'power_up' }))

      const result = await service.getReactions('post-1', 'user-2')

      expect(result.counts.power_up).toBe(3)
      expect(result.myReaction).toBe('power_up')
    })

    it('deve retornar myReaction null para viewer não autenticado', async () => {
      vi.mocked(postsRepo.findById).mockResolvedValue(makePost())
      vi.mocked(reactionsRepo.countsByPostId).mockResolvedValue({ ...emptyCounts })

      const result = await service.getReactions('post-1', null)

      expect(result.myReaction).toBeNull()
      expect(reactionsRepo.findByPostAndUser).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/posts/reactions.service.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Criar `reactions.service.ts`**

```typescript
import type { IReactionsRepository, ReactionType, ReactionCounts, Reaction } from '../../shared/contracts/reactions.repository.contract.js'
import type { IPostsRepository } from '../../shared/contracts/posts.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'

export class ReactionsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ReactionsError'
  }
}

export class ReactionsService {
  constructor(
    private readonly reactionsRepo: IReactionsRepository,
    private readonly postsRepo: IPostsRepository,
    private readonly friendsRepo: IFriendsRepository,
  ) {}

  async react(userId: string, postId: string, type: ReactionType): Promise<ReactionCounts> {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new ReactionsError('NOT_FOUND')
    if (post.userId === userId) throw new ReactionsError('SELF_REACTION')
    const blocked = await this.friendsRepo.isBlockedEitherDirection(userId, post.userId)
    if (blocked) throw new ReactionsError('NOT_FOUND')
    await this.reactionsRepo.upsert(postId, userId, type)
    return this.reactionsRepo.countsByPostId(postId)
  }

  async removeReaction(userId: string, postId: string): Promise<void> {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new ReactionsError('NOT_FOUND')
    await this.reactionsRepo.delete(postId, userId)
  }

  async getReactions(postId: string, viewerId: string | null): Promise<{ counts: ReactionCounts; myReaction: ReactionType | null }> {
    const post = await this.postsRepo.findById(postId)
    if (!post) throw new ReactionsError('NOT_FOUND')
    const counts = await this.reactionsRepo.countsByPostId(postId)
    const myReaction = viewerId
      ? (await this.reactionsRepo.findByPostAndUser(postId, viewerId))?.type ?? null
      : null
    return { counts, myReaction }
  }
}
```

- [ ] **Step 4: Rodar e confirmar aprovação**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/posts/reactions.service.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add tests/modules/posts/reactions.service.test.ts src/modules/posts/reactions.service.ts
git commit -m "feat: ReactionsService com TDD — react (upsert), remove, get com myReaction"
```

---

## Task 7: FeedService (TDD)

**Files:**
- Create: `tests/modules/posts/feed.service.test.ts`
- Create: `src/modules/posts/feed.service.ts`

- [ ] **Step 1: Escrever `feed.service.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeedService } from '../../../src/modules/posts/feed.service.js'
import type { IFeedRepository, FeedCursor } from '../../../src/shared/contracts/feed.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'
import type { Post } from '../../../src/shared/contracts/posts.repository.contract.js'

function createMockFeedRepo(): IFeedRepository {
  return {
    getFeed: vi.fn(),
    getProfilePosts: vi.fn(),
  }
}

function createMockFriendsRepo(): IFriendsRepository {
  return {
    createRequest: vi.fn(), findRequestById: vi.fn(), findExistingRelation: vi.fn(),
    findReceivedRequests: vi.fn(), findSentRequests: vi.fn(), updateRequestStatus: vi.fn(),
    findFriendIds: vi.fn(), areFriends: vi.fn(), removeFriendshipBetween: vi.fn(),
    createBlock: vi.fn(), deleteBlock: vi.fn(), isBlockedBy: vi.fn(),
    isBlockedEitherDirection: vi.fn(), findBlocksByBlocker: vi.fn(),
    findAllBlockRelationUserIds: vi.fn(),
  }
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1', userId: 'user-1', type: 'manual', content: 'texto',
    visibility: 'public', itemId: null, collectionId: null, media: [],
    createdAt: new Date('2026-01-01T10:00:00Z'), updatedAt: new Date(), ...overrides,
  }
}

describe('FeedService', () => {
  let feedRepo: IFeedRepository
  let friendsRepo: IFriendsRepository
  let service: FeedService

  beforeEach(() => {
    feedRepo = createMockFeedRepo()
    friendsRepo = createMockFriendsRepo()
    service = new FeedService(feedRepo, friendsRepo)
    vi.clearAllMocks()
  })

  describe('getFeed', () => {
    it('deve repousar friendIds e blockedIds ao repositório', async () => {
      vi.mocked(friendsRepo.findFriendIds).mockResolvedValue(['friend-1'])
      vi.mocked(friendsRepo.findAllBlockRelationUserIds).mockResolvedValue(['blocked-1'])
      vi.mocked(feedRepo.getFeed).mockResolvedValue({ posts: [makePost()], nextCursor: null })

      const result = await service.getFeed('viewer-1', undefined, 20)

      expect(feedRepo.getFeed).toHaveBeenCalledWith({
        viewerId: 'viewer-1',
        friendIds: ['friend-1'],
        blockedIds: ['blocked-1'],
        cursor: undefined,
        limit: 20,
      })
      expect(result.posts).toHaveLength(1)
      expect(result.nextCursor).toBeNull()
    })

    it('deve decodificar cursor e repassar ao repositório', async () => {
      const cursor: FeedCursor = { createdAt: new Date('2026-01-01T10:00:00Z'), id: 'post-abc' }
      const token = Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString('base64')

      vi.mocked(friendsRepo.findFriendIds).mockResolvedValue([])
      vi.mocked(friendsRepo.findAllBlockRelationUserIds).mockResolvedValue([])
      vi.mocked(feedRepo.getFeed).mockResolvedValue({ posts: [], nextCursor: null })

      await service.getFeed('viewer-1', token, 20)

      expect(feedRepo.getFeed).toHaveBeenCalledWith(expect.objectContaining({
        cursor: { createdAt: cursor.createdAt, id: cursor.id },
      }))
    })

    it('deve retornar nextCursor codificado em base64', async () => {
      const nextCursor: FeedCursor = { createdAt: new Date('2026-01-01T09:00:00Z'), id: 'post-xyz' }
      vi.mocked(friendsRepo.findFriendIds).mockResolvedValue([])
      vi.mocked(friendsRepo.findAllBlockRelationUserIds).mockResolvedValue([])
      vi.mocked(feedRepo.getFeed).mockResolvedValue({ posts: [], nextCursor })

      const result = await service.getFeed('viewer-1', undefined, 20)

      const expected = Buffer.from(JSON.stringify({ createdAt: nextCursor.createdAt.toISOString(), id: nextCursor.id })).toString('base64')
      expect(result.nextCursor).toBe(expected)
    })
  })

  describe('getProfilePosts', () => {
    it('deve passar viewerIsFriend=true para amigos confirmados', async () => {
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(true)
      vi.mocked(feedRepo.getProfilePosts).mockResolvedValue({ posts: [], nextCursor: null })

      await service.getProfilePosts('owner-1', 'viewer-1', undefined, 20)

      expect(feedRepo.getProfilePosts).toHaveBeenCalledWith(expect.objectContaining({ viewerIsFriend: true }))
    })

    it('deve passar viewerIsFriend=false para não-amigos', async () => {
      vi.mocked(friendsRepo.areFriends).mockResolvedValue(false)
      vi.mocked(feedRepo.getProfilePosts).mockResolvedValue({ posts: [], nextCursor: null })

      await service.getProfilePosts('owner-1', 'viewer-1', undefined, 20)

      expect(feedRepo.getProfilePosts).toHaveBeenCalledWith(expect.objectContaining({ viewerIsFriend: false }))
    })

    it('deve passar viewerIsFriend=false para viewer não autenticado', async () => {
      vi.mocked(feedRepo.getProfilePosts).mockResolvedValue({ posts: [], nextCursor: null })

      await service.getProfilePosts('owner-1', null, undefined, 20)

      expect(friendsRepo.areFriends).not.toHaveBeenCalled()
      expect(feedRepo.getProfilePosts).toHaveBeenCalledWith(expect.objectContaining({ viewerIsFriend: false }))
    })
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/posts/feed.service.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Criar `feed.service.ts`**

```typescript
import type { IFeedRepository, FeedCursor } from '../../shared/contracts/feed.repository.contract.js'
import type { IFriendsRepository } from '../../shared/contracts/friends.repository.contract.js'
import type { Post } from '../../shared/contracts/posts.repository.contract.js'

export class FeedService {
  constructor(
    private readonly feedRepo: IFeedRepository,
    private readonly friendsRepo: IFriendsRepository,
  ) {}

  async getFeed(viewerId: string, cursorToken: string | undefined, limit: number) {
    const [friendIds, blockedIds] = await Promise.all([
      this.friendsRepo.findFriendIds(viewerId),
      this.friendsRepo.findAllBlockRelationUserIds(viewerId),
    ])
    const cursor = cursorToken ? decodeCursor(cursorToken) : undefined
    const { posts, nextCursor } = await this.feedRepo.getFeed({ viewerId, friendIds, blockedIds, cursor, limit })
    return { posts, nextCursor: nextCursor ? encodeCursor(nextCursor) : null }
  }

  async getProfilePosts(ownerId: string, viewerId: string | null, cursorToken: string | undefined, limit: number) {
    const viewerIsFriend = viewerId ? await this.friendsRepo.areFriends(viewerId, ownerId) : false
    const cursor = cursorToken ? decodeCursor(cursorToken) : undefined
    const { posts, nextCursor } = await this.feedRepo.getProfilePosts({ ownerId, viewerIsFriend, cursor, limit })
    return { posts, nextCursor: nextCursor ? encodeCursor(nextCursor) : null }
  }
}

function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString('base64')
}

function decodeCursor(token: string): FeedCursor {
  const { createdAt, id } = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'))
  return { createdAt: new Date(createdAt), id }
}
```

- [ ] **Step 4: Rodar e confirmar aprovação**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/posts/feed.service.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Rodar todos os testes**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run 2>&1 | tail -10
```
Esperado: todos passando (exceto eventuais erros de TypeScript pendentes do FriendsRepository).

- [ ] **Step 6: Commit**

```bash
git add tests/modules/posts/feed.service.test.ts src/modules/posts/feed.service.ts
git commit -m "feat: FeedService com TDD — cursor encoding, friendIds/blockedIds, profilePosts"
```

---

## Task 8: ItemsService — shareToFeed

**Files:**
- Modify: `tests/modules/items/items.service.test.ts`
- Modify: `src/modules/items/items.service.ts`

- [ ] **Step 1: Adicionar `findAllBlockRelationUserIds` ao mock em `items.service.test.ts`**

Localize a função `createMockFriendsRepository` no arquivo e adicione o método ao objeto retornado:
```typescript
findAllBlockRelationUserIds: vi.fn(),
```

- [ ] **Step 2: Adicionar mock de IPostsService e testes de shareToFeed em `items.service.test.ts`**

Adicione após os imports existentes:
```typescript
import type { IPostsService } from '../../../src/shared/contracts/posts.service.contract.js'

function createMockPostsService(): IPostsService {
  return {
    createItemShare: vi.fn(),
  }
}
```

Adicione ao `describe('ItemsService')` um novo bloco de testes:
```typescript
describe('create com shareToFeed', () => {
  let postsService: IPostsService

  beforeEach(() => {
    postsService = createMockPostsService()
    service = new ItemsService(itemRepo, collRepo, undefined, friendsRepo, postsService)
  })

  it('deve chamar createItemShare quando shareToFeed=true e coleção é public', async () => {
    const col = createMockCollection('user-1', [])
    vi.mocked(collRepo.findById).mockResolvedValue(col)
    vi.mocked(itemRepo.create).mockResolvedValue(createMockItem())
    vi.mocked(postsService.createItemShare).mockResolvedValue()

    await service.create('user-1', col.id, { name: 'Item', fields: {}, shareToFeed: true })

    expect(postsService.createItemShare).toHaveBeenCalledWith({
      userId: 'user-1',
      itemId: expect.any(String),
      collectionId: col.id,
      collectionVisibility: 'public',
    })
  })

  it('não deve chamar createItemShare quando shareToFeed=false', async () => {
    const col = createMockCollection('user-1', [])
    vi.mocked(collRepo.findById).mockResolvedValue(col)
    vi.mocked(itemRepo.create).mockResolvedValue(createMockItem())

    await service.create('user-1', col.id, { name: 'Item', fields: {}, shareToFeed: false })

    expect(postsService.createItemShare).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Rodar testes de items e confirmar falha nos novos**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/items/items.service.test.ts 2>&1 | tail -15
```
Esperado: testes existentes passando, novos falhando (ItemsService não aceita postsService ainda).

- [ ] **Step 4: Atualizar `items.service.ts`**

Adicionar import e parâmetro no construtor:
```typescript
import type { IPostsService } from '../../shared/contracts/posts.service.contract.js'
```

Atualizar o construtor:
```typescript
constructor(
  private readonly itemRepo: IItemRepository,
  private readonly collectionRepo: ICollectionRepository,
  private readonly storageService?: IStorageService,
  private readonly friendsRepo?: IFriendsRepository,
  private readonly postsService?: IPostsService,
) {}
```

Atualizar o método `create` — adicionar após `return this.itemRepo.create(...)`:
```typescript
async create(userId: string, collectionId: string, input: CreateItemInput): Promise<Item> {
  const collection = await this.assertCollectionOwnership(userId, collectionId)

  if (input.rating !== undefined && (input.rating < 1 || input.rating > 5)) {
    throw new ItemsError('INVALID_RATING')
  }

  this.validateFields(input.fields ?? {}, collection.fieldSchema)

  const item = await this.itemRepo.create({
    collectionId,
    name: input.name,
    fields: input.fields ?? {},
    rating: input.rating,
    comment: input.comment,
  })

  if (input.shareToFeed && this.postsService) {
    await this.postsService.createItemShare({
      userId,
      itemId: item.id,
      collectionId,
      collectionVisibility: collection.visibility,
    })
  }

  return item
}
```

- [ ] **Step 5: Rodar testes de items e confirmar aprovação**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run tests/modules/items/items.service.test.ts 2>&1 | tail -10
```
Esperado: todos passando.

- [ ] **Step 6: Adicionar `findAllBlockRelationUserIds: vi.fn()` nos mocks de collections e users**

Em `tests/modules/collections/collections.service.test.ts`:
```typescript
// localizar função createMockFriendsRepository e adicionar:
findAllBlockRelationUserIds: vi.fn(),
```

Em `tests/modules/users/users.service.test.ts`:
```typescript
// localizar função createMockFriendsRepository e adicionar:
findAllBlockRelationUserIds: vi.fn(),
```

Em `tests/modules/friends/friends.service.test.ts`:
```typescript
// localizar função createMockFriendsRepository e adicionar:
findAllBlockRelationUserIds: vi.fn(),
```

- [ ] **Step 7: Rodar todos os testes**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run 2>&1 | tail -10
```
Esperado: todos passando.

- [ ] **Step 8: Commit**

```bash
git add tests/modules/ src/modules/items/items.service.ts
git commit -m "feat: ItemsService com shareToFeed — integração com IPostsService"
```

---

## Task 9: Repositories — Posts, Comments, Reactions

**Files:**
- Create: `src/modules/posts/posts.repository.ts`
- Create: `src/modules/posts/comments.repository.ts`
- Create: `src/modules/posts/reactions.repository.ts`
- Modify: `src/modules/friends/friends.repository.ts`

- [ ] **Step 1: Criar `posts.repository.ts`**

```typescript
import { eq, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { posts, postMedia } from '../../shared/infra/database/schema.js'
import type { IPostsRepository, Post, PostMedia, CreatePostData, UpdatePostData } from '../../shared/contracts/posts.repository.contract.js'

export class PostsRepository implements IPostsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreatePostData): Promise<Post> {
    const result = await this.db.insert(posts).values({
      userId: data.userId,
      type: data.type,
      content: data.content ?? null,
      visibility: data.visibility,
      itemId: data.itemId ?? null,
      collectionId: data.collectionId ?? null,
    }).returning()
    return { ...result[0], media: [] } as Post
  }

  async findById(id: string): Promise<Post | null> {
    const result = await this.db.select().from(posts).where(eq(posts.id, id)).limit(1)
    if (!result[0]) return null
    const media = await this.db.select().from(postMedia)
      .where(eq(postMedia.postId, id))
      .orderBy(postMedia.displayOrder)
    return { ...result[0], media: media as PostMedia[] } as Post
  }

  async update(id: string, data: UpdatePostData): Promise<Post> {
    await this.db.update(posts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(posts.id, id))
    return (await this.findById(id))!
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(posts).where(eq(posts.id, id))
  }

  async addMedia(postId: string, url: string, displayOrder: number): Promise<PostMedia> {
    const result = await this.db.insert(postMedia)
      .values({ postId, url, displayOrder })
      .returning()
    return result[0] as PostMedia
  }

  async removeMedia(mediaId: string): Promise<void> {
    await this.db.delete(postMedia).where(eq(postMedia.id, mediaId))
  }

  async findMediaById(mediaId: string): Promise<PostMedia | null> {
    const result = await this.db.select().from(postMedia).where(eq(postMedia.id, mediaId)).limit(1)
    return (result[0] as PostMedia) ?? null
  }

  async countMedia(postId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(postMedia)
      .where(eq(postMedia.postId, postId))
    return result[0]?.count ?? 0
  }
}
```

- [ ] **Step 2: Criar `comments.repository.ts`**

```typescript
import { eq, and, or, lt, desc } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { postComments } from '../../shared/infra/database/schema.js'
import type { ICommentsRepository, Comment, CommentCursor } from '../../shared/contracts/comments.repository.contract.js'

export class CommentsRepository implements ICommentsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(postId: string, userId: string, content: string): Promise<Comment> {
    const result = await this.db.insert(postComments)
      .values({ postId, userId, content })
      .returning()
    return result[0] as Comment
  }

  async findById(id: string): Promise<Comment | null> {
    const result = await this.db.select().from(postComments).where(eq(postComments.id, id)).limit(1)
    return (result[0] as Comment) ?? null
  }

  async update(id: string, content: string): Promise<Comment> {
    const result = await this.db.update(postComments)
      .set({ content, updatedAt: new Date() })
      .where(eq(postComments.id, id))
      .returning()
    return result[0] as Comment
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(postComments).where(eq(postComments.id, id))
  }

  async findByPostId(postId: string, cursor?: CommentCursor, limit = 20): Promise<{ comments: Comment[]; nextCursor: CommentCursor | null }> {
    const cursorCondition = cursor
      ? or(
          lt(postComments.createdAt, cursor.createdAt),
          and(eq(postComments.createdAt, cursor.createdAt), lt(postComments.id, cursor.id)),
        )
      : undefined

    const conditions = [eq(postComments.postId, postId), cursorCondition].filter(Boolean)

    const rows = await this.db.select().from(postComments)
      .where(conditions.length === 1 ? conditions[0] : and(...(conditions as Parameters<typeof and>)))
      .orderBy(desc(postComments.createdAt), desc(postComments.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const last = pageRows[pageRows.length - 1]
    const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null

    return { comments: pageRows as Comment[], nextCursor }
  }
}
```

- [ ] **Step 3: Criar `reactions.repository.ts`**

```typescript
import { eq, and, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { postReactions } from '../../shared/infra/database/schema.js'
import type { IReactionsRepository, Reaction, ReactionType, ReactionCounts } from '../../shared/contracts/reactions.repository.contract.js'

const ALL_REACTION_TYPES: ReactionType[] = ['power_up', 'epic', 'critical', 'loot', 'gg']

export class ReactionsRepository implements IReactionsRepository {
  constructor(private readonly db: DatabaseClient) {}

  async upsert(postId: string, userId: string, type: ReactionType): Promise<Reaction> {
    const result = await this.db.insert(postReactions)
      .values({ postId, userId, type })
      .onConflictDoUpdate({
        target: [postReactions.postId, postReactions.userId],
        set: { type },
      })
      .returning()
    return result[0] as Reaction
  }

  async delete(postId: string, userId: string): Promise<void> {
    await this.db.delete(postReactions)
      .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)))
  }

  async findByPostAndUser(postId: string, userId: string): Promise<Reaction | null> {
    const result = await this.db.select().from(postReactions)
      .where(and(eq(postReactions.postId, postId), eq(postReactions.userId, userId)))
      .limit(1)
    return (result[0] as Reaction) ?? null
  }

  async countsByPostId(postId: string): Promise<ReactionCounts> {
    const rows = await this.db
      .select({ type: postReactions.type, count: sql<number>`count(*)::int` })
      .from(postReactions)
      .where(eq(postReactions.postId, postId))
      .groupBy(postReactions.type)

    const counts = Object.fromEntries(ALL_REACTION_TYPES.map(t => [t, 0])) as ReactionCounts
    for (const row of rows) {
      counts[row.type as ReactionType] = row.count
    }
    return counts
  }
}
```

- [ ] **Step 4: Implementar `findAllBlockRelationUserIds` em `friends.repository.ts`**

Adicionar ao final da classe `FriendsRepository`:
```typescript
async findAllBlockRelationUserIds(userId: string): Promise<string[]> {
  const rows = await this.db.select().from(userBlocks)
    .where(or(
      eq(userBlocks.blockerId, userId),
      eq(userBlocks.blockedId, userId),
    ))
  return rows.map(row => row.blockerId === userId ? row.blockedId : row.blockerId)
}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```
Esperado: sem erros (o erro de `FriendsRepository` pendente de Task 2 agora está resolvido).

- [ ] **Step 6: Rodar todos os testes**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run 2>&1 | tail -10
```
Esperado: todos passando.

- [ ] **Step 7: Commit**

```bash
git add src/modules/posts/posts.repository.ts src/modules/posts/comments.repository.ts src/modules/posts/reactions.repository.ts src/modules/friends/friends.repository.ts
git commit -m "feat: PostsRepository, CommentsRepository, ReactionsRepository e findAllBlockRelationUserIds"
```

---

## Task 10: FeedRepository

**Files:**
- Create: `src/modules/posts/feed.repository.ts`

- [ ] **Step 1: Criar `feed.repository.ts`**

```typescript
import { eq, and, or, inArray, notInArray, lt, desc } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { posts, postMedia } from '../../shared/infra/database/schema.js'
import type { IFeedRepository, GetFeedParams, GetProfilePostsParams, FeedCursor } from '../../shared/contracts/feed.repository.contract.js'
import type { Post, PostMedia } from '../../shared/contracts/posts.repository.contract.js'

async function loadMediaForPosts(db: DatabaseClient, postIds: string[]): Promise<Map<string, PostMedia[]>> {
  if (postIds.length === 0) return new Map()
  const allMedia = await db.select().from(postMedia)
    .where(inArray(postMedia.postId, postIds))
    .orderBy(postMedia.displayOrder)
  const mediaByPost = new Map<string, PostMedia[]>()
  for (const m of allMedia) {
    const arr = mediaByPost.get(m.postId) ?? []
    arr.push(m as PostMedia)
    mediaByPost.set(m.postId, arr)
  }
  return mediaByPost
}

function buildCursorCondition(cursor: FeedCursor) {
  return or(
    lt(posts.createdAt, cursor.createdAt),
    and(eq(posts.createdAt, cursor.createdAt), lt(posts.id, cursor.id)),
  )
}

function toPostsWithMedia(rows: typeof posts.$inferSelect[], mediaByPost: Map<string, PostMedia[]>): Post[] {
  return rows.map(r => ({ ...r, media: mediaByPost.get(r.id) ?? [] })) as Post[]
}

function paginateRows<T extends { createdAt: Date; id: string }>(rows: T[], limit: number): { pageRows: T[]; nextCursor: FeedCursor | null } {
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const last = pageRows[pageRows.length - 1]
  const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null
  return { pageRows, nextCursor }
}

export class FeedRepository implements IFeedRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getFeed({ viewerId, friendIds, blockedIds, cursor, limit }: GetFeedParams): Promise<{ posts: Post[]; nextCursor: FeedCursor | null }> {
    const ownClause = eq(posts.userId, viewerId)

    const friendClause = friendIds.length > 0
      ? and(
          inArray(posts.userId, friendIds),
          inArray(posts.visibility, ['public', 'friends_only']),
        )
      : undefined

    const discoveryClause = and(
      eq(posts.visibility, 'public'),
      friendIds.length > 0 ? notInArray(posts.userId, friendIds) : undefined,
      notInArray(posts.userId, [viewerId]),
    )

    const visibilityCondition = friendClause
      ? or(ownClause, friendClause, discoveryClause)
      : or(ownClause, discoveryClause)

    const conditions = [visibilityCondition!]
    if (blockedIds.length > 0) conditions.push(notInArray(posts.userId, blockedIds))
    if (cursor) conditions.push(buildCursorCondition(cursor)!)

    const rows = await this.db.select().from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit + 1)

    const { pageRows, nextCursor } = paginateRows(rows, limit)
    const mediaByPost = await loadMediaForPosts(this.db, pageRows.map(r => r.id))

    return { posts: toPostsWithMedia(pageRows, mediaByPost), nextCursor }
  }

  async getProfilePosts({ ownerId, viewerIsFriend, cursor, limit }: GetProfilePostsParams): Promise<{ posts: Post[]; nextCursor: FeedCursor | null }> {
    const visibilities = viewerIsFriend
      ? (['public', 'friends_only'] as const)
      : (['public'] as const)

    const conditions = [
      eq(posts.userId, ownerId),
      inArray(posts.visibility, [...visibilities]),
      ...(cursor ? [buildCursorCondition(cursor)!] : []),
    ]

    const rows = await this.db.select().from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit + 1)

    const { pageRows, nextCursor } = paginateRows(rows, limit)
    const mediaByPost = await loadMediaForPosts(this.db, pageRows.map(r => r.id))

    return { posts: toPostsWithMedia(pageRows, mediaByPost), nextCursor }
  }
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```
Esperado: sem erros.

- [ ] **Step 3: Rodar todos os testes**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/posts/feed.repository.ts
git commit -m "feat: FeedRepository com pull model — cursor-based pagination e índices compostos"
```

---

## Task 11: Controllers e Routes

**Files:**
- Create: `src/modules/posts/posts.controller.ts`
- Create: `src/modules/posts/posts.routes.ts`
- Create: `src/modules/posts/comments.controller.ts`
- Create: `src/modules/posts/comments.routes.ts`
- Create: `src/modules/posts/reactions.controller.ts`
- Create: `src/modules/posts/reactions.routes.ts`
- Create: `src/modules/posts/feed.controller.ts`
- Create: `src/modules/posts/feed.routes.ts`

- [ ] **Step 1: Criar `posts.controller.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PostsService } from './posts.service.js'
import { PostsError } from './posts.service.js'
import type { CreatePostInput, UpdatePostInput } from './posts.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class PostsController {
  constructor(private readonly service: PostsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof PostsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Não encontrado' })
      if (error.code === 'CANNOT_EDIT_ITEM_SHARE') return reply.status(400).send({ error: 'Posts automáticos não podem ser editados' })
      if (error.code === 'MEDIA_LIMIT_EXCEEDED') return reply.status(400).send({ error: 'Máximo de 4 imagens por post' })
      if (error.code === 'STORAGE_NOT_CONFIGURED') return reply.status(503).send({ error: 'Armazenamento indisponível' })
    }
    throw error
  }

  async createPost(request: FastifyRequest<{ Body: CreatePostInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const post = await this.service.createPost(userId, request.body)
      return reply.status(201).send(post)
    } catch (error) { return this.handleError(error, reply) }
  }

  async getPost(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const post = await this.service.getPost(request.params.id, userId)
      return reply.send(post)
    } catch (error) { return this.handleError(error, reply) }
  }

  async updatePost(request: FastifyRequest<{ Params: { id: string }; Body: UpdatePostInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const post = await this.service.updatePost(userId, request.params.id, request.body)
      return reply.send(post)
    } catch (error) { return this.handleError(error, reply) }
  }

  async deletePost(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.deletePost(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async addMedia(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const parts = request.files()
      const buffers: Buffer[] = []
      for await (const part of parts) {
        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk)
        buffers.push(Buffer.concat(chunks))
      }
      if (buffers.length === 0) return reply.status(400).send({ error: 'Nenhuma imagem enviada' })
      const media = await this.service.addMedia(userId, request.params.id, buffers)
      return reply.send(media)
    } catch (error) { return this.handleError(error, reply) }
  }

  async removeMedia(request: FastifyRequest<{ Params: { id: string; mediaId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.removeMedia(userId, request.params.id, request.params.mediaId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }
}
```

- [ ] **Step 2: Criar `posts.routes.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import type { PostsService } from './posts.service.js'
import { PostsController } from './posts.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'

export async function postsRoutes(app: FastifyInstance, options: { postsService: PostsService }) {
  const controller = new PostsController(options.postsService)

  app.post('/', { preHandler: [authenticate], handler: controller.createPost.bind(controller) })
  app.get('/:id', { preHandler: [authenticate], handler: controller.getPost.bind(controller) })
  app.patch('/:id', { preHandler: [authenticate], handler: controller.updatePost.bind(controller) })
  app.delete('/:id', { preHandler: [authenticate], handler: controller.deletePost.bind(controller) })
  app.post('/:id/media', { preHandler: [authenticate], handler: controller.addMedia.bind(controller) })
  app.delete('/:id/media/:mediaId', { preHandler: [authenticate], handler: controller.removeMedia.bind(controller) })
}
```

- [ ] **Step 3: Criar `comments.controller.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CommentsService } from './comments.service.js'
import { CommentsError } from './comments.service.js'
import type { AddCommentInput, UpdateCommentInput } from './posts.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof CommentsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Não encontrado' })
      if (error.code === 'FORBIDDEN') return reply.status(403).send({ error: 'Sem permissão' })
    }
    throw error
  }

  async addComment(request: FastifyRequest<{ Params: { postId: string }; Body: AddCommentInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const comment = await this.service.addComment(userId, request.params.postId, request.body.content)
      return reply.status(201).send(comment)
    } catch (error) { return this.handleError(error, reply) }
  }

  async listComments(request: FastifyRequest<{ Params: { postId: string }; Querystring: { cursor?: string; limit?: number } }>, reply: FastifyReply) {
    const userId = (request.user as AccessTokenClaims | undefined)?.userId ?? null
    try {
      const result = await this.service.listComments(userId, request.params.postId, request.query.cursor, request.query.limit ?? 20)
      return reply.send(result)
    } catch (error) { return this.handleError(error, reply) }
  }

  async updateComment(request: FastifyRequest<{ Params: { postId: string; id: string }; Body: UpdateCommentInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const comment = await this.service.updateComment(userId, request.params.postId, request.params.id, request.body.content)
      return reply.send(comment)
    } catch (error) { return this.handleError(error, reply) }
  }

  async deleteComment(request: FastifyRequest<{ Params: { postId: string; id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.deleteComment(userId, request.params.postId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }
}
```

- [ ] **Step 4: Criar `comments.routes.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import type { CommentsService } from './comments.service.js'
import { CommentsController } from './comments.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'

export async function commentsRoutes(app: FastifyInstance, options: { commentsService: CommentsService }) {
  const controller = new CommentsController(options.commentsService)

  app.post('/:postId/comments', { preHandler: [authenticate], handler: controller.addComment.bind(controller) })
  app.get('/:postId/comments', { preHandler: [optionalAuthenticate], handler: controller.listComments.bind(controller) })
  app.patch('/:postId/comments/:id', { preHandler: [authenticate], handler: controller.updateComment.bind(controller) })
  app.delete('/:postId/comments/:id', { preHandler: [authenticate], handler: controller.deleteComment.bind(controller) })
}
```

- [ ] **Step 5: Criar `reactions.controller.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ReactionsService } from './reactions.service.js'
import { ReactionsError } from './reactions.service.js'
import type { AddReactionInput } from './posts.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class ReactionsController {
  constructor(private readonly service: ReactionsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof ReactionsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Não encontrado' })
      if (error.code === 'SELF_REACTION') return reply.status(400).send({ error: 'Não é possível reagir ao próprio post' })
    }
    throw error
  }

  async react(request: FastifyRequest<{ Params: { postId: string }; Body: AddReactionInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const counts = await this.service.react(userId, request.params.postId, request.body.type)
      return reply.send({ counts })
    } catch (error) { return this.handleError(error, reply) }
  }

  async removeReaction(request: FastifyRequest<{ Params: { postId: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.removeReaction(userId, request.params.postId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async getReactions(request: FastifyRequest<{ Params: { postId: string } }>, reply: FastifyReply) {
    const viewerId = (request.user as AccessTokenClaims | undefined)?.userId ?? null
    try {
      const result = await this.service.getReactions(request.params.postId, viewerId)
      return reply.send(result)
    } catch (error) { return this.handleError(error, reply) }
  }
}
```

- [ ] **Step 6: Criar `reactions.routes.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import type { ReactionsService } from './reactions.service.js'
import { ReactionsController } from './reactions.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'

export async function reactionsRoutes(app: FastifyInstance, options: { reactionsService: ReactionsService }) {
  const controller = new ReactionsController(options.reactionsService)

  app.post('/:postId/reactions', { preHandler: [authenticate], handler: controller.react.bind(controller) })
  app.delete('/:postId/reactions', { preHandler: [authenticate], handler: controller.removeReaction.bind(controller) })
  app.get('/:postId/reactions', { preHandler: [optionalAuthenticate], handler: controller.getReactions.bind(controller) })
}
```

- [ ] **Step 7: Criar `feed.controller.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FeedService } from './feed.service.js'
import type { FeedQueryInput } from './posts.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class FeedController {
  constructor(private readonly service: FeedService) {}

  async getFeed(request: FastifyRequest<{ Querystring: FeedQueryInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const { cursor, limit } = request.query
    const result = await this.service.getFeed(userId, cursor, limit)
    return reply.send(result)
  }

  async getProfilePosts(request: FastifyRequest<{ Params: { userId: string }; Querystring: FeedQueryInput }>, reply: FastifyReply) {
    const viewerId = (request.user as AccessTokenClaims | undefined)?.userId ?? null
    const { cursor, limit } = request.query
    const result = await this.service.getProfilePosts(request.params.userId, viewerId, cursor, limit)
    return reply.send(result)
  }
}
```

- [ ] **Step 8: Criar `feed.routes.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import type { FeedService } from './feed.service.js'
import { FeedController } from './feed.controller.js'
import { authenticate, optionalAuthenticate } from '../../shared/middleware/authenticate.js'

export async function feedRoutes(app: FastifyInstance, options: { feedService: FeedService }) {
  const controller = new FeedController(options.feedService)

  app.get('/', { preHandler: [authenticate], handler: controller.getFeed.bind(controller) })
}

export async function profilePostsRoutes(app: FastifyInstance, options: { feedService: FeedService }) {
  const controller = new FeedController(options.feedService)

  app.get('/:userId/posts', { preHandler: [optionalAuthenticate], handler: controller.getProfilePosts.bind(controller) })
}
```

- [ ] **Step 9: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```
Esperado: sem erros.

- [ ] **Step 10: Commit**

```bash
git add src/modules/posts/
git commit -m "feat: controllers e routes de posts, comentários, reações e feed"
```

---

## Task 12: Wire DI em app.ts

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Adicionar imports no topo de `app.ts`**

Adicione após os imports existentes de `friends`:
```typescript
import { PostsRepository } from './modules/posts/posts.repository.js'
import { PostsService } from './modules/posts/posts.service.js'
import { CommentsRepository } from './modules/posts/comments.repository.js'
import { CommentsService } from './modules/posts/comments.service.js'
import { ReactionsRepository } from './modules/posts/reactions.repository.js'
import { ReactionsService } from './modules/posts/reactions.service.js'
import { FeedRepository } from './modules/posts/feed.repository.js'
import { FeedService } from './modules/posts/feed.service.js'
import { postsRoutes } from './modules/posts/posts.routes.js'
import { commentsRoutes } from './modules/posts/comments.routes.js'
import { reactionsRoutes } from './modules/posts/reactions.routes.js'
import { feedRoutes, profilePostsRoutes } from './modules/posts/feed.routes.js'
```

- [ ] **Step 2: Instanciar os novos serviços em `buildApp()`**

Adicione após a linha `const itemsService = new ItemsService(...)`:
```typescript
const postsRepository = new PostsRepository(db)
const postsService = new PostsService(postsRepository, storageService)

const commentsRepository = new CommentsRepository(db)
const commentsService = new CommentsService(commentsRepository, postsRepository, friendsRepository)

const reactionsRepository = new ReactionsRepository(db)
const reactionsService = new ReactionsService(reactionsRepository, postsRepository, friendsRepository)

const feedRepository = new FeedRepository(db)
const feedService = new FeedService(feedRepository, friendsRepository)
```

- [ ] **Step 3: Atualizar instanciação de `itemsService` para incluir postsService**

Substitua a linha existente:
```typescript
const itemsService = new ItemsService(itemsRepository, collectionsRepository, storageService, friendsRepository, postsService)
```

- [ ] **Step 4: Registrar as novas rotas**

Adicione após `app.register(blocksRoutes, ...)`:
```typescript
await app.register(postsRoutes, { prefix: '/posts', postsService })
await app.register(commentsRoutes, { prefix: '/posts', commentsService })
await app.register(reactionsRoutes, { prefix: '/posts', reactionsService })
await app.register(feedRoutes, { prefix: '/feed', feedService })
await app.register(profilePostsRoutes, { prefix: '/users', feedService })
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```
Esperado: sem erros.

- [ ] **Step 6: Rodar todos os testes**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run 2>&1 | tail -10
```
Esperado: todos passando.

- [ ] **Step 7: Commit**

```bash
git add src/app.ts
git commit -m "feat: wiring DI — posts, comentários, reações e feed registrados em app.ts"
```

---

## Verificação final

- [ ] **TypeScript limpo**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx tsc --noEmit
```

- [ ] **Todos os testes passando**

```bash
cd /home/dev/workspace_ssh/geek-social-api && npx vitest run --reporter=verbose 2>&1 | tail -20
```

- [ ] **Push para o repositório remoto**

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519 -p 2222" git push --follow-tags
```
