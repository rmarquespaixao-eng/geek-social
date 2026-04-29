ALTER TABLE "users" ADD COLUMN "google_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_linked_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "users_google_id_idx" ON "users" ("google_id") WHERE "google_id" IS NOT NULL;
