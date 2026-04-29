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

  getOnlineUserIds(): string[] {
    return Array.from(this.online.keys())
  }

  getOnlineUserIdsAmong(userIds: string[]): string[] {
    return userIds.filter(uid => this.isOnline(uid))
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
