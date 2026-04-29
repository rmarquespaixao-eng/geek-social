// src/modules/friends/friends.schema.ts
import { z } from 'zod'

export const sendFriendRequestSchema = z.object({
  receiverId: z.string().uuid(),
})

export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>
