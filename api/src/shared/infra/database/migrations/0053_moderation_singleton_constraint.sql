-- Adiciona constraint singleton nas tabelas de configuração de moderação.
-- Garante que apenas uma linha pode existir em cada tabela (singleton pattern).

ALTER TABLE "ai_moderation_config"
  ADD COLUMN IF NOT EXISTS "singleton" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ai_moderation_config"
  ADD CONSTRAINT "ai_moderation_config_singleton_uniq" UNIQUE ("singleton");

ALTER TABLE "age_moderation_config"
  ADD COLUMN IF NOT EXISTS "singleton" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "age_moderation_config"
  ADD CONSTRAINT "age_moderation_config_singleton_uniq" UNIQUE ("singleton");
