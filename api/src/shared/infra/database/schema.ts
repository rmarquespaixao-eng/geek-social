import { sql } from 'drizzle-orm'
import {
  pgTable, pgEnum, uuid, varchar, text,
  boolean, timestamp, date, integer, smallint, jsonb, uniqueIndex, index, numeric, primaryKey,
} from 'drizzle-orm/pg-core'
import { communityCategories } from '../../../modules/communities/categories.js'

export const privacyEnum = pgEnum('privacy', ['public', 'friends_only', 'private'])
export const collectionTypeEnum = pgEnum('collection_type', ['games', 'books', 'cardgames', 'boardgames', 'custom'])
export const collectionVisibilityEnum = pgEnum('collection_visibility', ['public', 'private', 'friends_only'])
export const fieldTypeEnum = pgEnum('field_type', ['text', 'number', 'date', 'boolean', 'select', 'money'])
export const friendshipStatusEnum = pgEnum('friendship_status', ['pending', 'accepted'])
export const postTypeEnum = pgEnum('post_type', ['manual', 'item_share'])
export const postVisibilityEnum = pgEnum('post_visibility', ['public', 'friends_only', 'private'])
export const reactionTypeEnum = pgEnum('reaction_type', ['power_up', 'epic', 'critical', 'loot', 'gg'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash'),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  bio: text('bio'),
  avatarUrl: varchar('avatar_url'),
  coverUrl: varchar('cover_url'),
  coverColor: varchar('cover_color', { length: 7 }),
  profileBackgroundUrl: varchar('profile_background_url'),
  profileBackgroundColor: varchar('profile_background_color', { length: 7 }),
  privacy: privacyEnum('privacy').default('public').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  showPresence: boolean('show_presence').default(true).notNull(),
  showReadReceipts: boolean('show_read_receipts').default(true).notNull(),
  steamId: varchar('steam_id', { length: 20 }).unique(),
  steamLinkedAt: timestamp('steam_linked_at', { withTimezone: true }),
  steamApiKey: varchar('steam_api_key', { length: 32 }),
  googleId: varchar('google_id', { length: 64 }).unique(),
  googleLinkedAt: timestamp('google_linked_at', { withTimezone: true }),
  birthday: date('birthday'),
  interests: jsonb('interests').$type<string[]>().notNull().default([]),
  pronouns: varchar('pronouns', { length: 50 }),
  location: varchar('location', { length: 120 }),
  website: varchar('website', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
})

export const fieldDefinitions = pgTable('field_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  fieldKey: varchar('field_key', { length: 50 }).notNull(),
  fieldType: fieldTypeEnum('field_type').notNull(),
  collectionType: collectionTypeEnum('collection_type'),
  selectOptions: jsonb('select_options').$type<string[]>(),
  isSystem: boolean('is_system').default(false).notNull(),
  isHidden: boolean('is_hidden').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const collections = pgTable('collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  iconUrl: varchar('icon_url'),
  coverUrl: varchar('cover_url'),
  type: collectionTypeEnum('type').notNull(),
  visibility: collectionVisibilityEnum('visibility').default('public').notNull(),
  autoShareToFeed: boolean('auto_share_to_feed').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const collectionFieldSchema = pgTable('collection_field_schema', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  fieldDefinitionId: uuid('field_definition_id').notNull().references(() => fieldDefinitions.id),
  isRequired: boolean('is_required').default(false).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
})

export const itemAvailabilityEnum = pgEnum('item_availability', ['none', 'sale', 'trade', 'both'])

export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  coverUrl: varchar('cover_url'),
  fields: jsonb('fields').$type<Record<string, unknown>>().default({}).notNull(),
  rating: smallint('rating'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const listingStatusEnum = pgEnum('listing_status', ['active', 'paused', 'closed'])

export const listings = pgTable('listings', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  availability: itemAvailabilityEnum('availability').notNull(),
  askingPrice: numeric('asking_price', { precision: 10, scale: 2 }),
  paymentMethods: text('payment_methods').array().notNull().default([]),
  status: listingStatusEnum('status').notNull().default('active'),
  disclaimerAcceptedAt: timestamp('disclaimer_accepted_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  itemActiveUniq: uniqueIndex('listings_item_active_uniq').on(table.itemId).where(sql`${table.status} = 'active'`),
  ownerStatusIdx: index('listings_owner_status_idx').on(table.ownerId, table.status, table.createdAt),
  activeUpdatedIdx: index('listings_active_updated_idx').on(table.updatedAt).where(sql`${table.status} = 'active'`),
}))

export const offerTypeEnum = pgEnum('offer_type', ['buy', 'trade'])
export const offerStatusEnum = pgEnum('offer_status', ['pending', 'accepted', 'rejected', 'cancelled', 'completed'])

export const itemOffers = pgTable('item_offers', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: offerTypeEnum('type').notNull(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  offererId: uuid('offerer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  offeredItemId: uuid('offered_item_id').references(() => items.id, { onDelete: 'set null' }),
  offeredPrice: numeric('offered_price', { precision: 12, scale: 2 }),
  message: text('message'),
  status: offerStatusEnum('status').notNull().default('pending'),
  offererConfirmedAt: timestamp('offerer_confirmed_at', { withTimezone: true }),
  ownerConfirmedAt: timestamp('owner_confirmed_at', { withTimezone: true }),
  listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pendingUnique: uniqueIndex('item_offers_pending_unique').on(table.itemId, table.offererId).where(sql`${table.status} = 'pending'`),
  ownerStatusIdx: index('item_offers_owner_status_idx').on(table.ownerId, table.status, table.createdAt),
  offererStatusIdx: index('item_offers_offerer_status_idx').on(table.offererId, table.status, table.createdAt),
  listingIdx: index('item_offers_listing_idx').on(table.listingId),
}))

export const proposalStatusEnum = pgEnum('proposal_status', ['pending', 'accepted', 'rejected', 'superseded'])

export const offerProposals = pgTable('offer_proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  offerId: uuid('offer_id').notNull().references(() => itemOffers.id, { onDelete: 'cascade' }),
  proposerId: uuid('proposer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  offeredPrice: numeric('offered_price', { precision: 12, scale: 2 }),
  offeredItemId: uuid('offered_item_id').references(() => items.id, { onDelete: 'set null' }),
  message: text('message'),
  status: proposalStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  offerIdx: index('offer_proposals_offer_idx').on(table.offerId, table.createdAt),
  onePendingPerOffer: uniqueIndex('offer_proposals_one_pending_uniq').on(table.offerId).where(sql`${table.status} = 'pending'`),
}))

export const friendships = pgTable('friendships', {
  id: uuid('id').defaultRandom().primaryKey(),
  requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: uuid('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: friendshipStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueRequest: uniqueIndex('friendships_requester_receiver_unique').on(table.requesterId, table.receiverId),
}))

export const userBlocks = pgTable('user_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueBlock: uniqueIndex('user_blocks_blocker_blocked_unique').on(table.blockerId, table.blockedId),
}))

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: postTypeEnum('type').notNull(),
  content: text('content'),
  visibility: postVisibilityEnum('visibility').notNull(),
  itemId: uuid('item_id').references(() => items.id, { onDelete: 'cascade' }),
  collectionId: uuid('collection_id').references(() => collections.id, { onDelete: 'set null' }),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'restrict' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userCreatedAtIdx: index('posts_user_created_at_idx').on(table.userId, table.createdAt),
  visibilityCreatedAtIdx: index('posts_visibility_created_at_idx').on(table.visibility, table.createdAt),
  itemIdx: index('posts_item_id_idx').on(table.itemId),
  communityCreatedAtIdx: index('posts_community_created_at_idx').on(table.communityId, table.createdAt).where(sql`${table.communityId} IS NOT NULL`),
}))

export const postMedia = pgTable('post_media', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  displayOrder: integer('display_order').notNull(),
}, (table) => ({
  postIdx: index('post_media_post_id_idx').on(table.postId),
}))

export const postReactions = pgTable('post_reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: reactionTypeEnum('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueUserPost: uniqueIndex('post_reactions_post_user_unique').on(table.postId, table.userId),
}))

export const postComments = pgTable('post_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  postCreatedAtIdx: index('post_comments_post_created_at_idx').on(table.postId, table.createdAt),
}))

export const conversationTypeEnum = pgEnum('conversation_type', ['dm', 'group'])
export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member'])
export const dmRequestStatusEnum = pgEnum('dm_request_status', ['pending', 'accepted', 'rejected'])

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: conversationTypeEnum('type').notNull(),
  name: varchar('name', { length: 100 }),
  description: text('description'),
  coverUrl: varchar('cover_url'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  isTemporary: boolean('is_temporary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const conversationMembers = pgTable('conversation_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRoleEnum('role').notNull().default('member'),
  permissions: jsonb('permissions').notNull().$type<{ can_send_messages: boolean; can_send_files: boolean }>().default({ can_send_messages: true, can_send_files: true }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  isArchived: boolean('is_archived').notNull().default(false),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),
  isMuted: boolean('is_muted').notNull().default(false),
}, (table) => ({
  uniqueMember: uniqueIndex('conversation_members_unique').on(table.conversationId, table.userId),
}))

export const dmRequests = pgTable('dm_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: uuid('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: dmRequestStatusEnum('status').notNull().default('pending'),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueRequest: uniqueIndex('dm_requests_unique').on(table.senderId, table.receiverId),
}))

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content'),
  replyToId: uuid('reply_to_id'),
  callMetadata: jsonb('call_metadata').$type<{
    status: 'completed' | 'missed' | 'rejected' | 'cancelled' | 'failed'
    durationSec: number
    startedAt: string
    endedAt: string
    initiatorId: string
  }>(),
  isTemporary: boolean('is_temporary').notNull().default(false),
  temporaryEvent: jsonb('temporary_event').$type<{ enabled: boolean; byUserId: string }>(),
  hiddenForUserIds: jsonb('hidden_for_user_ids').$type<string[]>().notNull().default([]),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  convCreatedAtIdx: index('messages_conversation_created_at_idx').on(table.conversationId, table.createdAt),
}))

export const messageReactions = pgTable('message_reactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: varchar('emoji', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueReaction: uniqueIndex('message_reactions_unique').on(table.messageId, table.userId, table.emoji),
  messageIdx: index('message_reactions_message_idx').on(table.messageId),
}))

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  durationMs: integer('duration_ms'),
  waveformPeaks: jsonb('waveform_peaks').$type<number[]>(),
  thumbnailUrl: text('thumbnail_url'),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  endpointUnique: uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
}))

export const userPresence = pgTable('user_presence', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const notificationTypeEnum = pgEnum('notification_type', [
  'friend_request',
  'friend_accepted',
  'post_comment',
  'post_reaction',
  'steam_import_done',
  'steam_import_partial',
  'offer_received',
  'offer_accepted',
  'offer_rejected',
  'offer_completed',
  'offer_cancelled',
  'offer_expired',
  'dm_request_received',
  'rating_received',
  'counter_proposal_received',
  'proposal_rejected',
  'event_reminder_48h',
  'event_reminder_2h',
  'event_cancelled',
  'event_updated',
  'event_conflict_after_edit',
  'event_promoted_from_waitlist',
  'event_invited',
  'community_join_requested',
  'community_join_approved',
  'community_join_rejected',
  'community_invited',
  'community_promoted_to_mod',
  'community_demoted',
  'community_banned',
  'community_unbanned',
  'community_new_topic',
  'community_transfer_requested',
  'community_transfer_accepted',
  'community_transfer_rejected',
])

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  entityId: uuid('entity_id'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  recipientCreatedAtIdx: index('notifications_recipient_created_at_idx').on(table.recipientId, table.createdAt),
}))

export const importBatchFinalized = pgTable('import_batch_finalized', {
  batchId: uuid('batch_id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  total: integer('total').notNull(),
  imported: integer('imported').notNull(),
  updated: integer('updated').notNull(),
  failed: integer('failed').notNull(),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdx: index('import_batch_finalized_user_idx').on(table.userId, table.finalizedAt),
}))

export const reportTargetTypeEnum = pgEnum('report_target_type', ['user', 'message', 'post', 'collection', 'conversation', 'community_topic', 'community_comment'])
export const reportReasonEnum = pgEnum('report_reason', ['spam', 'harassment', 'nsfw', 'hate', 'other'])
export const reportStatusEnum = pgEnum('report_status', ['pending', 'reviewed', 'dismissed'])

export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: reportTargetTypeEnum('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  reason: reportReasonEnum('reason').notNull(),
  description: text('description'),
  status: reportStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  reporterTargetUnique: uniqueIndex('reports_reporter_target_unique').on(table.reporterId, table.targetType, table.targetId),
  statusCreatedAtIdx: index('reports_status_created_at_idx').on(table.status, table.createdAt),
}))

export const listingRatings = pgTable('listing_ratings', {
  id: uuid('id').defaultRandom().primaryKey(),
  offerId: uuid('offer_id').notNull().references(() => itemOffers.id, { onDelete: 'cascade' }),
  raterId: uuid('rater_id').notNull().references(() => users.id),
  rateeId: uuid('ratee_id').notNull().references(() => users.id),
  score: smallint('score').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  offerRaterUniq: uniqueIndex('listing_ratings_offer_rater_uniq').on(table.offerId, table.raterId),
  rateeIdx: index('listing_ratings_ratee_idx').on(table.rateeId),
  offerIdx: index('listing_ratings_offer_idx').on(table.offerId),
}))

// ── Eventos ("Rolê") ──────────────────────────────────────────────
export const eventTypeEnum = pgEnum('event_type', ['presencial', 'online'])
export const eventVisibilityEnum = pgEnum('event_visibility', ['public', 'friends', 'invite'])
export const eventStatusEnum = pgEnum('event_status', ['scheduled', 'cancelled', 'ended'])
export const eventParticipantStatusEnum = pgEnum('event_participant_status', [
  'subscribed',
  'confirmed',
  'waitlist',
  'left',
])

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  hostUserId: uuid('host_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  coverUrl: varchar('cover_url').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  type: eventTypeEnum('type').notNull(),
  visibility: eventVisibilityEnum('visibility').notNull().default('public'),
  capacity: integer('capacity'),
  status: eventStatusEnum('status').notNull().default('scheduled'),
  cancellationReason: text('cancellation_reason'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  visibilityStartsAtIdx: index('events_visibility_starts_at_idx').on(table.visibility, table.startsAt),
  hostStartsAtIdx: index('events_host_starts_at_idx').on(table.hostUserId, table.startsAt),
  statusEndsAtIdx: index('events_status_ends_at_idx').on(table.status, table.endsAt),
}))

export const eventAddresses = pgTable('event_addresses', {
  eventId: uuid('event_id').primaryKey().references(() => events.id, { onDelete: 'cascade' }),
  cep: varchar('cep', { length: 9 }).notNull(),
  logradouro: varchar('logradouro', { length: 200 }).notNull(),
  numero: varchar('numero', { length: 20 }).notNull(),
  complemento: varchar('complemento', { length: 100 }),
  bairro: varchar('bairro', { length: 100 }).notNull(),
  cidade: varchar('cidade', { length: 100 }).notNull(),
  estado: varchar('estado', { length: 2 }).notNull(),
}, (table) => ({
  cidadeIdx: index('event_addresses_cidade_idx').on(table.cidade),
}))

export const eventOnlineDetails = pgTable('event_online_details', {
  eventId: uuid('event_id').primaryKey().references(() => events.id, { onDelete: 'cascade' }),
  meetingUrl: varchar('meeting_url', { length: 500 }).notNull(),
  extraDetails: text('extra_details'),
})

export const eventParticipants = pgTable('event_participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: eventParticipantStatusEnum('status').notNull(),
  waitlistPosition: integer('waitlist_position'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  leftAt: timestamp('left_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueEventUser: uniqueIndex('event_participants_event_user_uniq').on(table.eventId, table.userId),
  userStatusIdx: index('event_participants_user_status_idx').on(table.userId, table.status),
  eventStatusIdx: index('event_participants_event_status_idx').on(table.eventId, table.status),
  waitlistIdx: index('event_participants_waitlist_idx').on(table.eventId, table.waitlistPosition),
}))

export const eventInvites = pgTable('event_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  invitedUserId: uuid('invited_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  invitedBy: uuid('invited_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueInvite: uniqueIndex('event_invites_event_user_uniq').on(table.eventId, table.invitedUserId),
}))

// ── Comunidades ───────────────────────────────────────────────────
export const communityVisibilityEnum = pgEnum('community_visibility', ['public', 'private', 'restricted'])
export const communityMemberRoleEnum = pgEnum('community_member_role', ['owner', 'moderator', 'member'])
export const communityMemberStatusEnum = pgEnum('community_member_status', ['pending', 'active', 'banned'])
export const communityCategoryEnum = pgEnum('community_category', communityCategories)
export const communityJoinRequestStatusEnum = pgEnum('community_join_request_status', ['pending', 'approved', 'rejected'])
export const communityInviteStatusEnum = pgEnum('community_invite_status', ['pending', 'accepted', 'rejected', 'expired'])
export const communityTransferStatusEnum = pgEnum('community_transfer_status', ['pending', 'accepted', 'rejected', 'cancelled'])
export const communityPollModeEnum = pgEnum('community_poll_mode', ['single', 'multiple'])
export const communityAuditActionEnum = pgEnum('community_audit_action', [
  'community_create',
  'community_update',
  'community_delete',
  'member_promote',
  'member_demote',
  'member_ban',
  'member_unban',
  'member_join_approved',
  'member_join_rejected',
  'topic_pin',
  'topic_unpin',
  'topic_lock',
  'topic_unlock',
  'topic_move',
  'topic_delete',
  'comment_delete',
  'transfer_initiated',
  'transfer_accepted',
  'transfer_rejected',
  'transfer_cancelled',
])

export const communities = pgTable('communities', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  slug: varchar('slug', { length: 120 }).unique().notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  description: text('description').notNull(),
  category: communityCategoryEnum('category').notNull(),
  iconUrl: varchar('icon_url').notNull(),
  coverUrl: varchar('cover_url').notNull(),
  visibility: communityVisibilityEnum('visibility').notNull().default('public'),
  rules: text('rules'),
  welcomeMessage: text('welcome_message'),
  memberCount: integer('member_count').notNull().default(0),
  topicCount: integer('topic_count').notNull().default(0),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  categoryVisibilityIdx: index('communities_category_visibility_idx').on(table.category, table.visibility),
  ownerIdx: index('communities_owner_idx').on(table.ownerId),
  deletedAtIdx: index('communities_deleted_at_idx').on(table.deletedAt),
}))

export const communityMembers = pgTable('community_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: communityMemberRoleEnum('role').notNull().default('member'),
  status: communityMemberStatusEnum('status').notNull().default('active'),
  banReason: text('ban_reason'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
}, (table) => ({
  communityUserUniq: uniqueIndex('community_members_community_user_uniq').on(table.communityId, table.userId),
  communityStatusIdx: index('community_members_community_status_idx').on(table.communityId, table.status),
  userStatusIdx: index('community_members_user_status_idx').on(table.userId, table.status),
}))

export const communityJoinRequests = pgTable('community_join_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: communityJoinRequestStatusEnum('status').notNull().default('pending'),
  decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pendingUniq: uniqueIndex('community_join_requests_pending_uniq')
    .on(table.communityId, table.userId)
    .where(sql`${table.status} = 'pending'`),
}))

export const communityTopicMeta = pgTable('community_topic_meta', {
  postId: uuid('post_id').primaryKey().references(() => posts.id, { onDelete: 'cascade' }),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  pinned: boolean('pinned').notNull().default(false),
  locked: boolean('locked').notNull().default(false),
  pinnedAt: timestamp('pinned_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  movedFromCommunityId: uuid('moved_from_community_id').references(() => communities.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  communityPinnedCreatedAtIdx: index('community_topic_meta_community_pinned_created_at_idx').on(table.communityId, table.pinned, table.createdAt),
}))

export const communityTransfers = pgTable('community_transfers', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: communityTransferStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
}, (table) => ({
  pendingUniq: uniqueIndex('community_transfers_pending_uniq')
    .on(table.communityId)
    .where(sql`${table.status} = 'pending'`),
}))

export const communityAuditLog = pgTable('community_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: communityAuditActionEnum('action').notNull(),
  targetUserId: uuid('target_user_id'),
  targetTopicId: uuid('target_topic_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  communityCreatedAtIdx: index('community_audit_log_community_created_at_idx').on(table.communityId, table.createdAt),
}))

export const communityInvites = pgTable('community_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  invitedUserId: uuid('invited_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  invitedBy: uuid('invited_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: communityInviteStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => ({
  pendingUniq: uniqueIndex('community_invites_pending_uniq')
    .on(table.communityId, table.invitedUserId)
    .where(sql`${table.status} = 'pending'`),
}))

export const communityPolls = pgTable('community_polls', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().unique().references(() => posts.id, { onDelete: 'cascade' }),
  question: varchar('question', { length: 200 }).notNull(),
  mode: communityPollModeEnum('mode').notNull(),
  closesAt: timestamp('closes_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const communityPollOptions = pgTable('community_poll_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  pollId: uuid('poll_id').notNull().references(() => communityPolls.id, { onDelete: 'cascade' }),
  text: varchar('text', { length: 100 }).notNull(),
  displayOrder: integer('display_order').notNull(),
})

export const communityPollVotes = pgTable('community_poll_votes', {
  id: uuid('id').defaultRandom().primaryKey(),
  pollId: uuid('poll_id').notNull().references(() => communityPolls.id, { onDelete: 'cascade' }),
  optionId: uuid('option_id').notNull().references(() => communityPollOptions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pollUserOptionUniq: uniqueIndex('community_poll_votes_poll_user_option_uniq').on(table.pollId, table.userId, table.optionId),
}))

export const communityNotificationPrefs = pgTable('community_notification_prefs', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  muted: boolean('muted').notNull().default(false),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.communityId] }),
}))

export const communityBadges = pgTable('community_badges', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 100 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description').notNull(),
  iconUrl: varchar('icon_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const communityBadgeGrants = pgTable('community_badge_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  badgeId: uuid('badge_id').notNull().references(() => communityBadges.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  badgeUserUniq: uniqueIndex('community_badge_grants_badge_user_uniq').on(table.badgeId, table.userId),
}))
