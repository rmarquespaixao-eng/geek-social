ALTER TABLE "users" ADD COLUMN "steam_id" varchar(20);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_steam_id_unique" UNIQUE("steam_id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "steam_linked_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "users_steam_id_idx" ON "users" ("steam_id") WHERE "steam_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "field_definitions" ADD COLUMN "is_hidden" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'steam_import_done';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'steam_import_partial';
