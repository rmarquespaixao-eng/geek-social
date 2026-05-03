-- Feature flags gerenciados pelo painel admin (FR-060..062).

CREATE TABLE "feature_flags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR(80) UNIQUE NOT NULL,
  "name" VARCHAR(120),
  "description" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
