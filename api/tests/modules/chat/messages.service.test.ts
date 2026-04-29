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
// CallMetadata só usado em literal abaixo
import type { IConversationsRepository, ConversationMember } from '../../../src/shared/contracts/conversations.repository.contract.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'

function createMockMessagesRepository(): IMessagesRepository {
  return {
    createMessage: vi.fn(),
    findMessageById: vi.fn(),
    softDeleteMessage: vi.fn(),
    hardDeleteMessage: vi.fn(),
    findReadTemporaryReceivedBy: vi.fn(),
    findExpiredTemporary: vi.fn(),
    createAttachment: vi.fn(),
    linkAttachments: vi.fn(),
    cloneAttachmentsToMessage: vi.fn(),
    findAttachmentsByUploader: vi.fn(),
    findMessagesByConversation: vi.fn(),
  } as unknown as IMessagesRepository
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
    setTemporary: vi.fn(),
    findTemporaryDms: vi.fn(),
  } as unknown as IConversationsRepository
}

function createMockStorageService(): IStorageService {
  return {
    upload: vi.fn().mockResolvedValue('https://s3.amazonaws.com/bucket/file.webp'),
    delete: vi.fn().mockResolvedValue(undefined),
    keyFromUrl: vi.fn().mockReturnValue(null),
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
    replyToId: null,
    callMetadata: null,
    isTemporary: false,
    temporaryEvent: null,
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
    durationMs: null,
    waveformPeaks: null,
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

      expect(repo.createMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-1', userId: 'user-1', content: 'Olá!' }))
      expect(result.content).toBe('Olá!')
    })

    it('deve enviar mensagem com apenas anexo', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.findAttachmentsByUploader).mockResolvedValue([makeAttachment()])
      vi.mocked(repo.createMessage).mockResolvedValue(makeMessage({ content: null }))
      vi.mocked(repo.linkAttachments).mockResolvedValue(undefined)
      vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments({ content: null, attachments: [makeAttachment({ messageId: 'msg-1' })] }))

      const result = await service.sendMessage('conv-1', 'user-1', { attachmentIds: ['att-1'] })

      expect(repo.createMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-1', userId: 'user-1', content: undefined }))
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

    it('deve criar mensagem de chamada apenas com callMetadata (sem content/anexos)', async () => {
      const callMeta = {
        status: 'completed' as const,
        durationSec: 154,
        startedAt: '2026-04-26T15:00:00.000Z',
        endedAt: '2026-04-26T15:02:34.000Z',
        initiatorId: 'user-1',
      }
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.createMessage).mockResolvedValue(makeMessage({ content: null, callMetadata: callMeta }))
      vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments({ content: null, callMetadata: callMeta }))

      const result = await service.sendMessage('conv-1', 'user-1', { callMetadata: callMeta })

      expect(repo.createMessage).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: 'conv-1',
        userId: 'user-1',
        content: undefined,
        replyToId: undefined,
        callMetadata: callMeta,
      }))
      expect(result.callMetadata?.status).toBe('completed')
    })

    it('mensagem com callMetadata não dispara EMPTY_MESSAGE mesmo sem content', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.createMessage).mockResolvedValue(makeMessage({ content: null }))
      vi.mocked(repo.findMessageById).mockResolvedValue(makeMessageWithAttachments({ content: null }))

      await expect(
        service.sendMessage('conv-1', 'user-1', {
          callMetadata: {
            status: 'missed',
            durationSec: 0,
            startedAt: '2026-04-26T15:00:00.000Z',
            endedAt: '2026-04-26T15:00:30.000Z',
            initiatorId: 'user-1',
          },
        }),
      ).resolves.toBeDefined()
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

    it('rejeita arquivo maior que 6MB com ATTACHMENT_TOO_LARGE', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      const big = Buffer.alloc(6 * 1024 * 1024 + 1)
      await expect(
        service.uploadAttachment('conv-1', 'user-1', big, 'audio/webm', 'a.webm', big.length, {
          durationMs: 5000, waveformPeaks: new Array(64).fill(0.1),
        }),
      ).rejects.toThrow('ATTACHMENT_TOO_LARGE')
    })

    it('rejeita imagem maior que 6MB com ATTACHMENT_TOO_LARGE (regressão protegida)', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      const big = Buffer.alloc(6 * 1024 * 1024 + 1)
      await expect(
        service.uploadAttachment('conv-1', 'user-1', big, 'image/png', 'big.png', big.length),
      ).rejects.toThrow('ATTACHMENT_TOO_LARGE')
    })

    it('rejeita áudio sem audioMeta com AUDIO_METADATA_REQUIRED', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      await expect(
        service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000),
      ).rejects.toThrow('AUDIO_METADATA_REQUIRED')
    })

    it('rejeita áudio com mime fora da allowlist com UNSUPPORTED_AUDIO_FORMAT', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      await expect(
        service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/flac', 'a.flac', 1000, {
          durationMs: 5000, waveformPeaks: new Array(64).fill(0.1),
        }),
      ).rejects.toThrow('UNSUPPORTED_AUDIO_FORMAT')
    })

    it('rejeita áudio com duração maior que 180.000ms com AUDIO_TOO_LONG', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      await expect(
        service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000, {
          durationMs: 180_001, waveformPeaks: new Array(64).fill(0.1),
        }),
      ).rejects.toThrow('AUDIO_TOO_LONG')
    })

    it('rejeita áudio com duração 0 com AUDIO_TOO_LONG', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      await expect(
        service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000, {
          durationMs: 0, waveformPeaks: new Array(64).fill(0.1),
        }),
      ).rejects.toThrow('AUDIO_TOO_LONG')
    })

    it('rejeita waveform com tamanho diferente de 64 com INVALID_WAVEFORM', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      await expect(
        service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000, {
          durationMs: 5000, waveformPeaks: new Array(32).fill(0.1),
        }),
      ).rejects.toThrow('INVALID_WAVEFORM')
    })

    it('rejeita waveform com valores fora de [0,1] com INVALID_WAVEFORM', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      const peaks = new Array(64).fill(0.1)
      peaks[10] = 1.5
      await expect(
        service.uploadAttachment('conv-1', 'user-1', Buffer.from('x'), 'audio/webm', 'a.webm', 1000, {
          durationMs: 5000, waveformPeaks: peaks,
        }),
      ).rejects.toThrow('INVALID_WAVEFORM')
    })

    it('aceita áudio válido, gera filename audio-YYYYMMDD-HHmmss-XXXXXXXX e persiste metadata', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(storageService.upload).mockResolvedValue('https://s3/audio.webm')
      const peaks = new Array(64).fill(0.5)
      vi.mocked(repo.createAttachment).mockResolvedValue(
        makeAttachment({ mimeType: 'audio/webm', durationMs: 32450, waveformPeaks: peaks })
      )

      await service.uploadAttachment(
        'conv-1', 'user-1', Buffer.from('audio-bytes'), 'audio/webm', 'voice.webm', 11, {
          durationMs: 32450, waveformPeaks: peaks,
        },
      )

      expect(storageService.upload).toHaveBeenCalledTimes(1)
      const createCall = vi.mocked(repo.createAttachment).mock.calls[0][0]
      expect(createCall.filename).toMatch(/^audio-\d{8}-\d{6}-[a-f0-9]{8}\.webm$/)
      expect(createCall.mimeType).toBe('audio/webm')
      expect(createCall.durationMs).toBe(32450)
      expect(createCall.waveformPeaks).toEqual(peaks)
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
      vi.mocked(repo.findMessagesByConversation).mockResolvedValue({
        messages: [makeMessageWithAttachments()],
        nextCursor: null,
      })

      const result = await service.getHistory('conv-1', 'user-1', undefined, 50)

      expect(repo.findMessagesByConversation).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: 'conv-1', cursor: undefined, limit: 50,
      }))
      expect(result.messages).toHaveLength(1)
      expect(result.nextCursor).toBeNull()
    })

    it('deve decodificar cursor base64 e repassar ao repositório', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(makeMember())
      vi.mocked(repo.findMessagesByConversation).mockResolvedValue({
        messages: [],
        nextCursor: null,
      })

      const cursor = Buffer.from(JSON.stringify({ createdAt: '2026-01-01T12:00:00.000Z', id: 'msg-1' })).toString('base64')
      await service.getHistory('conv-1', 'user-1', cursor, 50)

      expect(repo.findMessagesByConversation).toHaveBeenCalledWith(expect.objectContaining({
        conversationId: 'conv-1',
        cursor: { createdAt: new Date('2026-01-01T12:00:00.000Z'), id: 'msg-1' },
        limit: 50,
      }))
    })

    it('deve lançar NOT_FOUND se usuário não é membro', async () => {
      vi.mocked(conversationsRepo.findMember).mockResolvedValue(null)

      await expect(service.getHistory('conv-1', 'user-1', undefined, 50)).rejects.toThrow('NOT_FOUND')
    })
  })
})
