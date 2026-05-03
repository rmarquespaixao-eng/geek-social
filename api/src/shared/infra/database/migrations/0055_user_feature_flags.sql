ALTER TYPE "admin_action" ADD VALUE IF NOT EXISTS 'feature_flag_user_override_set';
ALTER TYPE "admin_action" ADD VALUE IF NOT EXISTS 'feature_flag_user_override_remove';

CREATE TABLE "user_feature_flags" (
  "id"         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    UUID        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "flag_id"    UUID        NOT NULL REFERENCES "feature_flags"("id") ON DELETE CASCADE,
  "enabled"    BOOLEAN     NOT NULL,
  "updated_by" UUID        REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "flag_id")
);

CREATE INDEX "user_feature_flags_user_id_idx" ON "user_feature_flags" ("user_id");
CREATE INDEX "user_feature_flags_flag_id_idx" ON "user_feature_flags" ("flag_id");
