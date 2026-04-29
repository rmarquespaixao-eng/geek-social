-- Sistema de denúncia de abuso (item 6 do backlog)
CREATE TYPE "report_target_type" AS ENUM ('user', 'message', 'post', 'collection');
--> statement-breakpoint
CREATE TYPE "report_reason" AS ENUM ('spam', 'harassment', 'nsfw', 'hate', 'other');
--> statement-breakpoint
CREATE TYPE "report_status" AS ENUM ('pending', 'reviewed', 'dismissed');
--> statement-breakpoint
CREATE TABLE "reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_type" "report_target_type" NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" "report_reason" NOT NULL,
  "description" text,
  "status" "report_status" NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Rate limit: uma denúncia por (reporter, target_type, target_id)
CREATE UNIQUE INDEX "reports_reporter_target_unique" ON "reports" ("reporter_id", "target_type", "target_id");
--> statement-breakpoint
-- Index para revisão admin por status
CREATE INDEX "reports_status_created_at_idx" ON "reports" ("status", "created_at" DESC);
