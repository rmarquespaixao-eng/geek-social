# Chat — Fase D: Messages (TDD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar envio de mensagens, upload de anexos, soft delete e histórico paginado por cursor.

**Architecture:** MessagesService recebe IMessagesRepository + IConversationsRepository + IStorageService. Imagens processadas com Sharp (webp 1200×1200). Anexos criados sem messageId (pending) e vinculados ao criar a mensagem. Cursor = base64(JSON({createdAt, id})).

**Tech Stack:** TypeScript, Vitest, Sharp, S3

**Pré-requisito:** Fases A, B e C completas.

---

### Task 1: MessagesService (TDD)

**Files:**
- Create: `tests/modules/chat/messages.service.test.ts`
- Create: `src/modules/chat/messages.service.ts`

- [ ] **Escrever o teste antes da implementação**

Criar `tests/modules/chat/messages.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-webp')),
  })),
}))

import { MessagesService } from '../../../src/modules/chat/messages.service.js'
import type { IMessagesRepository, Message, MessageAttachment, MessageWithAttachments } from '../../../src/shared/contracts/messages.repository.contract.js'
import type { IConversationsRepository, ConversationMember } from '../../../src/shared/contracts/conversations.repository.contract.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'

function createMockMessagesRepository(): IMessagesRepository {
  return {
    createMessage: vi.fn(),
    findMessageById: vi.fn(),
    softDeleteMessage: vi.fn(),
    createAttachment: vi.fn(),
    linkAttachments: vi.fn(),
    findAttachmentsByUploader: vi.fn(),
    findMessagesByConversation: vi.fn(),
  }
}

function createMockConversationsRepository(): IConversationsRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMember: vi.fn(),
    findMember: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
    findMembers: vi.fn(),
    findMembersByUserId: vi.fn(),
    findExistingDm: vi.fn(),
    findUserConversations: vi.fn(),
    updateLastReadAt: vi.fn(),
  }
}

function createMockStorageService(): IStorageService {
  return {
    upload: vi.fn().mockResolvedValue('https://s3.amazonaws.com/bucket/file.webp'),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

function makeMember(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    id: 'mem-1',
    conversationId: 'conv-1',
    userId: 'user-1',
    role: 'member',
    permissions: { can_send_messages: true, can_send_files: true },
    joinedAt: new Date('2026-01-01'),
    lastReadAt: null,
    ...overrides,
  }
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    userId: 'user-1',
    content: 'Olá!',
    deletedAt: null,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt: new Date('2026-01-01T12:00:00Z'),
    ...overrides,
  }
}

function makeMessageWithAttachments(overrides: Partial<MessageWithAttachments> = {}): MessageWithAttachments {
  return { ...makeMessage(), attachments: [], ...overrides }
}

function makeAttachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'att-1',
    messageId: null,
    uploadedBy: 'user-1',
    url: 'https://s3.amazonaws.com/bucket/file.webp',
    filename: 'imagem.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 50000,
    displayOrder: 0,
    ...overrides,
  }
}

describe('MessagesService', () => {
  let repo: ReturnType<typeof createMockMessagesRepository>
  let conversationsRepo: ReturnType<typeof createMockConversationsRepository>
  let storageService: ReturnType<typeof createMockStorageService>
  let service: MessagesService

  beforeEach(() => {
    repo = createMockMessagesRepository()
    conversationsRepo = createMockConversationsRepository()
    storageService = createMockStorageService()
    service = new MessagesService(repo, conversationsRepo, storageService)
    vi.clearAllMocks()
  })

  describe('sendMessage', () => {
    it('deve enviar mensagem com texto', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.createMessage).mockResolvedValue(makeMessage())
      vi.mocked(repo.linkAttachments).mockResolvedValue(undefined)
      vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments())

      const result = await service.sendMessage('conv-1', 'user-1', { content: 'Olá!' })

      expect(repo.createMessage).toHaveBeenCalledWith({ conversationId: 'conv-1', userId: 'user-1', content: 'Olá!' })
      expect(result.content).toBe('Olá!')
    })

    it('deve enviar mensagem com apenas anexo', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.findAttachmentsByUploader).mockResolvedValue([makeAttachment()])
      vi.mocked(repo.createMessage).mockResolvedValue(makeMessage({ content: null }))
      vi.mocked(repo.linkAttachments).mockResolvedValue(undefined)
      vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments({ content: null, attachments: [makeAttachment({ messageId: 'msg-1' })] }))

      const result = await service.sendMessage('conv-1', 'user-1', { attachmentIds: ['att-1'] })

      expect(repo.createMessage).toHaveBeenCalledWith({ conversationId: 'conv-1', userId: 'user-1', content: undefined })
      expect(repo.linkAttachments).toHaveBeenCalledWith('msg-1', ['att-1'])
      expect(result.attachments).toHaveLength(1)
    })

    it('deve lançar EMPTY_MESSAGE sem conteúdo nem anexo', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())

      await expect(service.sendMessage('conv-1', 'user-1', {})).rejects.toThrow('EMPTY_MESSAGE')
    })

    it('deve lançar NOT_FOUND se usuário não é membro', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(null)

      await expect(service.sendMessage('conv-1', 'user-1', { content: 'Oi' })).rejects.toThrow('NOT_FOUND')
    })

    it('deve lançar FORBIDDEN com can_send_messages false', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(
        makeMember({ permissions: { can_send_messages: false, can_send_files: true } })
      )

      await expect(service.sendMessage('conv-1', 'user-1', { content: 'Oi' })).rejects.toThrow('FORBIDDEN')
    })

    it('deve lançar FORBIDDEN ao enviar anexo com can_send_files false', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(
        makeMember({ permissions: { can_send_messages: true, can_send_files: false } })
      )

      await expect(service.sendMessage('conv-1', 'user-1', { attachmentIds: ['att-1'] })).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('uploadAttachment', () => {
    it('deve processar imagem com sharp e fazer upload', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.createAttachment).mockResolvedValue(makeAttachment())

      const result = await service.uploadAttachment('conv-1', 'user-1', Buffer.from('fake'), 'image/jpeg', 'foto.jpg', 50000)

      expect(storageService.upload).toHaveBeenCalled()
      const [key, , contentType] = vi.mocked(storageService.upload).mock.calls[0]
      expect(key).toMatch(/^chat\/attachments\//)
      expect(contentType).toBe('image/webp')
      expect(result.id).toBe('att-1')
    })

    it('deve fazer upload direto para arquivos não-imagem', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.createAttachment).mockResolvedValue(makeAttachment({ mimeType: 'application/pdf', filename: 'doc.pdf' }))

      await service.uploadAttachment('conv-1', 'user-1', Buffer.from('pdf'), 'application/pdf', 'doc.pdf', 10000)

      const [, , contentType] = vi.mocked(storageService.upload).mock.calls[0]
      expect(contentType).toBe('application/pdf')
    })

    it('deve lançar FORBIDDEN com can_send_files false', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(
        makeMember({ permissions: { can_send_messages: true, can_send_files: false } })
      )

      await expect(
        service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'image/jpeg', 'x.jpg', 100)
      ).rejects.toThrow('FORBIDDEN')
    })
  })

  describe('deleteMessage', () => {
    it('deve fazer soft delete como autor', async () => {
      vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments({ userId: 'user-1' }))
      vi.mocked(repo.softDeleteMessage).mockResolvedValue(makeMessage({ deletedAt: new Date() }))

      await service.deleteMessage('msg-1', 'user-1')

      expect(repo.softDeleteMessage).toHaveBeenCalledWith('msg-1')
    })

    it('deve lançar FORBIDDEN para não-autor', async () => {
      vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments({ userId: 'user-1' }))

      await expect(service.deleteMessage('msg-1', 'user-2')).rejects.toThrow('FORBIDDEN')
    })

    it('deve lançar NOT_FOUND para mensagem inexistente', async () => {
      vi.mocked(repo.findMessageById).mockResolvedValue(null)

      await expect(service.deleteMessage('msg-x', 'user-1')).rejects.toThrow('NOT_FOUND')
    })
  })

  describe('getHistory', () => {
    it('deve retornar histórico sem cursor', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.findMessagesByConversation).mockResolvedValue([makeMessageWithAttachments()])

      const result = await service.getHistory('conv-1', 'user-1', undefined, 50)

      expect(repo.findMessagesByConversation).toHaveBeenCalledWith({ conversationId: 'conv-1', cursor: undefined, limit: 50 })
      expect(result).toHaveLength(1)
    })

    it('deve decodificar cursor base64 e repassar ao repositório', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.findMessagesByConversation).mockResolvedValue([])

      const cursor = Buffer.from(JSON.stringify({ createdAt: '2026-01-01T12:00:00.000Z', id: 'msg-1' })).toString('base64')
      await service.getHistory('conv-1', 'user-1', cursor, 50)

      expect(repo.findMessagesByConversation).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        cursor: { createdAt: '2026-01-01T12:00:00.000Z', id: 'msg-1' },
        limit: 50,
      })
    })

    it('deve lançar NOT_FOUND se usuário não é membro', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(null)

      await expect(service.getHistory('conv-1', 'user-1', undefined, 50)).rejects.toThrow('NOT_FOUND')
    })
  })
})
```

- [ ] **Rodar testes para verificar que falham**

```bash
npx vitest run tests/modules/chat/messages.service.test.ts
```

Expected: FAIL com "Cannot find module".

- [ ] **Implementar messages.service.ts**

Criar `src/modules/chat/messages.service.ts`:

```typescript
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import type { IMessagesRepository, MessageWithAttachments, MessageCursor } from '../../shared/contracts/messages.repository.contract.js'
import type { IConversationsRepository } from '../../shared/contracts/conversations.repository.contract.js'
import type { IStorageService } from '../../shared/contracts/storage.service.contract.js'
import { ChatError } from './chat.errors.js'

export class MessagesService {
  constructor(
    private readonly repo: IMessagesRepository,
    private readonly conversationsRepo: IConversationsRepository,
    private readonly storageService: IStorageService,
  ) {}

  async sendMessage(
    conversationId: string,
    userId: string,
    data: { content?: string; attachmentIds?: string[] },
  ): Promise<MessageWithAttachments> {
    const member = await this.conversationsRepo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    if (!member.permissions.can_send_messages) throw new ChatError('FORBIDDEN')

    const hasAttachments = data.attachmentIds && data.attachmentIds.length > 0
    if (!data.content && !hasAttachments) throw new ChatError('EMPTY_MESSAGE')
    if (hasAttachments && !member.permissions.can_send_files) throw new ChatError('FORBIDDEN')

    if (hasAttachments) {
      const attachments = await this.repo.findAttachmentsByUploader(userId, data.attachmentIds!)
      if (attachments.length !== data.attachmentIds!.length) throw new ChatError('ATTACHMENT_NOT_FOUND')
    }

    const message = await this.repo.createMessage({ conversationId, userId, content: data.content })

    if (hasAttachments) {
      await this.repo.linkAttachments(message.id, data.attachmentIds!)
    }

    return (await this.repo.findMessageById(message.id))!
  }

  async uploadAttachment(
    conversationId: string,
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
    filename: string,
    sizeBytes: number,
  ) {
    const member = await this.conversationsRepo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')
    if (!member.permissions.can_send_files) throw new ChatError('FORBIDDEN')

    const isImage = mimeType.startsWith('image/')
    let uploadBuffer = fileBuffer
    let uploadMimeType = mimeType
    let ext = filename.split('.').pop() ?? 'bin'

    if (isImage) {
      uploadBuffer = await sharp(fileBuffer).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
      uploadMimeType = 'image/webp'
      ext = 'webp'
    }

    const key = `chat/attachments/${randomUUID()}.${ext}`
    const url = await this.storageService.upload(key, uploadBuffer, uploadMimeType)

    return this.repo.createAttachment({
      uploadedBy: userId,
      url,
      filename: isImage ? filename.replace(/\.[^.]+$/, '.webp') : filename,
      mimeType: uploadMimeType,
      sizeBytes: uploadBuffer.length,
      displayOrder: 0,
    })
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await this.repo.findMessageById(messageId)
    if (!message) throw new ChatError('NOT_FOUND')
    if (message.userId !== userId) throw new ChatError('FORBIDDEN')
    await this.repo.softDeleteMessage(messageId)
  }

  async getHistory(
    conversationId: string,
    userId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<MessageWithAttachments[]> {
    const member = await this.conversationsRepo.findMember(conversationId, userId)
    if (!member) throw new ChatError('NOT_FOUND')

    const decodedCursor: MessageCursor | undefined = cursor
      ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
      : undefined

    return this.repo.findMessagesByConversation({ conversationId, cursor: decodedCursor, limit })
  }
}
```

- [ ] **Rodar testes para verificar que passam**

```bash
npx vitest run tests/modules/chat/messages.service.test.ts
```

Expected: todos os testes PASS.

- [ ] **Commit**

```bash
git add src/modules/chat/messages.service.ts \
        tests/modules/chat/messages.service.test.ts
git commit -m "feat: MessagesService com TDD — envio, anexos, soft delete e histórico"
```

---

### Task 2: MessagesRepository

**Files:**
- Create: `src/modules/chat/messages.repository.ts`

- [ ] **Implementar MessagesRepository**

Criar `src/modules/chat/messages.repository.ts`:

```typescript
import { eq, and, lt, or, inArray, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../shared/infra/database/postgres.client.js'
import { messages, messageAttachments } from '../../shared/infra/database/schema.js'
import type {
  IMessagesRepository, Message, MessageAttachment,
  MessageWithAttachments, MessageCursor,
} from '../../shared/contracts/messages.repository.contract.js'

export class MessagesRepository implements IMessagesRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createMessage(data: { conversationId: string; userId: string; content?: string }): Promise<Message> {
    const [row] = await this.db.insert(messages).values({
      conversationId: data.conversationId,
      userId: data.userId,
      content: data.content ?? null,
    }).returning()
    return this.mapMessage(row)
  }

  async findMessageById(id: string): Promise<MessageWithAttachments | null> {
    const [row] = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1)
    if (!row) return null
    const attachments = await this.db.select().from(messageAttachments)
      .where(eq(messageAttachments.messageId, id))
      .orderBy(messageAttachments.displayOrder)
    return { ...this.mapMessage(row), attachments: attachments.map(a => this.mapAttachment(a)) }
  }

  async softDeleteMessage(id: string): Promise<Message> {
    const [row] = await this.db.update(messages)
      .set({ deletedAt: new Date(), content: '[mensagem deletada]', updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning()
    return this.mapMessage(row)
  }

  async createAttachment(data: {
    uploadedBy: string; url: string; filename: string
    mimeType: string; sizeBytes: number; displayOrder: number
  }): Promise<MessageAttachment> {
    const [row] = await this.db.insert(messageAttachments).values({
      messageId: null,
      uploadedBy: data.uploadedBy,
      url: data.url,
      filename: data.filename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      displayOrder: data.displayOrder,
    }).returning()
    return this.mapAttachment(row)
  }

  async linkAttachments(messageId: string, attachmentIds: string[]): Promise<void> {
    await this.db.update(messageAttachments)
      .set({ messageId })
      .where(inArray(messageAttachments.id, attachmentIds))
  }

  async findAttachmentsByUploader(uploadedBy: string, ids: string[]): Promise<MessageAttachment[]> {
    const rows = await this.db.select().from(messageAttachments).where(
      and(eq(messageAttachments.uploadedBy, uploadedBy), inArray(messageAttachments.id, ids))
    )
    return rows.map(r => this.mapAttachment(r))
  }

  async findMessagesByConversation(params: { conversationId: string; cursor?: MessageCursor; limit: number }): Promise<MessageWithAttachments[]> {
    let query = this.db.select().from(messages)
      .where(eq(messages.conversationId, params.conversationId))
      .$dynamic()

    if (params.cursor) {
      const cursorDate = new Date(params.cursor.createdAt)
      query = query.where(
        and(
          eq(messages.conversationId, params.conversationId),
          or(
            lt(messages.createdAt, cursorDate),
            and(eq(messages.createdAt, cursorDate), lt(messages.id, params.cursor.id)),
          ),
        )
      )
    }

    const rows = await query
      .orderBy(sql`${messages.createdAt} DESC, ${messages.id} DESC`)
      .limit(params.limit)

    const result: MessageWithAttachments[] = []
    for (const row of rows) {
      const attachments = await this.db.select().from(messageAttachments)
        .where(eq(messageAttachments.messageId, row.id))
        .orderBy(messageAttachments.displayOrder)
      result.push({ ...this.mapMessage(row), attachments: attachments.map(a => this.mapAttachment(a)) })
    }
    return result
  }

  private mapMessage(row: typeof messages.$inferSelect): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      content: row.content,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  private mapAttachment(row: typeof messageAttachments.$inferSelect): MessageAttachment {
    return {
      id: row.id,
      messageId: row.messageId,
      uploadedBy: row.uploadedBy,
      url: row.url,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      displayOrder: row.displayOrder,
    }
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
git add src/modules/chat/messages.repository.ts
git commit -m "feat: MessagesRepository — implementação com Drizzle e paginação por cursor"
```
