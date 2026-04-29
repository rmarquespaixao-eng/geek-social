ALTER TABLE "conversation_members" ADD COLUMN "is_muted" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_presence" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_read_receipts" boolean NOT NULL DEFAULT true;
