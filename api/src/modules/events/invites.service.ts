import type { EventsRepository } from './events.repository.js'
import type { InvitesRepository, InviteWithUser } from './invites.repository.js'
import type { NotificationsService } from '../notifications/notifications.service.js'
import { EventsError } from './events.errors.js'

export class InvitesService {
  constructor(
    private readonly eventsRepo: EventsRepository,
    private readonly repo: InvitesRepository,
    private readonly notificationsService: NotificationsService | null,
  ) {}

  private async assertHost(userId: string, eventId: string): Promise<void> {
    const ev = await this.eventsRepo.findById(eventId)
    if (!ev) throw new EventsError('EVENT_NOT_FOUND')
    if (ev.hostUserId !== userId) throw new EventsError('NOT_HOST')
  }

  async createMany(
    hostUserId: string,
    eventId: string,
    invitedUserIds: string[],
  ): Promise<{ invited: string[]; alreadyInvited: string[] }> {
    await this.assertHost(hostUserId, eventId)
    const result = await this.repo.insertMany(eventId, hostUserId, invitedUserIds)
    if (this.notificationsService) {
      for (const r of result.inserted) {
        await this.notificationsService
          .notify({
            recipientId: r.invitedUserId,
            actorId: hostUserId,
            type: 'event_invited',
            entityId: eventId,
          })
          .catch(() => {})
      }
    }
    return {
      invited: result.inserted.map(r => r.invitedUserId),
      alreadyInvited: result.alreadyInvited,
    }
  }

  async deleteOne(hostUserId: string, eventId: string, invitedUserId: string): Promise<void> {
    await this.assertHost(hostUserId, eventId)
    await this.repo.deleteByEventAndUser(eventId, invitedUserId)
  }

  async list(hostUserId: string, eventId: string): Promise<InviteWithUser[]> {
    await this.assertHost(hostUserId, eventId)
    return this.repo.findByEvent(eventId)
  }
}
