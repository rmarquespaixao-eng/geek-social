import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js'
import type { NotificationsRepository, Notification } from '../../../src/modules/notifications/notifications.repository.js'

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1', recipientId: USER_B, actorId: USER_A,
    actorName: 'Actor', actorAvatar: null,
    type: 'friend_request', entityId: null, read: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeRepo(): NotificationsRepository {
  return {
    create: vi.fn().mockResolvedValue(makeNotification()),
    findByRecipient: vi.fn(),
    countUnread: vi.fn(),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
  } as unknown as NotificationsRepository
}

describe('NotificationsService.notify', () => {
  it('cria notification e emite via emitter', async () => {
    const repo = makeRepo()
    const emit = vi.fn()
    const service = new NotificationsService(repo)
    service.setEmitter(emit)

    await service.notify({
      recipientId: USER_B, actorId: USER_A,
      type: 'friend_request', entityId: 'req-1',
    })

    expect(repo.create).toHaveBeenCalledWith({
      recipientId: USER_B, actorId: USER_A,
      type: 'friend_request', entityId: 'req-1',
    })
    expect(emit).toHaveBeenCalledWith(USER_B, expect.objectContaining({ id: 'n-1' }))
  })

  it('NÃO cria/emite quando recipient === actor (auto-notificação não-self)', async () => {
    const repo = makeRepo()
    const emit = vi.fn()
    const service = new NotificationsService(repo)
    service.setEmitter(emit)

    await service.notify({
      recipientId: USER_A, actorId: USER_A,
      type: 'friend_request',
    })

    expect(repo.create).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('funciona sem emitter setado (não lança)', async () => {
    const repo = makeRepo()
    const service = new NotificationsService(repo)
    await expect(service.notify({
      recipientId: USER_B, actorId: USER_A, type: 'friend_request',
    })).resolves.not.toThrow()
    expect(repo.create).toHaveBeenCalled()
  })
})

describe('NotificationsService.notifySelf', () => {
  it('cria notification com actor === recipient e emite', async () => {
    const repo = makeRepo()
    ;(repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(makeNotification({
      recipientId: USER_A, actorId: USER_A, type: 'steam_import_done', entityId: 'col-1',
    }))
    const emit = vi.fn()
    const service = new NotificationsService(repo)
    service.setEmitter(emit)

    await service.notifySelf({
      userId: USER_A,
      type: 'steam_import_done',
      entityId: 'col-1',
    })

    expect(repo.create).toHaveBeenCalledWith({
      recipientId: USER_A, actorId: USER_A,
      type: 'steam_import_done', entityId: 'col-1',
    })
    expect(emit).toHaveBeenCalledWith(USER_A, expect.objectContaining({
      type: 'steam_import_done',
    }))
  })

  it('cria mesmo quando emitter ausente', async () => {
    const repo = makeRepo()
    const service = new NotificationsService(repo)
    await service.notifySelf({
      userId: USER_A, type: 'steam_import_partial', entityId: 'col-1',
    })
    expect(repo.create).toHaveBeenCalled()
  })

  it('emite com entityId opcional vazio', async () => {
    const repo = makeRepo()
    const emit = vi.fn()
    const service = new NotificationsService(repo)
    service.setEmitter(emit)
    await service.notifySelf({ userId: USER_A, type: 'steam_import_done' })
    expect(repo.create).toHaveBeenCalledWith({
      recipientId: USER_A, actorId: USER_A,
      type: 'steam_import_done', entityId: undefined,
    })
  })
})
