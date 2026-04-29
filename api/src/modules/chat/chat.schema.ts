import { z } from 'zod'

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
})

export const inviteMemberSchema = z.object({
  userId: z.string().uuid(),
})

export const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']),
})

export const updateMemberPermissionsSchema = z.object({
  can_send_messages: z.boolean(),
  can_send_files: z.boolean(),
})

export const openDmSchema = z.object({
  friendId: z.string().uuid(),
})

export const sendDmRequestSchema = z.object({
  receiverId: z.string().uuid(),
})

export const registerPushSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
})

export const getHistoryQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const callMetadataSchema = z.object({
  status: z.enum(['completed', 'missed', 'rejected', 'cancelled', 'failed']),
  durationSec: z.number().int().min(0),
  startedAt: z.string(),
  endedAt: z.string(),
  initiatorId: z.string().uuid(),
})

export const sendMessageBodySchema = z.object({
  content: z.string().optional(),
  attachmentIds: z.array(z.string().uuid()).optional(),
  replyToId: z.string().uuid().optional(),
  callMetadata: callMetadataSchema.optional(),
})

export const forwardMessageSchema = z.object({
  conversationIds: z.array(z.string().uuid()).min(1).max(20),
})

export const setTemporarySchema = z.object({
  enabled: z.boolean(),
})
