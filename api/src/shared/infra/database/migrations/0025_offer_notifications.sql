-- Notification types para o sistema de ofertas (item 7)
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'offer_received';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'offer_accepted';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'offer_rejected';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'offer_completed';
