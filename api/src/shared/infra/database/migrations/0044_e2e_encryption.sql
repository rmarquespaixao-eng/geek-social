ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_encrypted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "user_crypto_keys" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "public_key" TEXT NOT NULL,
  "encrypted_backup" TEXT,
  "backup_salt" TEXT,
  "backup_iv" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "conversation_group_keys" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "encrypted_key" TEXT NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_group_keys_member_version_uniq"
  ON "conversation_group_keys"("conversation_id", "user_id", "key_version");

CREATE INDEX IF NOT EXISTS "conversation_group_keys_conversation_idx"
  ON "conversation_group_keys"("conversation_id");
