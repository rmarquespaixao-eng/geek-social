export type UserPresence = {
  userId: string
  lastSeenAt: Date
  updatedAt: Date
}

export interface IPresenceRepository {
  upsertLastSeen(userId: string, lastSeenAt: Date): Promise<void>
  findByUserId(userId: string): Promise<UserPresence | null>
}
