import type { NotificationsRepository, Notification, NotificationType } from './notifications.repository.js'

type EmitFn = (userId: string, notification: Notification) => void

export class NotificationsService {
  private emitFn: EmitFn | null = null

  constructor(private readonly repo: NotificationsRepository) {}

  setEmitter(fn: EmitFn): void {
    this.emitFn = fn
  }

  async notify(data: {
    recipientId: string
    actorId: string
    type: NotificationType
    entityId?: string
  }): Promise<void> {
    if (data.recipientId === data.actorId) return
    const notification = await this.repo.create(data)
    this.emitFn?.(data.recipientId, notification)
  }

  /**
   * Notifica o próprio usuário (sem o filtro recipient === actor).
   * Use para eventos do sistema iniciados pelo próprio user (ex: import Steam concluído).
   */
  async notifySelf(data: {
    userId: string
    type: NotificationType
    entityId?: string
  }): Promise<void> {
    const notification = await this.repo.create({
      recipientId: data.userId,
      actorId: data.userId,
      type: data.type,
      entityId: data.entityId,
    })
    this.emitFn?.(data.userId, notification)
  }

  async list(recipientId: string): Promise<Notification[]> {
    return this.repo.findByRecipient(recipientId)
  }

  async countUnread(recipientId: string): Promise<number> {
    return this.repo.countUnread(recipientId)
  }

  async markAllRead(recipientId: string): Promise<void> {
    await this.repo.markAllRead(recipientId)
  }

  async markRead(recipientId: string, notificationId: string): Promise<void> {
    await this.repo.markRead(recipientId, notificationId)
  }

  async deleteAll(recipientId: string): Promise<void> {
    await this.repo.deleteAll(recipientId)
  }

  async deleteOne(recipientId: string, notificationId: string): Promise<void> {
    await this.repo.deleteOne(recipientId, notificationId)
  }
}
