-- Migrate E2E from ECDH P-256 + AES-GCM static keys to Signal Protocol
-- (X3DH/PQXDH + Double Ratchet + Sender Keys via @getmaapp/signal-wasm).
--
-- Drops the legacy ECDH crypto schema introduced in 0044. Production has
-- 0 keys / 0 encrypted messages, so there is nothing to preserve.
-- Plaintext messages stay untouched — `messages.is_encrypted` is preserved
-- so old plaintext history continues to render correctly.

DROP TABLE IF EXISTS "conversation_group_keys" CASCADE;
DROP TABLE IF EXISTS "user_crypto_keys" CASCADE;

-- Identity key per user. The private half lives only on the client; the
-- server stores the public half plus a PIN-encrypted backup of the private
-- key so the user can restore the identity on a new device.
CREATE TABLE "signal_identity_keys" (
  "user_id" UUID PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "identity_key" BYTEA NOT NULL,
  "registration_id" INTEGER NOT NULL,
  "encrypted_backup" BYTEA,
  "backup_salt" BYTEA,
  "backup_iv" BYTEA,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Curve25519 signed pre-key. One active per user; rotates ~weekly. Older
-- entries are retained briefly so in-flight messages encrypted with a
-- previous SPK can still be decrypted.
CREATE TABLE "signal_signed_prekeys" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "prekey_id" INTEGER NOT NULL,
  "public_key" BYTEA NOT NULL,
  "signature" BYTEA NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "prekey_id")
);
CREATE INDEX "signal_signed_prekeys_user_created_idx"
  ON "signal_signed_prekeys" ("user_id", "created_at" DESC);

-- Kyber1024 signed pre-key for PQXDH (post-quantum X3DH). Same lifecycle
-- as signed pre-keys.
CREATE TABLE "signal_kyber_prekeys" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "prekey_id" INTEGER NOT NULL,
  "public_key" BYTEA NOT NULL,
  "signature" BYTEA NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "prekey_id")
);
CREATE INDEX "signal_kyber_prekeys_user_created_idx"
  ON "signal_kyber_prekeys" ("user_id", "created_at" DESC);

-- One-time pre-keys consumed atomically (DELETE ... RETURNING) when a
-- peer fetches a bundle, so two clients cannot ever reuse the same OTP.
CREATE TABLE "signal_one_time_prekeys" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "prekey_id" INTEGER NOT NULL,
  "public_key" BYTEA NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("user_id", "prekey_id")
);
CREATE INDEX "signal_one_time_prekeys_user_idx"
  ON "signal_one_time_prekeys" ("user_id");

-- Sender Key Distribution Messages (SKDM) for group chats. When a member
-- generates / rotates their sender key for a conversation, they encrypt
-- the SKDM via the 1:1 Signal session to every other member and upload
-- the ciphertext here. Each recipient fetches and processes once, then
-- the row is deleted.
CREATE TABLE "signal_sender_key_distributions" (
  "conversation_id" UUID NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ciphertext" BYTEA NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("conversation_id", "sender_user_id", "recipient_user_id")
);
CREATE INDEX "signal_skdm_recipient_idx"
  ON "signal_sender_key_distributions" ("recipient_user_id", "conversation_id");
