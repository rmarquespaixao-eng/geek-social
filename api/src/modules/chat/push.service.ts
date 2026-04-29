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
