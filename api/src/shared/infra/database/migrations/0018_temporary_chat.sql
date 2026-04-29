ALTER TABLE "conversations" ADD COLUMN "is_temporary" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "is_temporary" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "temporary_event" jsonb;
--> statement-breakpoint
CREATE INDEX "messages_temp_cleanup_idx"
  ON "messages" ("conversation_id", "created_at")
  WHERE "is_temporary" = true AND "deleted_at" IS NULL;
