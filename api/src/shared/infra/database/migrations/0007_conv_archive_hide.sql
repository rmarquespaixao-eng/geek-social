ALTER TABLE "conversation_members" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;
ALTER TABLE "conversation_members" ADD COLUMN "hidden_at" timestamp with time zone;
