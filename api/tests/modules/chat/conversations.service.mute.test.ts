import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationsService } from '../../../src/modules/chat/conversations.service.js'
import { ChatError } from '../../../src/modules/chat/chat.errors.js'
import type { IConversationsRepository, ConversationMember } from '../../../src/shared/contracts/conversations.repository.contract.js'
import type { IFriendsRepository } from '../../../src/shared/contracts/friends.repository.contract.js'
import type { IStorageService } from '../../../src/shared/contracts/storage.service.contract.js'

function makeMember(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    id: 'm1', conversationId: 'c1', userId: 'u1', role: 'member',
    permissions: { can_send_messages: true, can_send_files: true },
    joinedAt: new Date(), lastReadAt: null, isArchived: false, hiddenAt: null, isMuted: false,
    ...overrides,
  }
}

function makeRepo(): IConversationsRepository {
  return {
    create: vi.fn(), findById: vi.fn(), update: vi.fn(), delete: vi.fn(),
    addMember: vi.fn(), findMember: vi.fn(), updateMember: vi.fn(), removeMember: vi.fn(),
    findMembers: vi.fn(), findMembersByUserId: vi.fn(),
    findExistingDm: vi.fn(), findUserConversations: vi.fn(), findConversationWithMeta: vi.fn(),
    updateLastReadAt: vi.fn(), setArchived: vi.fn(), setHiddenAt: vi.fn(),
    setMuted: vi.fn(),
    setTemporary: vi.fn(), findTemporaryDms: vi.fn(),
  } as unknown as IConversationsRepository
}

describe('ConversationsService.setMuted', () => {
  let repo: IConversationsRepository
  let friendsRepo: IFriendsRepository
  let storage: IStorageService
  let service: ConversationsService

  beforeEach(() => {
    repo = makeRepo()
    friendsRepo = {} as IFriendsRepository
    storage = {} as IStorageService
    service = new ConversationsService(repo, friendsRepo, storage)
  })

  it('marca como mute quando o membro existe', async () => {
    vi.mocked(repo.findMember).mockResolvedValue(makeMember())
    await service.setMuted('c1', 'u1', true)
    expect(repo.setMuted).toHaveBeenCalledWith('c1', 'u1', true)
  })

  it('desmarca mute quando solicitado', async () => {
    vi.mocked(repo.findMember).mockResolvedValue(makeMember({ isMuted: true }))
    await service.setMuted('c1', 'u1', false)
    expect(repo.setMuted).toHaveBeenCalledWith('c1', 'u1', false)
  })

  it('lança NOT_FOUND quando o usuário não é membro', async () => {
    vi.mocked(repo.findMember).mockResolvedValue(null)
    await expect(service.setMuted('c1', 'u1', true)).rejects.toThrow(ChatError)
  })
})
