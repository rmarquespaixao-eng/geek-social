-- Enum extensions for communities notification and report types.
-- Must run in its own transaction before the table-creation migration
-- because Postgres requires COMMIT before new enum values are usable in DDL.

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_join_requested';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_join_approved';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_join_rejected';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_invited';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_promoted_to_mod';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_demoted';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_banned';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_unbanned';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_new_topic';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_transfer_requested';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_transfer_accepted';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_transfer_rejected';
--> statement-breakpoint
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'community_topic';
--> statement-breakpoint
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'community_comment';
