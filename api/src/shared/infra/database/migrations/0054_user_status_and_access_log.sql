-- Coluna status dedicada para ban/suspend/reactivate no painel admin.
-- Substitui a abordagem implícita via tokenVersion.

DO $$ BEGIN
  CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'banned');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "user_status" NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" ("status");

-- Log de acessos de usuários (page views e ações relevantes no app).
-- Separado do admin_audit_log que registra apenas ações administrativas.

CREATE TABLE IF NOT EXISTS "user_access_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "action" VARCHAR(100) NOT NULL,
  "path" VARCHAR(500),
  "ip" VARCHAR(45),
  "user_agent" VARCHAR(512),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_access_log_user_id_idx" ON "user_access_log" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "user_access_log_action_idx" ON "user_access_log" ("action", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "user_access_log_created_at_idx" ON "user_access_log" ("created_at" DESC);
