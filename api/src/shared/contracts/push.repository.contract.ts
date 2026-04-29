export type PushSubscription = {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: Date
}

export interface IPushRepository {
  create(userId: string, data: { endpoint: string; p256dh: string; auth: string }): Promise<PushSubscription>
  findByUserId(userId: string): Promise<PushSubscription[]>
  delete(id: string): Promise<void>
}
