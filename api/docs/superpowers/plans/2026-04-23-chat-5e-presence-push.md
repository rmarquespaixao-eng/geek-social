# Chat — Fase E: Presence e Push (TDD + Infra)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar rastreamento de presença online em memória + persistência de last_seen_at, e a infraestrutura de Web Push para notificações offline.

**Architecture:** PresenceService usa Map<userId, Set<socketId>> em memória; repositório só persiste last_seen_at. PushService envolve a lib web-push — sem testes unitários (deps externas não mockáveis de forma útil).

**Tech Stack:** TypeScript, Vitest, web-push (VAPID)

**Pré-requisito:** Fases A, B, C e D completas.

---

### Task 1: PresenceService (TDD)

**Files:**
- Create: `tests/modules/chat/presence.service.test.ts`
- Create: `src/modules/chat/presence.service.ts`
- Create: `src/modules/chat/presence.repository.ts`

- [ ] **Escrever o teste antes da implementação**

Criar `tests/modules/chat/presence.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PresenceService } from '../../../src/modules/chat/presence.service.js'
import type { IPresenceRepository } from '../../../src/shared/contracts/presence.repository.contract.js'

function createMockPresenceRepository(): IPresenceRepository {
  return {
    upsertLastSeen: vi.fn().mockResolvedValue(undefined),
    findByUserId: vi.fn(),
  }
}

describe('PresenceService', () => {
  let repo: ReturnType<typeof createMockPresenceRepository>
  let service: PresenceService

  beforeEach(() => {
    repo = createMockPresenceRepository()
    service = new PresenceService(repo)
    vi.clearAllMocks()
  })

  describe('userConnected', () => {
    it('deve marcar usuário como online ao conectar primeiro socket', () => {
      service.userConnected('user-1', 'socket-a')

      expect(service.isOnline('user-1')).toBe(true)
    })

    it('deve manter online com múltiplos sockets conectados', () => {
      service.userConnected('user-1', 'socket-a')
      service.userConnected('user-1', 'socket-b')

      expect(service.isOnline('user-1')).toBe(true)
    })
  })

  describe('userDisconnected', () => {
    it('deve retornar false e manter online quando ainda há outro socket', () => {
      service.userConnected('user-1', 'socket-a')
      service.userConnected('user-1', 'socket-b')

      const isNowOffline = service.userDisconnected('user-1', 'socket-a')

      expect(isNowOffline).toBe(false)
      expect(service.isOnline('user-1')).toBe(true)
    })

    it('deve retornar true e marcar offline quando último socket desconecta', () => {
      service.userConnected('user-1', 'socket-a')

      const isNowOffline = service.userDisconnected('user-1', 'socket-a')

      expect(isNowOffline).toBe(true)
      expect(service.isOnline('user-1')).toBe(false)
    })

    it('deve retornar false se userId desconhecido', () => {
      const isNowOffline = service.userDisconnected('user-desconhecido', 'socket-x')

      expect(isNowOffline).toBe(false)
    })
  })

  describe('persistLastSeen', () => {
    it('deve chamar upsertLastSeen no repositório e retornar data', async () => {
      const result = await service.persistLastSeen('user-1')

      expect(repo.upsertLastSeen).toHaveBeenCalledWith('user-1', expect.any(Date))
      expect(result).toBeInstanceOf(Date)
    })
  })

  describe('isOnline', () => {
    it('deve retornar false para usuário que nunca conectou', () => {
      expect(service.isOnline('user-nunca')).toBe(false)
    })
  })
})
```

- [ ] **Rodar testes para verificar que falham**

```bash
npx vitest run tests/modules/chat/presence.service.test.ts
```

Expected: FAIL com "Cannot find module".

- [ ] **Implementar presence.service.ts**

Criar `src/modules/chat/presence.service.ts`:

```typescript
import type { IPresenceRepository } from '../../shared/contracts/presence.repository.contract.js'

export class PresenceService {
  private online: Map<string, Set<string>> = new Map()

  constructor(private readonly repo: IPresenceRepository) {}

  userConnected(userId: string, socketId: string): void {
    if (!this.online.has(userId)) {
      this.online.set(userId, new Set())
    }
    this.online.get(userId)!.add(socketId)
  }

  userDisconnected(userId: string, socketId: string): boolean {
    const sockets = this.online.get(userId)
    if (!sockets) return false
    sockets.delete(socketId)
    if (sockets.size === 0) {
      this.online.delete(userId)
      return true
    }
    return false
  }

  isOnline(userId: string): boolean {
    const sockets = this.online.get(userId)
    return sockets !== undefined && sockets.size > 0
  }

  async persistLastSeen(userId: string): Promise<Date> {
    const now = new Date()
    await this.repo.upsertLastSeen(userId, now)
    return now
  }

  async getLastSeen(userId: string): Promise<Date | null> {
    const record = await this.repo.findByUserId(userId)
    return record?.lastSeenAt ?? null
  }
}
```

- [ ] **Rodar testes para verificar que passam**

```bash
npx vitest run tests/modules/chat/presence.service.test.ts
```

Expected: todos os testes PASS.

- [ ] **Implementar presence.repository.ts**

Criar `src/modules/chat/presence.repository.ts`:

```typescript
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { userPresence } from '../../shared/infra/database/schema.js'
import type { IPresenceRepository, UserPresence } from '../../shared/contracts/presence.repository.contract.js'

export class PresenceRepository implements IPresenceRepository {
  constructor(private readonly db: DatabaseClient) {}

  async upsertLastSeen(userId: string, lastSeenAt: Date): Promise<void> {
    await this.db.insert(userPresence)
      .values({ userId, lastSeenAt, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userPresence.userId,
        set: { lastSeenAt, updatedAt: new Date() },
      })
  }

  async findByUserId(userId: string): Promise<UserPresence | null> {
    const [row] = await this.db.select().from(userPresence).where(eq(userPresence.userId, userId)).limit(1)
    return row ? { userId: row.userId, lastSeenAt: row.lastSeenAt, updatedAt: row.updatedAt } : null
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
git add src/modules/chat/presence.service.ts \
        src/modules/chat/presence.repository.ts \
        tests/modules/chat/presence.service.test.ts
git commit -m "feat: PresenceService + PresenceRepository com TDD — rastreamento de presença online"
```

---

### Task 2: PushService + PushRepository (sem testes unitários)

**Files:**
- Create: `src/modules/chat/push.repository.ts`
- Create: `src/modules/chat/push.service.ts`

- [ ] **Implementar push.repository.ts**

Criar `src/modules/chat/push.repository.ts`:

```typescript
import { eq } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { pushSubscriptions } from '../../shared/infra/database/schema.js'
import type { IPushRepository, PushSubscription } from '../../shared/contracts/push.repository.contract.js'

export class PushRepository implements IPushRepository {
  constructor(private readonly db: DatabaseClient) {}

  async create(userId: string, data: { endpoint: string; p256dh: string; auth: string }): Promise<PushSubscription> {
    const [row] = await this.db.insert(pushSubscriptions)
      .values({ userId, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: data.p256dh, auth: data.auth },
      })
      .returning()
    return this.map(row)
  }

  async findByUserId(userId: string): Promise<PushSubscription[]> {
    const rows = await this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    return rows.map(r => this.map(r))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))
  }

  private map(row: typeof pushSubscriptions.$inferSelect): PushSubscription {
    return {
      id: row.id,
      userId: row.userId,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      createdAt: row.createdAt,
    }
  }
}
```

- [ ] **Implementar push.service.ts**

Criar `src/modules/chat/push.service.ts`:

```typescript
import webpush from 'web-push'
import type { IPushRepository } from '../../shared/contracts/push.repository.contract.js'

export type PushPayload = {
  title: string
  body: string
  conversationId: string
}

export class PushService {
  constructor(private readonly repo: IPushRepository) {}

  static configure(publicKey: string, privateKey: string, contact: string): void {
    webpush.setVapidDetails(`mailto:${contact}`, publicKey, privateKey)
  }

  async registerSubscription(userId: string, data: { endpoint: string; p256dh: string; auth: string }) {
    return this.repo.create(userId, data)
  }

  async removeSubscription(subscriptionId: string): Promise<void> {
    return this.repo.delete(subscriptionId)
  }

  async notify(userId: string, payload: PushPayload): Promise<void> {
    const subscriptions = await this.repo.findByUserId(userId)
    const body = JSON.stringify(payload)
    await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body)
      )
    )
  }
}
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Rodar todos os testes do chat para garantir regressão zero**

```bash
npx vitest run tests/modules/chat/
```

Expected: todos os testes PASS.

- [ ] **Commit**

```bash
git add src/modules/chat/push.repository.ts \
        src/modules/chat/push.service.ts
git commit -m "feat: PushService + PushRepository — infraestrutura de Web Push com VAPID"
```
