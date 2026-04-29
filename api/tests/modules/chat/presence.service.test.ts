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
