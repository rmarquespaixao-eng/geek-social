CREATE TABLE "import_batch_finalized" (
  "batch_id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "collection_id" uuid NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
  "total" integer NOT NULL,
  "imported" integer NOT NULL,
  "updated" integer NOT NULL,
  "failed" integer NOT NULL,
  "finalized_at" timestamp with time zone NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX "import_batch_finalized_user_idx" ON "import_batch_finalized" ("user_id", "finalized_at" DESC);
