-- Configurações de moderação automatizada: IA (FR-080..084) e verificação de idade (FR-090).
-- Ambas são singleton — uma única linha por tabela.

CREATE TABLE "ai_moderation_config" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" VARCHAR(40),
  "model" VARCHAR(80),
  "endpoint" VARCHAR(500),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "moderate_text" BOOLEAN NOT NULL DEFAULT true,
  "moderate_images" BOOLEAN NOT NULL DEFAULT false,
  "moderate_videos" BOOLEAN NOT NULL DEFAULT false,
  "text_threshold" NUMERIC(3, 2),
  "image_threshold" NUMERIC(3, 2),
  "auto_remove" BOOLEAN NOT NULL DEFAULT false,
  "auto_flag" BOOLEAN NOT NULL DEFAULT true,
  "notify_moderators" BOOLEAN NOT NULL DEFAULT true,
  "api_key_ciphertext" BYTEA,
  "api_key_iv" BYTEA,
  "api_key_tag" BYTEA,
  "updated_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed singleton
INSERT INTO "ai_moderation_config" DEFAULT VALUES;

CREATE TABLE "age_moderation_config" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "minimum_age" SMALLINT NOT NULL DEFAULT 13 CHECK ("minimum_age" BETWEEN 13 AND 21),
  "method" VARCHAR(40) NOT NULL DEFAULT 'declaration',
  "require_verification" BOOLEAN NOT NULL DEFAULT false,
  "updated_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed singleton
INSERT INTO "age_moderation_config" DEFAULT VALUES;
