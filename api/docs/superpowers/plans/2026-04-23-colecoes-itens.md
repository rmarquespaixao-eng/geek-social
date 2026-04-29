# Coleções e Itens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o sistema de coleções e itens da rede social geek: CRUD de coleções (5 tipos), campos padrão por tipo via seed, campo customizados reutilizáveis por usuário, CRUD de itens com validação de campos e busca.

**Architecture:** Três módulos novos (`collections`, `items`, `field-definitions`) seguindo o padrão hexagonal pragmático já estabelecido (routes → controller → service → repository). `CollectionsService` coordena com `IFieldDefinitionRepository` para popular o schema de campos ao criar uma coleção. `ItemsService` valida o JSONB `fields` contra o `collection_field_schema` ao criar/editar itens.

**Tech Stack:** Node.js + TypeScript + Fastify 5, Drizzle ORM, PostgreSQL 17, Vitest, Sharp + S3

---

## Estrutura de Arquivos

**Novos:**
```
src/shared/infra/database/seeds/field-definitions.seed.ts
src/shared/contracts/collection.repository.contract.ts
src/shared/contracts/item.repository.contract.ts
src/shared/contracts/field-definition.repository.contract.ts
src/modules/collections/collections.routes.ts
src/modules/collections/collections.controller.ts
src/modules/collections/collections.service.ts
src/modules/collections/collections.repository.ts
src/modules/collections/collections.schema.ts
src/modules/items/items.routes.ts
src/modules/items/items.controller.ts
src/modules/items/items.service.ts
src/modules/items/items.repository.ts
src/modules/items/items.schema.ts
src/modules/field-definitions/field-definitions.routes.ts
src/modules/field-definitions/field-definitions.controller.ts
src/modules/field-definitions/field-definitions.service.ts
src/modules/field-definitions/field-definitions.repository.ts
src/modules/field-definitions/field-definitions.schema.ts
tests/modules/collections/collections.service.test.ts
tests/modules/items/items.service.test.ts
tests/modules/field-definitions/field-definitions.service.test.ts
tests/integration/collections-items.integration.test.ts
```

**Modificados:**
```
src/shared/infra/database/schema.ts   — 4 novas tabelas + 3 novos enums
src/app.ts                            — registrar rotas + chamar seed
```

---

## Task 1: Database Schema + Migration

**Files:**
- Modify: `src/shared/infra/database/schema.ts`
- Create: migration (gerada por drizzle-kit)

- [ ] **Step 1: Adicionar enums e tabelas ao schema**

Substituir o bloco de imports e todo o conteúdo de `src/shared/infra/database/schema.ts`:

```typescript
import {
  pgTable, pgEnum, uuid, varchar, text,
  boolean, timestamp, integer, smallint, jsonb,
} from 'drizzle-orm/pg-core'

export const privacyEnum = pgEnum('privacy', ['public', 'friends_only', 'private'])
export const collectionTypeEnum = pgEnum('collection_type', ['games', 'books', 'cardgames', 'boardgames', 'custom'])
export const collectionVisibilityEnum = pgEnum('collection_visibility', ['public', 'private'])
export const fieldTypeEnum = pgEnum('field_type', ['text', 'number', 'date', 'boolean', 'select'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash'),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  bio: text('bio'),
  avatarUrl: varchar('avatar_url'),
  coverUrl: varchar('cover_url'),
  privacy: privacyEnum('privacy').default('public').notNull(),
  keycloakId: varchar('keycloak_id').unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const fieldDefinitions = pgTable('field_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  fieldKey: varchar('field_key', { length: 50 }).notNull(),
  fieldType: fieldTypeEnum('field_type').notNull(),
  collectionType: collectionTypeEnum('collection_type'),
  selectOptions: jsonb('select_options').$type<string[]>(),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const collections = pgTable('collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  iconUrl: varchar('icon_url'),
  coverUrl: varchar('cover_url'),
  type: collectionTypeEnum('type').notNull(),
  visibility: collectionVisibilityEnum('visibility').default('public').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const collectionFieldSchema = pgTable('collection_field_schema', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  fieldDefinitionId: uuid('field_definition_id').notNull().references(() => fieldDefinitions.id),
  isRequired: boolean('is_required').default(false).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
})

export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  coverUrl: varchar('cover_url'),
  fields: jsonb('fields').$type<Record<string, unknown>>().default({}).notNull(),
  rating: smallint('rating'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
```

- [ ] **Step 2: Gerar migration**

```bash
cd /home/dev/workspace_ssh/geek-social-api
npx drizzle-kit generate
```

Esperado: novo arquivo criado em `src/shared/infra/database/migrations/0001_*.sql` com os 4 novos `CREATE TABLE` e 3 `CREATE TYPE`.

- [ ] **Step 3: Verificar SQL gerado**

Abrir o arquivo de migration gerado e confirmar que contém:
- `CREATE TYPE "public"."collection_type"` com os 5 valores
- `CREATE TYPE "public"."collection_visibility"` com `public/private`
- `CREATE TYPE "public"."field_type"` com os 5 tipos
- `CREATE TABLE "field_definitions"` com `user_id` nullable
- `CREATE TABLE "collections"` com FK para users
- `CREATE TABLE "collection_field_schema"` com cascade delete
- `CREATE TABLE "items"` com cascade delete

- [ ] **Step 4: Commit**

```bash
git add src/shared/infra/database/schema.ts src/shared/infra/database/migrations/
git commit -m "feat: schema das tabelas collections, field_definitions, collection_field_schema e items"
```

---

## Task 2: Contrato e Repositório de FieldDefinitions

**Files:**
- Create: `src/shared/contracts/field-definition.repository.contract.ts`
- Create: `src/modules/field-definitions/field-definitions.repository.ts`

- [ ] **Step 1: Criar contrato**

`src/shared/contracts/field-definition.repository.contract.ts`:
```typescript
export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'select'
export type CollectionType = 'games' | 'books' | 'cardgames' | 'boardgames' | 'custom'

export type FieldDefinition = {
  id: string
  userId: string | null
  name: string
  fieldKey: string
  fieldType: FieldType
  collectionType: CollectionType | null
  selectOptions: string[] | null
  isSystem: boolean
  createdAt: Date
}

export type CreateFieldDefinitionData = {
  userId: string
  name: string
  fieldKey: string
  fieldType: FieldType
  selectOptions?: string[]
}

export interface IFieldDefinitionRepository {
  create(data: CreateFieldDefinitionData): Promise<FieldDefinition>
  findById(id: string): Promise<FieldDefinition | null>
  findByUserId(userId: string): Promise<FieldDefinition[]>
  findSystemByCollectionType(type: CollectionType): Promise<FieldDefinition[]>
  isFieldKeyTaken(userId: string, fieldKey: string): Promise<boolean>
  isInUse(id: string): Promise<boolean>
  delete(id: string): Promise<void>
  upsertSystem(data: Omit<FieldDefinition, 'id' | 'createdAt'>): Promise<void>
}
```

- [ ] **Step 2: Implementar repositório**

`src/modules/field-definitions/field-definitions.repository.ts`:
```typescript
import { eq, and, count } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { fieldDefinitions, collectionFieldSchema } from '../../shared/infra/database/schema.js'
import type {
  IFieldDefinitionRepository,
  FieldDefinition,
  CreateFieldDefinitionData,
  CollectionType,
} from '../../shared/contracts/field-definition.repository.contract.js'

export class FieldDefinitionRepository implements IFieldDefinitionRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateFieldDefinitionData): Promise<FieldDefinition> {
    const result = await this.db.insert(fieldDefinitions).values({
      userId: data.userId,
      name: data.name,
      fieldKey: data.fieldKey,
      fieldType: data.fieldType,
      selectOptions: data.selectOptions ?? null,
      isSystem: false,
    }).returning()
    return result[0] as FieldDefinition
  }

  async findById(id: string): Promise<FieldDefinition | null> {
    const result = await this.db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id)).limit(1)
    return (result[0] as FieldDefinition) ?? null
  }

  async findByUserId(userId: string): Promise<FieldDefinition[]> {
    return this.db.select().from(fieldDefinitions)
      .where(eq(fieldDefinitions.userId, userId)) as Promise<FieldDefinition[]>
  }

  async findSystemByCollectionType(type: CollectionType): Promise<FieldDefinition[]> {
    return this.db.select().from(fieldDefinitions)
      .where(and(
        eq(fieldDefinitions.isSystem, true),
        eq(fieldDefinitions.collectionType, type),
      )) as Promise<FieldDefinition[]>
  }

  async isFieldKeyTaken(userId: string, fieldKey: string): Promise<boolean> {
    const result = await this.db.select({ count: count() }).from(fieldDefinitions)
      .where(and(eq(fieldDefinitions.userId, userId), eq(fieldDefinitions.fieldKey, fieldKey)))
    return (result[0]?.count ?? 0) > 0
  }

  async isInUse(id: string): Promise<boolean> {
    const result = await this.db.select({ count: count() }).from(collectionFieldSchema)
      .where(eq(collectionFieldSchema.fieldDefinitionId, id))
    return (result[0]?.count ?? 0) > 0
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(fieldDefinitions).where(eq(fieldDefinitions.id, id))
  }

  async upsertSystem(data: Omit<FieldDefinition, 'id' | 'createdAt'>): Promise<void> {
    const existing = await this.db.select({ id: fieldDefinitions.id })
      .from(fieldDefinitions)
      .where(and(
        eq(fieldDefinitions.isSystem, true),
        eq(fieldDefinitions.fieldKey, data.fieldKey),
        eq(fieldDefinitions.collectionType, data.collectionType!),
      ))
      .limit(1)
    if (existing.length > 0) return
    await this.db.insert(fieldDefinitions).values({
      userId: null,
      name: data.name,
      fieldKey: data.fieldKey,
      fieldType: data.fieldType,
      collectionType: data.collectionType,
      selectOptions: data.selectOptions ?? null,
      isSystem: true,
    })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/contracts/field-definition.repository.contract.ts src/modules/field-definitions/field-definitions.repository.ts
git commit -m "feat: contrato e repositório de field definitions"
```

---

## Task 3: Seed dos Campos de Sistema

**Files:**
- Create: `src/shared/infra/database/seeds/field-definitions.seed.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Criar seed**

`src/shared/infra/database/seeds/field-definitions.seed.ts`:
```typescript
import type { IFieldDefinitionRepository } from '../../../shared/contracts/field-definition.repository.contract.js'

const SYSTEM_FIELDS = [
  // games
  { name: 'Plataforma', fieldKey: 'platform', fieldType: 'select' as const, collectionType: 'games' as const, selectOptions: ['PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series', 'Nintendo Switch', 'PC', 'Mobile', 'Outro'], isSystem: true, userId: null },
  { name: 'Gênero', fieldKey: 'genre', fieldType: 'text' as const, collectionType: 'games' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Ano de lançamento', fieldKey: 'release_year', fieldType: 'number' as const, collectionType: 'games' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Desenvolvedor', fieldKey: 'developer', fieldType: 'text' as const, collectionType: 'games' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Status', fieldKey: 'status', fieldType: 'select' as const, collectionType: 'games' as const, selectOptions: ['Na fila', 'Em andamento', 'Zerado'], isSystem: true, userId: null },
  { name: 'Data que zerou', fieldKey: 'completion_date', fieldType: 'date' as const, collectionType: 'games' as const, selectOptions: null, isSystem: true, userId: null },

  // books
  { name: 'Autor', fieldKey: 'author', fieldType: 'text' as const, collectionType: 'books' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Editora', fieldKey: 'publisher', fieldType: 'text' as const, collectionType: 'books' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Ano de publicação', fieldKey: 'publication_year', fieldType: 'number' as const, collectionType: 'books' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Gênero', fieldKey: 'genre', fieldType: 'text' as const, collectionType: 'books' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Número de páginas', fieldKey: 'page_count', fieldType: 'number' as const, collectionType: 'books' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'ISBN', fieldKey: 'isbn', fieldType: 'text' as const, collectionType: 'books' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Status', fieldKey: 'status', fieldType: 'select' as const, collectionType: 'books' as const, selectOptions: ['Quero ler', 'Lendo', 'Lido'], isSystem: true, userId: null },

  // cardgames
  { name: 'Jogo base', fieldKey: 'game_base', fieldType: 'select' as const, collectionType: 'cardgames' as const, selectOptions: ['Magic', 'Pokémon', 'Yu-Gi-Oh', 'Outro'], isSystem: true, userId: null },
  { name: 'Raridade', fieldKey: 'rarity', fieldType: 'text' as const, collectionType: 'cardgames' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Condição', fieldKey: 'condition', fieldType: 'select' as const, collectionType: 'cardgames' as const, selectOptions: ['Mint', 'Near Mint', 'Played'], isSystem: true, userId: null },
  { name: 'Quantidade', fieldKey: 'quantity', fieldType: 'number' as const, collectionType: 'cardgames' as const, selectOptions: null, isSystem: true, userId: null },

  // boardgames
  { name: 'Editora', fieldKey: 'publisher', fieldType: 'text' as const, collectionType: 'boardgames' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Ano', fieldKey: 'release_year', fieldType: 'number' as const, collectionType: 'boardgames' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Jogadores (mín)', fieldKey: 'min_players', fieldType: 'number' as const, collectionType: 'boardgames' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Jogadores (máx)', fieldKey: 'max_players', fieldType: 'number' as const, collectionType: 'boardgames' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Tempo de partida (min)', fieldKey: 'play_time', fieldType: 'number' as const, collectionType: 'boardgames' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Gênero/Mecânica', fieldKey: 'genre', fieldType: 'text' as const, collectionType: 'boardgames' as const, selectOptions: null, isSystem: true, userId: null },
  { name: 'Status', fieldKey: 'status', fieldType: 'select' as const, collectionType: 'boardgames' as const, selectOptions: ['Tenho', 'Quero', 'Emprestado'], isSystem: true, userId: null },
]

export async function seedFieldDefinitions(repo: IFieldDefinitionRepository): Promise<void> {
  for (const field of SYSTEM_FIELDS) {
    await repo.upsertSystem(field)
  }
}
```

- [ ] **Step 2: Chamar seed em `src/app.ts` após migrate**

Localizar o bloco de migrate em `src/app.ts` e adicionar logo após:

```typescript
import { FieldDefinitionRepository } from './modules/field-definitions/field-definitions.repository.js'
import { seedFieldDefinitions } from './shared/infra/database/seeds/field-definitions.seed.js'
```

E no corpo de `buildApp()`, logo após o `await migrate(...)`:
```typescript
const fieldDefRepoForSeed = new FieldDefinitionRepository(db)
await seedFieldDefinitions(fieldDefRepoForSeed)
```

- [ ] **Step 3: Rodar build para verificar tipos**

```bash
cd /home/dev/workspace_ssh/geek-social-api
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/shared/infra/database/seeds/ src/app.ts src/modules/field-definitions/field-definitions.repository.ts
git commit -m "feat: seed dos campos de sistema por tipo de coleção"
```

---

## Task 4: FieldDefinitions Service (TDD)

**Files:**
- Create: `tests/modules/field-definitions/field-definitions.service.test.ts`
- Create: `src/modules/field-definitions/field-definitions.service.ts`
- Create: `src/modules/field-definitions/field-definitions.schema.ts`

- [ ] **Step 1: Criar schema Zod**

`src/modules/field-definitions/field-definitions.schema.ts`:
```typescript
import { z } from 'zod'

export const createFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  fieldType: z.enum(['text', 'number', 'date', 'boolean', 'select']),
  selectOptions: z.array(z.string().min(1)).min(1).optional(),
}).refine(
  data => data.fieldType !== 'select' || (data.selectOptions && data.selectOptions.length > 0),
  { message: 'selectOptions obrigatório para tipo select', path: ['selectOptions'] },
)

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>
```

- [ ] **Step 2: Escrever testes (falham)**

`tests/modules/field-definitions/field-definitions.service.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FieldDefinitionsService } from '../../../src/modules/field-definitions/field-definitions.service.js'
import type { IFieldDefinitionRepository, FieldDefinition } from '../../../src/shared/contracts/field-definition.repository.contract.js'

function createMockFieldDefinitionRepository(): IFieldDefinitionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findSystemByCollectionType: vi.fn(),
    isFieldKeyTaken: vi.fn(),
    isInUse: vi.fn(),
    delete: vi.fn(),
    upsertSystem: vi.fn(),
  }
}

function createMockFieldDef(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'fd-uuid-1',
    userId: 'user-uuid-1',
    name: 'Plataforma',
    fieldKey: 'plataforma',
    fieldType: 'text',
    collectionType: null,
    selectOptions: null,
    isSystem: false,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('FieldDefinitionsService', () => {
  let repo: ReturnType<typeof createMockFieldDefinitionRepository>
  let service: FieldDefinitionsService

  beforeEach(() => {
    repo = createMockFieldDefinitionRepository()
    service = new FieldDefinitionsService(repo)
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('deve criar campo com field_key gerado automaticamente', async () => {
      vi.mocked(repo.isFieldKeyTaken).mockResolvedValue(false)
      vi.mocked(repo.create).mockResolvedValue(createMockFieldDef({ name: 'Número de Série', fieldKey: 'numero_de_serie' }))

      const result = await service.create('user-uuid-1', { name: 'Número de Série', fieldType: 'text' })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ fieldKey: 'numero_de_serie' }))
      expect(result.fieldKey).toBe('numero_de_serie')
    })

    it('deve lançar erro se field_key já existe para o usuário', async () => {
      vi.mocked(repo.isFieldKeyTaken).mockResolvedValue(true)

      await expect(service.create('user-uuid-1', { name: 'Plataforma', fieldType: 'text' }))
        .rejects.toThrow('FIELD_KEY_ALREADY_EXISTS')
    })

    it('deve aceitar campo do tipo select com opções', async () => {
      vi.mocked(repo.isFieldKeyTaken).mockResolvedValue(false)
      vi.mocked(repo.create).mockResolvedValue(createMockFieldDef({
        fieldType: 'select',
        selectOptions: ['A', 'B'],
      }))

      const result = await service.create('user-uuid-1', {
        name: 'Tamanho',
        fieldType: 'select',
        selectOptions: ['A', 'B'],
      })

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ selectOptions: ['A', 'B'] }))
      expect(result.fieldType).toBe('select')
    })
  })

  describe('listByUser', () => {
    it('deve retornar definições do usuário', async () => {
      const defs = [createMockFieldDef(), createMockFieldDef({ id: 'fd-2' })]
      vi.mocked(repo.findByUserId).mockResolvedValue(defs)

      const result = await service.listByUser('user-uuid-1')

      expect(repo.findByUserId).toHaveBeenCalledWith('user-uuid-1')
      expect(result).toHaveLength(2)
    })
  })

  describe('delete', () => {
    it('deve excluir definição que não está em uso', async () => {
      vi.mocked(repo.findById).mockResolvedValue(createMockFieldDef())
      vi.mocked(repo.isInUse).mockResolvedValue(false)

      await service.delete('user-uuid-1', 'fd-uuid-1')

      expect(repo.delete).toHaveBeenCalledWith('fd-uuid-1')
    })

    it('deve lançar erro se definição está em uso', async () => {
      vi.mocked(repo.findById).mockResolvedValue(createMockFieldDef())
      vi.mocked(repo.isInUse).mockResolvedValue(true)

      await expect(service.delete('user-uuid-1', 'fd-uuid-1'))
        .rejects.toThrow('FIELD_IN_USE')
    })

    it('deve lançar erro se definição não pertence ao usuário', async () => {
      vi.mocked(repo.findById).mockResolvedValue(createMockFieldDef({ userId: 'outro-user' }))

      await expect(service.delete('user-uuid-1', 'fd-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar erro se definição é de sistema', async () => {
      vi.mocked(repo.findById).mockResolvedValue(createMockFieldDef({ userId: null, isSystem: true }))

      await expect(service.delete('user-uuid-1', 'fd-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })
  })
})
```

- [ ] **Step 3: Rodar testes para confirmar falha**

```bash
cd /home/dev/workspace_ssh/geek-social-api
npx vitest run tests/modules/field-definitions/field-definitions.service.test.ts
```

Esperado: FAIL — `FieldDefinitionsService` não existe.

- [ ] **Step 4: Implementar service**

`src/modules/field-definitions/field-definitions.service.ts`:
```typescript
import type { IFieldDefinitionRepository, FieldDefinition } from '../../shared/contracts/field-definition.repository.contract.js'
import type { CreateFieldDefinitionInput } from './field-definitions.schema.js'

export class FieldDefinitionsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'FieldDefinitionsError'
  }
}

function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export class FieldDefinitionsService {
  constructor(private readonly repo: IFieldDefinitionRepository) {}

  async create(userId: string, input: CreateFieldDefinitionInput): Promise<FieldDefinition> {
    const fieldKey = toSlug(input.name)
    const taken = await this.repo.isFieldKeyTaken(userId, fieldKey)
    if (taken) throw new FieldDefinitionsError('FIELD_KEY_ALREADY_EXISTS')

    return this.repo.create({
      userId,
      name: input.name,
      fieldKey,
      fieldType: input.fieldType,
      selectOptions: input.selectOptions,
    })
  }

  async listByUser(userId: string): Promise<FieldDefinition[]> {
    return this.repo.findByUserId(userId)
  }

  async delete(userId: string, id: string): Promise<void> {
    const def = await this.repo.findById(id)
    if (!def || def.userId !== userId || def.isSystem) {
      throw new FieldDefinitionsError('NOT_FOUND')
    }
    const inUse = await this.repo.isInUse(id)
    if (inUse) throw new FieldDefinitionsError('FIELD_IN_USE')
    await this.repo.delete(id)
  }
}
```

- [ ] **Step 5: Rodar testes para confirmar passagem**

```bash
npx vitest run tests/modules/field-definitions/field-definitions.service.test.ts
```

Esperado: todos os testes PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/modules/field-definitions/ src/modules/field-definitions/field-definitions.service.ts src/modules/field-definitions/field-definitions.schema.ts
git commit -m "feat: FieldDefinitionsService com TDD — criar, listar e excluir campos customizados"
```

---

## Task 5: FieldDefinitions Routes + Controller + DI

**Files:**
- Create: `src/modules/field-definitions/field-definitions.controller.ts`
- Create: `src/modules/field-definitions/field-definitions.routes.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Criar controller**

`src/modules/field-definitions/field-definitions.controller.ts`:
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { FieldDefinitionsService } from './field-definitions.service.js'
import { FieldDefinitionsError } from './field-definitions.service.js'
import type { CreateFieldDefinitionInput } from './field-definitions.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class FieldDefinitionsController {
  constructor(private readonly service: FieldDefinitionsService) {}

  async list(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const defs = await this.service.listByUser(userId)
    return reply.send(defs)
  }

  async create(request: FastifyRequest<{ Body: CreateFieldDefinitionInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const def = await this.service.create(userId, request.body)
    return reply.status(201).send(def)
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.delete(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof FieldDefinitionsError) {
        if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Definição não encontrada' })
        if (error.code === 'FIELD_IN_USE') return reply.status(409).send({ error: 'Campo está em uso em uma coleção' })
      }
      throw error
    }
  }
}
```

- [ ] **Step 2: Criar routes**

`src/modules/field-definitions/field-definitions.routes.ts`:
```typescript
import type { FastifyInstance } from 'fastify'
import type { FieldDefinitionsService } from './field-definitions.service.js'
import { FieldDefinitionsController } from './field-definitions.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'

export async function fieldDefinitionsRoutes(
  app: FastifyInstance,
  options: { fieldDefinitionsService: FieldDefinitionsService },
) {
  const controller = new FieldDefinitionsController(options.fieldDefinitionsService)

  app.get('/', { preHandler: [authenticate], handler: controller.list.bind(controller) })
  app.post('/', { preHandler: [authenticate], handler: controller.create.bind(controller) })
  app.delete('/:id', { preHandler: [authenticate], handler: controller.delete.bind(controller) })
}
```

- [ ] **Step 3: Registrar em `src/app.ts`**

Adicionar imports ao topo de `src/app.ts`:
```typescript
import { FieldDefinitionsService } from './modules/field-definitions/field-definitions.service.js'
import { fieldDefinitionsRoutes } from './modules/field-definitions/field-definitions.routes.js'
```

No corpo de `buildApp()`, após o bloco de instanciação existente, adicionar antes dos `app.register` de rotas:
```typescript
const fieldDefinitionRepository = new FieldDefinitionRepository(db)
const fieldDefinitionsService = new FieldDefinitionsService(fieldDefinitionRepository)
```

Registrar a rota:
```typescript
await app.register(fieldDefinitionsRoutes, { prefix: '/field-definitions', fieldDefinitionsService })
```

- [ ] **Step 4: Verificar build**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/field-definitions/ src/app.ts
git commit -m "feat: rotas e controller de field definitions"
```

---

## Task 6: Contrato e Repositório de Collections

**Files:**
- Create: `src/shared/contracts/collection.repository.contract.ts`
- Create: `src/modules/collections/collections.repository.ts`

- [ ] **Step 1: Criar contrato**

`src/shared/contracts/collection.repository.contract.ts`:
```typescript
import type { CollectionType, FieldDefinition } from './field-definition.repository.contract.js'

export type CollectionVisibility = 'public' | 'private'

export type Collection = {
  id: string
  userId: string
  name: string
  description: string | null
  iconUrl: string | null
  coverUrl: string | null
  type: CollectionType
  visibility: CollectionVisibility
  createdAt: Date
  updatedAt: Date
}

export type CollectionSchemaEntry = {
  id: string
  fieldDefinition: FieldDefinition
  isRequired: boolean
  displayOrder: number
}

export type CollectionWithSchema = Collection & {
  fieldSchema: CollectionSchemaEntry[]
}

export type CreateCollectionData = {
  userId: string
  name: string
  description?: string
  type: CollectionType
  visibility?: CollectionVisibility
}

export type UpdateCollectionData = {
  name?: string
  description?: string
  visibility?: CollectionVisibility
  iconUrl?: string | null
  coverUrl?: string | null
}

export type SchemaEntryData = {
  fieldDefinitionId: string
  isRequired: boolean
  displayOrder: number
}

export interface ICollectionRepository {
  create(data: CreateCollectionData): Promise<Collection>
  findById(id: string): Promise<CollectionWithSchema | null>
  findByUserId(userId: string, query?: string): Promise<Collection[]>
  findPublicByUserId(userId: string): Promise<Collection[]>
  update(id: string, data: UpdateCollectionData): Promise<Collection>
  delete(id: string): Promise<void>
  addFieldsToSchema(collectionId: string, fields: SchemaEntryData[]): Promise<void>
  getFieldSchema(collectionId: string): Promise<CollectionSchemaEntry[]>
}
```

- [ ] **Step 2: Implementar repositório**

`src/modules/collections/collections.repository.ts`:
```typescript
import { eq, and, ilike, asc } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { collections, collectionFieldSchema, fieldDefinitions } from '../../shared/infra/database/schema.js'
import type {
  ICollectionRepository,
  Collection,
  CollectionWithSchema,
  CollectionSchemaEntry,
  CreateCollectionData,
  UpdateCollectionData,
  SchemaEntryData,
} from '../../shared/contracts/collection.repository.contract.js'

export class CollectionsRepository implements ICollectionRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateCollectionData): Promise<Collection> {
    const result = await this.db.insert(collections).values({
      userId: data.userId,
      name: data.name,
      description: data.description,
      type: data.type,
      visibility: data.visibility ?? 'public',
    }).returning()
    return result[0] as Collection
  }

  async findById(id: string): Promise<CollectionWithSchema | null> {
    const result = await this.db.select().from(collections).where(eq(collections.id, id)).limit(1)
    if (!result[0]) return null
    const schema = await this.getFieldSchema(id)
    return { ...result[0], fieldSchema: schema } as CollectionWithSchema
  }

  async findByUserId(userId: string, query?: string): Promise<Collection[]> {
    const condition = query
      ? and(eq(collections.userId, userId), ilike(collections.name, `%${query}%`))
      : eq(collections.userId, userId)
    return this.db.select().from(collections).where(condition) as Promise<Collection[]>
  }

  async findPublicByUserId(userId: string): Promise<Collection[]> {
    return this.db.select().from(collections)
      .where(and(eq(collections.userId, userId), eq(collections.visibility, 'public'))) as Promise<Collection[]>
  }

  async update(id: string, data: UpdateCollectionData): Promise<Collection> {
    const result = await this.db.update(collections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(collections.id, id))
      .returning()
    return result[0] as Collection
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(collections).where(eq(collections.id, id))
  }

  async addFieldsToSchema(collectionId: string, fields: SchemaEntryData[]): Promise<void> {
    if (fields.length === 0) return
    await this.db.insert(collectionFieldSchema).values(
      fields.map(f => ({
        collectionId,
        fieldDefinitionId: f.fieldDefinitionId,
        isRequired: f.isRequired,
        displayOrder: f.displayOrder,
      })),
    )
  }

  async getFieldSchema(collectionId: string): Promise<CollectionSchemaEntry[]> {
    const rows = await this.db
      .select({
        id: collectionFieldSchema.id,
        isRequired: collectionFieldSchema.isRequired,
        displayOrder: collectionFieldSchema.displayOrder,
        fieldDefinition: fieldDefinitions,
      })
      .from(collectionFieldSchema)
      .innerJoin(fieldDefinitions, eq(collectionFieldSchema.fieldDefinitionId, fieldDefinitions.id))
      .where(eq(collectionFieldSchema.collectionId, collectionId))
      .orderBy(asc(collectionFieldSchema.displayOrder))
    return rows as unknown as CollectionSchemaEntry[]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/contracts/collection.repository.contract.ts src/modules/collections/collections.repository.ts
git commit -m "feat: contrato e repositório de collections"
```

---

## Task 7: Collections Service (TDD)

**Files:**
- Create: `tests/modules/collections/collections.service.test.ts`
- Create: `src/modules/collections/collections.service.ts`
- Create: `src/modules/collections/collections.schema.ts`

- [ ] **Step 1: Criar schema Zod**

`src/modules/collections/collections.schema.ts`:
```typescript
import { z } from 'zod'

export const createCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['games', 'books', 'cardgames', 'boardgames', 'custom']),
  visibility: z.enum(['public', 'private']).default('public'),
  fieldDefinitionIds: z.array(z.string().uuid()).optional(),
})

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private']).optional(),
})

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>
```

- [ ] **Step 2: Escrever testes (falham)**

`tests/modules/collections/collections.service.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CollectionsService } from '../../../src/modules/collections/collections.service.js'
import type { ICollectionRepository, Collection, CollectionWithSchema } from '../../../src/shared/contracts/collection.repository.contract.js'
import type { IFieldDefinitionRepository, FieldDefinition } from '../../../src/shared/contracts/field-definition.repository.contract.js'

function createMockCollectionRepository(): ICollectionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findPublicByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addFieldsToSchema: vi.fn(),
    getFieldSchema: vi.fn(),
  }
}

function createMockFieldDefRepository(): IFieldDefinitionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findSystemByCollectionType: vi.fn(),
    isFieldKeyTaken: vi.fn(),
    isInUse: vi.fn(),
    delete: vi.fn(),
    upsertSystem: vi.fn(),
  }
}

function createMockCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-uuid-1',
    userId: 'user-uuid-1',
    name: 'Minha Coleção',
    description: null,
    iconUrl: null,
    coverUrl: null,
    type: 'games',
    visibility: 'public',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function createMockFieldDef(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'fd-uuid-1',
    userId: null,
    name: 'Plataforma',
    fieldKey: 'platform',
    fieldType: 'select',
    collectionType: 'games',
    selectOptions: ['PS2', 'PC'],
    isSystem: true,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('CollectionsService', () => {
  let collRepo: ReturnType<typeof createMockCollectionRepository>
  let fdRepo: ReturnType<typeof createMockFieldDefRepository>
  let service: CollectionsService

  beforeEach(() => {
    collRepo = createMockCollectionRepository()
    fdRepo = createMockFieldDefRepository()
    service = new CollectionsService(collRepo, fdRepo)
    vi.clearAllMocks()
  })

  describe('create — tipo padrão', () => {
    it('deve criar coleção e popular schema com campos de sistema', async () => {
      const col = createMockCollection()
      const systemFields = [createMockFieldDef(), createMockFieldDef({ id: 'fd-2', fieldKey: 'genre' })]
      vi.mocked(collRepo.create).mockResolvedValue(col)
      vi.mocked(fdRepo.findSystemByCollectionType).mockResolvedValue(systemFields)
      vi.mocked(collRepo.addFieldsToSchema).mockResolvedValue()
      vi.mocked(collRepo.findById).mockResolvedValue({ ...col, fieldSchema: [] })

      await service.create('user-uuid-1', { name: 'PS2', type: 'games', visibility: 'public' })

      expect(fdRepo.findSystemByCollectionType).toHaveBeenCalledWith('games')
      expect(collRepo.addFieldsToSchema).toHaveBeenCalledWith(
        col.id,
        expect.arrayContaining([
          expect.objectContaining({ fieldDefinitionId: 'fd-uuid-1' }),
          expect.objectContaining({ fieldDefinitionId: 'fd-2' }),
        ]),
      )
    })
  })

  describe('create — tipo custom', () => {
    it('deve criar coleção custom sem popular schema quando sem fieldDefinitionIds', async () => {
      const col = createMockCollection({ type: 'custom' })
      vi.mocked(collRepo.create).mockResolvedValue(col)
      vi.mocked(collRepo.findById).mockResolvedValue({ ...col, fieldSchema: [] })

      await service.create('user-uuid-1', { name: 'Custom', type: 'custom', visibility: 'public' })

      expect(fdRepo.findSystemByCollectionType).not.toHaveBeenCalled()
      expect(collRepo.addFieldsToSchema).not.toHaveBeenCalled()
    })

    it('deve popular schema com fieldDefinitionIds fornecidos', async () => {
      const col = createMockCollection({ type: 'custom' })
      vi.mocked(collRepo.create).mockResolvedValue(col)
      vi.mocked(collRepo.findById).mockResolvedValue({ ...col, fieldSchema: [] })
      vi.mocked(collRepo.addFieldsToSchema).mockResolvedValue()

      await service.create('user-uuid-1', {
        name: 'Custom',
        type: 'custom',
        visibility: 'public',
        fieldDefinitionIds: ['fd-uuid-1', 'fd-uuid-2'],
      })

      expect(collRepo.addFieldsToSchema).toHaveBeenCalledWith(
        col.id,
        expect.arrayContaining([
          expect.objectContaining({ fieldDefinitionId: 'fd-uuid-1' }),
          expect.objectContaining({ fieldDefinitionId: 'fd-uuid-2' }),
        ]),
      )
    })
  })

  describe('get', () => {
    it('deve retornar coleção com schema para o dono', async () => {
      const col: CollectionWithSchema = { ...createMockCollection(), fieldSchema: [] }
      vi.mocked(collRepo.findById).mockResolvedValue(col)

      const result = await service.get('user-uuid-1', 'col-uuid-1')

      expect(result).toBeDefined()
      expect(collRepo.findById).toHaveBeenCalledWith('col-uuid-1')
    })

    it('deve lançar NOT_FOUND se coleção pertence a outro usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue({
        ...createMockCollection({ userId: 'outro-user' }),
        fieldSchema: [],
      })

      await expect(service.get('user-uuid-1', 'col-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar NOT_FOUND se coleção não existe', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(null)

      await expect(service.get('user-uuid-1', 'col-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('delete', () => {
    it('deve excluir coleção do dono', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue({ ...createMockCollection(), fieldSchema: [] })

      await service.delete('user-uuid-1', 'col-uuid-1')

      expect(collRepo.delete).toHaveBeenCalledWith('col-uuid-1')
    })

    it('deve lançar NOT_FOUND se tentar excluir coleção de outro usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue({
        ...createMockCollection({ userId: 'outro-user' }),
        fieldSchema: [],
      })

      await expect(service.delete('user-uuid-1', 'col-uuid-1'))
        .rejects.toThrow('NOT_FOUND')
    })
  })
})
```

- [ ] **Step 3: Rodar testes para confirmar falha**

```bash
npx vitest run tests/modules/collections/collections.service.test.ts
```

Esperado: FAIL — `CollectionsService` não existe.

- [ ] **Step 4: Implementar service**

`src/modules/collections/collections.service.ts`:
```typescript
import sharp from 'sharp'
import type { ICollectionRepository, Collection, CollectionWithSchema } from '../../shared/contracts/collection.repository.contract.js'
import type { IFieldDefinitionRepository } from '../../shared/contracts/field-definition.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { CreateCollectionInput, UpdateCollectionInput } from './collections.schema.js'

export class CollectionsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'CollectionsError'
  }
}

export class CollectionsService {
  constructor(
    private readonly collectionsRepo: ICollectionRepository,
    private readonly fieldDefRepo: IFieldDefinitionRepository,
    private readonly storageService?: IStorageService,
  ) {}

  async create(userId: string, input: CreateCollectionInput): Promise<CollectionWithSchema> {
    const collection = await this.collectionsRepo.create({
      userId,
      name: input.name,
      description: input.description,
      type: input.type,
      visibility: input.visibility,
    })

    if (input.type !== 'custom') {
      const systemFields = await this.fieldDefRepo.findSystemByCollectionType(input.type)
      if (systemFields.length > 0) {
        await this.collectionsRepo.addFieldsToSchema(
          collection.id,
          systemFields.map((f, i) => ({ fieldDefinitionId: f.id, isRequired: false, displayOrder: i })),
        )
      }
    } else if (input.fieldDefinitionIds?.length) {
      await this.collectionsRepo.addFieldsToSchema(
        collection.id,
        input.fieldDefinitionIds.map((id, i) => ({ fieldDefinitionId: id, isRequired: false, displayOrder: i })),
      )
    }

    return (await this.collectionsRepo.findById(collection.id))!
  }

  async list(userId: string, query?: string): Promise<Collection[]> {
    return this.collectionsRepo.findByUserId(userId, query)
  }

  async get(userId: string, id: string): Promise<CollectionWithSchema> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) {
      throw new CollectionsError('NOT_FOUND')
    }
    return collection
  }

  async update(userId: string, id: string, input: UpdateCollectionInput): Promise<Collection> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) {
      throw new CollectionsError('NOT_FOUND')
    }
    return this.collectionsRepo.update(id, input)
  }

  async delete(userId: string, id: string): Promise<void> {
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) {
      throw new CollectionsError('NOT_FOUND')
    }
    await this.collectionsRepo.delete(id)
  }

  async uploadIcon(userId: string, id: string, buffer: Buffer): Promise<Collection> {
    if (!this.storageService) throw new CollectionsError('STORAGE_NOT_CONFIGURED')
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')
    const webpBuffer = await sharp(buffer).resize(200, 200, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const key = `collections/${id}/icon.webp`
    const iconUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.collectionsRepo.update(id, { iconUrl })
  }

  async uploadCover(userId: string, id: string, buffer: Buffer): Promise<Collection> {
    if (!this.storageService) throw new CollectionsError('STORAGE_NOT_CONFIGURED')
    const collection = await this.collectionsRepo.findById(id)
    if (!collection || collection.userId !== userId) throw new CollectionsError('NOT_FOUND')
    const webpBuffer = await sharp(buffer).resize(1200, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const key = `collections/${id}/cover.webp`
    const coverUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.collectionsRepo.update(id, { coverUrl })
  }

  async getPublicCollections(userId: string): Promise<Collection[]> {
    return this.collectionsRepo.findPublicByUserId(userId)
  }
}
```

- [ ] **Step 5: Rodar testes para confirmar passagem**

```bash
npx vitest run tests/modules/collections/collections.service.test.ts
```

Esperado: todos os testes PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/modules/collections/ src/modules/collections/collections.service.ts src/modules/collections/collections.schema.ts
git commit -m "feat: CollectionsService com TDD — criar, listar, editar, excluir e upload"
```

---

## Task 8: Collections Routes + Controller + DI

**Files:**
- Create: `src/modules/collections/collections.controller.ts`
- Create: `src/modules/collections/collections.routes.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Criar controller**

`src/modules/collections/collections.controller.ts`:
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CollectionsService } from './collections.service.js'
import { CollectionsError } from './collections.service.js'
import type { CreateCollectionInput, UpdateCollectionInput } from './collections.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof CollectionsError && error.code === 'NOT_FOUND') {
      return reply.status(404).send({ error: 'Coleção não encontrada' })
    }
    throw error
  }

  async list(request: FastifyRequest<{ Querystring: { q?: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const collections = await this.service.list(userId, request.query.q)
    return reply.send(collections)
  }

  async create(request: FastifyRequest<{ Body: CreateCollectionInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const collection = await this.service.create(userId, request.body)
    return reply.status(201).send(collection)
  }

  async get(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const collection = await this.service.get(userId, request.params.id)
      return reply.send(collection)
    } catch (error) { return this.handleError(error, reply) }
  }

  async update(request: FastifyRequest<{ Params: { id: string }; Body: UpdateCollectionInput }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const collection = await this.service.update(userId, request.params.id, request.body)
      return reply.send(collection)
    } catch (error) { return this.handleError(error, reply) }
  }

  async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.delete(userId, request.params.id)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async uploadIcon(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })
    try {
      const buffer = await data.toBuffer()
      const result = await this.service.uploadIcon(userId, request.params.id, buffer)
      return reply.send({ iconUrl: result.iconUrl })
    } catch (error) { return this.handleError(error, reply) }
  }

  async uploadCover(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })
    try {
      const buffer = await data.toBuffer()
      const result = await this.service.uploadCover(userId, request.params.id, buffer)
      return reply.send({ coverUrl: result.coverUrl })
    } catch (error) { return this.handleError(error, reply) }
  }

  async listPublic(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
    const collections = await this.service.getPublicCollections(request.params.userId)
    return reply.send(collections)
  }
}
```

- [ ] **Step 2: Criar routes**

`src/modules/collections/collections.routes.ts`:
```typescript
import type { FastifyInstance } from 'fastify'
import type { CollectionsService } from './collections.service.js'
import { CollectionsController } from './collections.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'

export async function collectionsRoutes(
  app: FastifyInstance,
  options: { collectionsService: CollectionsService },
) {
  const controller = new CollectionsController(options.collectionsService)

  app.get('/', { preHandler: [authenticate], handler: controller.list.bind(controller) })
  app.post('/', { preHandler: [authenticate], handler: controller.create.bind(controller) })
  app.get('/:id', { preHandler: [authenticate], handler: controller.get.bind(controller) })
  app.put('/:id', { preHandler: [authenticate], handler: controller.update.bind(controller) })
  app.delete('/:id', { preHandler: [authenticate], handler: controller.delete.bind(controller) })
  app.post('/:id/icon', { preHandler: [authenticate], handler: controller.uploadIcon.bind(controller) })
  app.post('/:id/cover', { preHandler: [authenticate], handler: controller.uploadCover.bind(controller) })
}

export async function collectionsPublicRoutes(
  app: FastifyInstance,
  options: { collectionsService: CollectionsService },
) {
  const controller = new CollectionsController(options.collectionsService)
  app.get('/:userId/collections', { handler: controller.listPublic.bind(controller) })
}
```

- [ ] **Step 3: Registrar em `src/app.ts`**

Adicionar imports:
```typescript
import { CollectionsRepository } from './modules/collections/collections.repository.js'
import { CollectionsService } from './modules/collections/collections.service.js'
import { collectionsRoutes, collectionsPublicRoutes } from './modules/collections/collections.routes.js'
```

Adicionar instanciação (após `fieldDefinitionRepository`):
```typescript
const collectionsRepository = new CollectionsRepository(db)
const collectionsService = new CollectionsService(collectionsRepository, fieldDefinitionRepository, storageService)
```

Adicionar registro de rotas:
```typescript
await app.register(collectionsRoutes, { prefix: '/collections', collectionsService })
await app.register(collectionsPublicRoutes, { prefix: '/users', collectionsService })
```

- [ ] **Step 4: Verificar build**

```bash
npx tsc --noEmit
```

Esperado: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/collections/ src/app.ts
git commit -m "feat: rotas e controller de collections com upload de ícone e capa"
```

---

## Task 9: Contrato e Repositório de Items

**Files:**
- Create: `src/shared/contracts/item.repository.contract.ts`
- Create: `src/modules/items/items.repository.ts`

- [ ] **Step 1: Criar contrato**

`src/shared/contracts/item.repository.contract.ts`:
```typescript
export type Item = {
  id: string
  collectionId: string
  name: string
  coverUrl: string | null
  fields: Record<string, unknown>
  rating: number | null
  comment: string | null
  createdAt: Date
  updatedAt: Date
}

export type CreateItemData = {
  collectionId: string
  name: string
  fields?: Record<string, unknown>
  rating?: number
  comment?: string
}

export type UpdateItemData = {
  name?: string
  fields?: Record<string, unknown>
  rating?: number | null
  comment?: string | null
  coverUrl?: string | null
}

export interface IItemRepository {
  create(data: CreateItemData): Promise<Item>
  findById(id: string): Promise<Item | null>
  findByCollectionId(collectionId: string, query?: string): Promise<Item[]>
  update(id: string, data: UpdateItemData): Promise<Item>
  delete(id: string): Promise<void>
}
```

- [ ] **Step 2: Implementar repositório**

`src/modules/items/items.repository.ts`:
```typescript
import { eq, and, or, ilike, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { items } from '../../shared/infra/database/schema.js'
import type { IItemRepository, Item, CreateItemData, UpdateItemData } from '../../shared/contracts/item.repository.contract.js'

export class ItemsRepository implements IItemRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(data: CreateItemData): Promise<Item> {
    const result = await this.db.insert(items).values({
      collectionId: data.collectionId,
      name: data.name,
      fields: data.fields ?? {},
      rating: data.rating,
      comment: data.comment,
    }).returning()
    return result[0] as Item
  }

  async findById(id: string): Promise<Item | null> {
    const result = await this.db.select().from(items).where(eq(items.id, id)).limit(1)
    return (result[0] as Item) ?? null
  }

  async findByCollectionId(collectionId: string, query?: string): Promise<Item[]> {
    const condition = query
      ? and(
          eq(items.collectionId, collectionId),
          or(
            ilike(items.name, `%${query}%`),
            sql`${items.fields}::text ILIKE ${`%${query}%`}`,
          ),
        )
      : eq(items.collectionId, collectionId)
    return this.db.select().from(items).where(condition) as Promise<Item[]>
  }

  async update(id: string, data: UpdateItemData): Promise<Item> {
    const result = await this.db.update(items)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning()
    return result[0] as Item
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(items).where(eq(items.id, id))
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/contracts/item.repository.contract.ts src/modules/items/items.repository.ts
git commit -m "feat: contrato e repositório de items"
```

---

## Task 10: Items Service (TDD)

**Files:**
- Create: `tests/modules/items/items.service.test.ts`
- Create: `src/modules/items/items.service.ts`
- Create: `src/modules/items/items.schema.ts`

- [ ] **Step 1: Criar schema Zod**

`src/modules/items/items.schema.ts`:
```typescript
import { z } from 'zod'

export const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  fields: z.record(z.unknown()).default({}),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
})

export const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  fields: z.record(z.unknown()).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
})

export type CreateItemInput = z.infer<typeof createItemSchema>
export type UpdateItemInput = z.infer<typeof updateItemSchema>
```

- [ ] **Step 2: Escrever testes (falham)**

`tests/modules/items/items.service.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ItemsService } from '../../../src/modules/items/items.service.js'
import type { IItemRepository, Item } from '../../../src/shared/contracts/item.repository.contract.js'
import type { ICollectionRepository, CollectionWithSchema, CollectionSchemaEntry } from '../../../src/shared/contracts/collection.repository.contract.js'
import type { FieldDefinition } from '../../../src/shared/contracts/field-definition.repository.contract.js'

function createMockItemRepository(): IItemRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByCollectionId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}

function createMockCollectionRepository(): ICollectionRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findPublicByUserId: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addFieldsToSchema: vi.fn(),
    getFieldSchema: vi.fn(),
  }
}

function createMockFieldDef(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: 'fd-1',
    userId: null,
    name: 'Plataforma',
    fieldKey: 'platform',
    fieldType: 'select',
    collectionType: 'games',
    selectOptions: ['PS2', 'PC'],
    isSystem: true,
    createdAt: new Date(),
    ...overrides,
  }
}

function createMockSchemaEntry(overrides: Partial<CollectionSchemaEntry> = {}): CollectionSchemaEntry {
  return {
    id: 'cfs-1',
    fieldDefinition: createMockFieldDef(),
    isRequired: false,
    displayOrder: 0,
    ...overrides,
  }
}

function createMockCollection(userId = 'user-1', schema: CollectionSchemaEntry[] = []): CollectionWithSchema {
  return {
    id: 'col-1',
    userId,
    name: 'Games',
    description: null,
    iconUrl: null,
    coverUrl: null,
    type: 'games',
    visibility: 'public',
    createdAt: new Date(),
    updatedAt: new Date(),
    fieldSchema: schema,
  }
}

function createMockItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    collectionId: 'col-1',
    name: 'God of War',
    coverUrl: null,
    fields: {},
    rating: null,
    comment: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('ItemsService', () => {
  let itemRepo: ReturnType<typeof createMockItemRepository>
  let collRepo: ReturnType<typeof createMockCollectionRepository>
  let service: ItemsService

  beforeEach(() => {
    itemRepo = createMockItemRepository()
    collRepo = createMockCollectionRepository()
    service = new ItemsService(itemRepo, collRepo)
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('deve criar item com campos válidos', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(
        createMockCollection('user-1', [createMockSchemaEntry()]),
      )
      vi.mocked(itemRepo.create).mockResolvedValue(createMockItem({ fields: { platform: 'PS2' } }))

      const result = await service.create('user-1', 'col-1', {
        name: 'God of War',
        fields: { platform: 'PS2' },
      })

      expect(result.name).toBe('God of War')
      expect(itemRepo.create).toHaveBeenCalled()
    })

    it('deve lançar NOT_FOUND se coleção pertence a outro usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('outro-user'))

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: {} }))
        .rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar REQUIRED_FIELD_MISSING se campo obrigatório ausente', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(
        createMockCollection('user-1', [createMockSchemaEntry({ isRequired: true })]),
      )

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: {} }))
        .rejects.toThrow('REQUIRED_FIELD_MISSING')
    })

    it('deve lançar INVALID_FIELD_TYPE para número em campo de texto', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(
        createMockCollection('user-1', [
          createMockSchemaEntry({ fieldDefinition: createMockFieldDef({ fieldType: 'number', fieldKey: 'year' }) }),
        ]),
      )

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: { year: 'não é número' } }))
        .rejects.toThrow('INVALID_FIELD_TYPE')
    })

    it('deve lançar INVALID_FIELD_VALUE para valor fora do select', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(
        createMockCollection('user-1', [createMockSchemaEntry()]), // platform: select ['PS2', 'PC']
      )

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: { platform: 'Atari' } }))
        .rejects.toThrow('INVALID_FIELD_VALUE')
    })

    it('deve validar rating entre 1 e 5', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('user-1'))

      await expect(service.create('user-1', 'col-1', { name: 'Item', fields: {}, rating: 6 }))
        .rejects.toThrow('INVALID_RATING')
    })
  })

  describe('get', () => {
    it('deve retornar item se pertence à coleção do usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('user-1'))
      vi.mocked(itemRepo.findById).mockResolvedValue(createMockItem())

      const result = await service.get('user-1', 'col-1', 'item-1')

      expect(result).toBeDefined()
    })

    it('deve lançar NOT_FOUND se item é de outra coleção', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('user-1'))
      vi.mocked(itemRepo.findById).mockResolvedValue(createMockItem({ collectionId: 'outra-col' }))

      await expect(service.get('user-1', 'col-1', 'item-1'))
        .rejects.toThrow('NOT_FOUND')
    })
  })

  describe('delete', () => {
    it('deve excluir item da coleção do usuário', async () => {
      vi.mocked(collRepo.findById).mockResolvedValue(createMockCollection('user-1'))
      vi.mocked(itemRepo.findById).mockResolvedValue(createMockItem())

      await service.delete('user-1', 'col-1', 'item-1')

      expect(itemRepo.delete).toHaveBeenCalledWith('item-1')
    })
  })
})
```

- [ ] **Step 3: Rodar testes para confirmar falha**

```bash
npx vitest run tests/modules/items/items.service.test.ts
```

Esperado: FAIL — `ItemsService` não existe.

- [ ] **Step 4: Implementar service**

`src/modules/items/items.service.ts`:
```typescript
import sharp from 'sharp'
import type { IItemRepository, Item } from '../../shared/contracts/item.repository.contract.js'
import type { ICollectionRepository, CollectionSchemaEntry } from '../../shared/contracts/collection.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import type { CreateItemInput, UpdateItemInput } from './items.schema.js'

export class ItemsError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'ItemsError'
  }
}

export class ItemsService {
  constructor(
    private readonly itemRepo: IItemRepository,
    private readonly collectionRepo: ICollectionRepository,
    private readonly storageService?: IStorageService,
  ) {}

  private validateFields(fields: Record<string, unknown>, schema: CollectionSchemaEntry[]): void {
    for (const entry of schema) {
      const { fieldDefinition, isRequired } = entry
      const value = fields[fieldDefinition.fieldKey]

      if (isRequired && (value === undefined || value === null)) {
        throw new ItemsError('REQUIRED_FIELD_MISSING')
      }

      if (value === undefined || value === null) continue

      switch (fieldDefinition.fieldType) {
        case 'number':
          if (typeof value !== 'number') throw new ItemsError('INVALID_FIELD_TYPE')
          break
        case 'date':
          if (typeof value !== 'string' || isNaN(Date.parse(value as string))) throw new ItemsError('INVALID_FIELD_TYPE')
          break
        case 'boolean':
          if (typeof value !== 'boolean') throw new ItemsError('INVALID_FIELD_TYPE')
          break
        case 'select':
          if (!fieldDefinition.selectOptions?.includes(value as string)) throw new ItemsError('INVALID_FIELD_VALUE')
          break
        case 'text':
          if (typeof value !== 'string') throw new ItemsError('INVALID_FIELD_TYPE')
          break
      }
    }
  }

  private async assertCollectionOwnership(userId: string, collectionId: string) {
    const collection = await this.collectionRepo.findById(collectionId)
    if (!collection || collection.userId !== userId) throw new ItemsError('NOT_FOUND')
    return collection
  }

  async create(userId: string, collectionId: string, input: CreateItemInput): Promise<Item> {
    const collection = await this.assertCollectionOwnership(userId, collectionId)

    if (input.rating !== undefined && (input.rating < 1 || input.rating > 5)) {
      throw new ItemsError('INVALID_RATING')
    }

    this.validateFields(input.fields ?? {}, collection.fieldSchema)

    return this.itemRepo.create({
      collectionId,
      name: input.name,
      fields: input.fields ?? {},
      rating: input.rating,
      comment: input.comment,
    })
  }

  async list(userId: string, collectionId: string, query?: string): Promise<Item[]> {
    await this.assertCollectionOwnership(userId, collectionId)
    return this.itemRepo.findByCollectionId(collectionId, query)
  }

  async get(userId: string, collectionId: string, itemId: string): Promise<Item> {
    await this.assertCollectionOwnership(userId, collectionId)
    const item = await this.itemRepo.findById(itemId)
    if (!item || item.collectionId !== collectionId) throw new ItemsError('NOT_FOUND')
    return item
  }

  async update(userId: string, collectionId: string, itemId: string, input: UpdateItemInput): Promise<Item> {
    const collection = await this.assertCollectionOwnership(userId, collectionId)
    const item = await this.itemRepo.findById(itemId)
    if (!item || item.collectionId !== collectionId) throw new ItemsError('NOT_FOUND')

    if (input.rating !== undefined && input.rating !== null && (input.rating < 1 || input.rating > 5)) {
      throw new ItemsError('INVALID_RATING')
    }

    if (input.fields !== undefined) {
      this.validateFields(input.fields, collection.fieldSchema)
    }

    return this.itemRepo.update(itemId, input)
  }

  async delete(userId: string, collectionId: string, itemId: string): Promise<void> {
    await this.assertCollectionOwnership(userId, collectionId)
    const item = await this.itemRepo.findById(itemId)
    if (!item || item.collectionId !== collectionId) throw new ItemsError('NOT_FOUND')
    await this.itemRepo.delete(itemId)
  }

  async uploadCover(userId: string, collectionId: string, itemId: string, buffer: Buffer): Promise<Item> {
    if (!this.storageService) throw new ItemsError('STORAGE_NOT_CONFIGURED')
    await this.assertCollectionOwnership(userId, collectionId)
    const item = await this.itemRepo.findById(itemId)
    if (!item || item.collectionId !== collectionId) throw new ItemsError('NOT_FOUND')
    const webpBuffer = await sharp(buffer).resize(400, 600, { fit: 'cover' }).webp({ quality: 85 }).toBuffer()
    const key = `items/${itemId}/cover.webp`
    const coverUrl = await this.storageService.upload(key, webpBuffer, 'image/webp')
    return this.itemRepo.update(itemId, { coverUrl })
  }

  async listPublicItems(collectionId: string, userId: string): Promise<Item[]> {
    const collection = await this.collectionRepo.findById(collectionId)
    if (!collection || collection.userId !== userId || collection.visibility !== 'public') {
      throw new ItemsError('NOT_FOUND')
    }
    return this.itemRepo.findByCollectionId(collectionId)
  }
}
```

- [ ] **Step 5: Rodar testes para confirmar passagem**

```bash
npx vitest run tests/modules/items/items.service.test.ts
```

Esperado: todos os testes PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/modules/items/ src/modules/items/items.service.ts src/modules/items/items.schema.ts
git commit -m "feat: ItemsService com TDD — CRUD, validação de campos e upload de capa"
```

---

## Task 11: Items Routes + Controller + DI

**Files:**
- Create: `src/modules/items/items.controller.ts`
- Create: `src/modules/items/items.routes.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Criar controller**

`src/modules/items/items.controller.ts`:
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ItemsService } from './items.service.js'
import { ItemsError } from './items.service.js'
import type { CreateItemInput, UpdateItemInput } from './items.schema.js'
import type { AccessTokenClaims } from '../auth/auth.service.js'

export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  private handleError(error: unknown, reply: FastifyReply) {
    if (error instanceof ItemsError) {
      if (error.code === 'NOT_FOUND') return reply.status(404).send({ error: 'Item não encontrado' })
      if (error.code === 'REQUIRED_FIELD_MISSING') return reply.status(422).send({ error: 'Campo obrigatório ausente' })
      if (error.code === 'INVALID_FIELD_TYPE') return reply.status(422).send({ error: 'Tipo de campo inválido' })
      if (error.code === 'INVALID_FIELD_VALUE') return reply.status(422).send({ error: 'Valor inválido para campo select' })
      if (error.code === 'INVALID_RATING') return reply.status(422).send({ error: 'Rating deve ser entre 1 e 5' })
    }
    throw error
  }

  async list(
    request: FastifyRequest<{ Params: { collectionId: string }; Querystring: { q?: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const items = await this.service.list(userId, request.params.collectionId, request.query.q)
      return reply.send(items)
    } catch (error) { return this.handleError(error, reply) }
  }

  async create(
    request: FastifyRequest<{ Params: { collectionId: string }; Body: CreateItemInput }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const item = await this.service.create(userId, request.params.collectionId, request.body)
      return reply.status(201).send(item)
    } catch (error) { return this.handleError(error, reply) }
  }

  async get(
    request: FastifyRequest<{ Params: { collectionId: string; itemId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const item = await this.service.get(userId, request.params.collectionId, request.params.itemId)
      return reply.send(item)
    } catch (error) { return this.handleError(error, reply) }
  }

  async update(
    request: FastifyRequest<{ Params: { collectionId: string; itemId: string }; Body: UpdateItemInput }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      const item = await this.service.update(userId, request.params.collectionId, request.params.itemId, request.body)
      return reply.send(item)
    } catch (error) { return this.handleError(error, reply) }
  }

  async delete(
    request: FastifyRequest<{ Params: { collectionId: string; itemId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    try {
      await this.service.delete(userId, request.params.collectionId, request.params.itemId)
      return reply.status(204).send()
    } catch (error) { return this.handleError(error, reply) }
  }

  async uploadCover(
    request: FastifyRequest<{ Params: { collectionId: string; itemId: string } }>,
    reply: FastifyReply,
  ) {
    const { userId } = request.user as AccessTokenClaims
    const data = await request.file()
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' })
    try {
      const buffer = await data.toBuffer()
      const result = await this.service.uploadCover(userId, request.params.collectionId, request.params.itemId, buffer)
      return reply.send({ coverUrl: result.coverUrl })
    } catch (error) { return this.handleError(error, reply) }
  }

  async listPublic(
    request: FastifyRequest<{ Params: { userId: string; collectionId: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const items = await this.service.listPublicItems(request.params.collectionId, request.params.userId)
      return reply.send(items)
    } catch (error) { return this.handleError(error, reply) }
  }
}
```

- [ ] **Step 2: Criar routes**

`src/modules/items/items.routes.ts`:
```typescript
import type { FastifyInstance } from 'fastify'
import type { ItemsService } from './items.service.js'
import { ItemsController } from './items.controller.js'
import { authenticate } from '../../shared/middleware/authenticate.js'

export async function itemsRoutes(
  app: FastifyInstance,
  options: { itemsService: ItemsService },
) {
  const controller = new ItemsController(options.itemsService)

  app.get('/:collectionId/items', { preHandler: [authenticate], handler: controller.list.bind(controller) })
  app.post('/:collectionId/items', { preHandler: [authenticate], handler: controller.create.bind(controller) })
  app.get('/:collectionId/items/:itemId', { preHandler: [authenticate], handler: controller.get.bind(controller) })
  app.put('/:collectionId/items/:itemId', { preHandler: [authenticate], handler: controller.update.bind(controller) })
  app.delete('/:collectionId/items/:itemId', { preHandler: [authenticate], handler: controller.delete.bind(controller) })
  app.post('/:collectionId/items/:itemId/cover', { preHandler: [authenticate], handler: controller.uploadCover.bind(controller) })
}

export async function itemsPublicRoutes(
  app: FastifyInstance,
  options: { itemsService: ItemsService },
) {
  const controller = new ItemsController(options.itemsService)
  app.get('/:userId/collections/:collectionId/items', { handler: controller.listPublic.bind(controller) })
}
```

- [ ] **Step 3: Registrar em `src/app.ts`**

Adicionar imports:
```typescript
import { ItemsRepository } from './modules/items/items.repository.js'
import { ItemsService } from './modules/items/items.service.js'
import { itemsRoutes, itemsPublicRoutes } from './modules/items/items.routes.js'
```

Adicionar instanciação (após `collectionsService`):
```typescript
const itemsRepository = new ItemsRepository(db)
const itemsService = new ItemsService(itemsRepository, collectionsRepository, storageService)
```

Adicionar registro de rotas (adicionar ao `collectionsPublicRoutes` já registrado — na verdade, registrar a rota pública de items separadamente em `/users`):
```typescript
await app.register(itemsRoutes, { prefix: '/collections', itemsService })
await app.register(itemsPublicRoutes, { prefix: '/users', itemsService })
```

- [ ] **Step 4: Verificar build e rodar todos os testes**

```bash
npx tsc --noEmit
npx vitest run
```

Esperado: build OK, 21+ testes passando (mantém os existentes + novos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/items/ src/app.ts
git commit -m "feat: rotas e controller de items com upload de capa"
```

---

## Task 12: Integration Test

**Files:**
- Create: `tests/integration/collections-items.integration.test.ts`

- [ ] **Step 1: Escrever teste de integração**

`tests/integration/collections-items.integration.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

describe('Collections + Items Integration', () => {
  let app: FastifyInstance
  let authHeader: string
  let userId: string

  beforeAll(async () => {
    app = await buildApp()

    // Registrar usuário — accessToken é retornado no body da resposta
    const email = `integ-colecoes-${Date.now()}@test.com`
    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        password: 'Senha123!',
        displayName: 'Integration User',
      },
    })
    expect(regRes.statusCode).toBe(201)
    const regBody = JSON.parse(regRes.body)
    userId = regBody.user.id
    authHeader = `Bearer ${regBody.accessToken}`
  })

  afterAll(async () => {
    await app.close()
  })

  it('deve criar coleção de jogos e popular schema automaticamente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: { authorization: authHeader },
      payload: { name: 'Meus PS2', type: 'games', visibility: 'public' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.type).toBe('games')
    expect(body.fieldSchema.length).toBeGreaterThan(0)
    expect(body.fieldSchema.some((f: { fieldDefinition: { fieldKey: string } }) => f.fieldDefinition.fieldKey === 'platform')).toBe(true)
  })

  it('deve criar item na coleção e buscar por nome', async () => {
    const colRes = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: { authorization: authHeader },
      payload: { name: 'RPGs', type: 'games', visibility: 'public' },
    })
    const collection = JSON.parse(colRes.body)

    const itemRes = await app.inject({
      method: 'POST',
      url: `/collections/${collection.id}/items`,
      headers: { authorization: authHeader },
      payload: { name: 'Final Fantasy VII', fields: { platform: 'PS2' } },
    })
    expect(itemRes.statusCode).toBe(201)
    expect(JSON.parse(itemRes.body).name).toBe('Final Fantasy VII')

    const searchRes = await app.inject({
      method: 'GET',
      url: `/collections/${collection.id}/items?q=Final`,
      headers: { authorization: authHeader },
    })
    expect(searchRes.statusCode).toBe(200)
    const items = JSON.parse(searchRes.body)
    expect(items.some((i: { name: string }) => i.name === 'Final Fantasy VII')).toBe(true)
  })

  it('deve recusar item com valor inválido em campo select', async () => {
    const colRes = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: { authorization: authHeader },
      payload: { name: 'Teste Validação', type: 'games' },
    })
    const collection = JSON.parse(colRes.body)

    const res = await app.inject({
      method: 'POST',
      url: `/collections/${collection.id}/items`,
      headers: { authorization: authHeader },
      payload: { name: 'Jogo Inválido', fields: { platform: 'Atari 2600' } },
    })
    expect(res.statusCode).toBe(422)
  })

  it('deve excluir coleção e remover itens em cascade', async () => {
    const colRes = await app.inject({
      method: 'POST',
      url: '/collections',
      headers: { authorization: authHeader },
      payload: { name: 'Para Deletar', type: 'books' },
    })
    const collection = JSON.parse(colRes.body)

    await app.inject({
      method: 'POST',
      url: `/collections/${collection.id}/items`,
      headers: { authorization: authHeader },
      payload: { name: 'Livro X', fields: {} },
    })

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/collections/${collection.id}`,
      headers: { authorization: authHeader },
    })
    expect(delRes.statusCode).toBe(204)

    const getRes = await app.inject({
      method: 'GET',
      url: `/collections/${collection.id}`,
      headers: { authorization: authHeader },
    })
    expect(getRes.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Rodar teste de integração**

```bash
npx vitest run tests/integration/collections-items.integration.test.ts
```

Esperado: todos os casos PASS (requer banco PostgreSQL rodando via `local-env-dev`).

- [ ] **Step 3: Rodar suite completa**

```bash
npx vitest run
```

Esperado: todos os testes PASS.

- [ ] **Step 4: Commit final**

```bash
git add tests/integration/
git commit -m "test: integration test do fluxo completo de coleções e itens"
```

---

## Verificação Final

- [ ] `npx tsc --noEmit` — 0 erros de TypeScript
- [ ] `npx vitest run` — todos os testes passando
- [ ] `npx drizzle-kit studio` ou verificar migration — schema correto no banco
- [ ] Build Docker sem erros: `docker compose build api`
