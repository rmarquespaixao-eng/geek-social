-- Log de auditoria global para ações administrativas.
-- Separado do community_audit_log (painel de comunidade) — ver FR-051.

CREATE TYPE "admin_action" AS ENUM (
  'user_role_change',
  'user_ban',
  'user_unban',
  'user_suspend',
  'user_anonymize',
  'report_review',
  'report_dismiss',
  'community_suspend',
  'community_unsuspend',
  'feature_flag_create',
  'feature_flag_toggle',
  'feature_flag_delete',
  'ai_config_update',
  'ai_apikey_set',
  'ai_apikey_clear',
  'age_config_update',
  'lgpd_approve',
  'lgpd_reject',
  'lgpd_complete',
  'collection_type_create',
  'collection_type_update',
  'collection_type_toggle',
  'collection_type_delete'
);

CREATE TABLE "admin_audit_log" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_role_at_time" "platform_role" NOT NULL,
  "action" "admin_action" NOT NULL,
  "target_type" VARCHAR(40),
  "target_id" UUID,
  "ip" VARCHAR(45),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "admin_audit_log_action_created_at_idx" ON "admin_audit_log" ("action", "created_at" DESC);
CREATE INDEX "admin_audit_log_actor_created_at_idx" ON "admin_audit_log" ("actor_id", "created_at" DESC);
CREATE INDEX "admin_audit_log_target_type_target_id_idx" ON "admin_audit_log" ("target_type", "target_id");
