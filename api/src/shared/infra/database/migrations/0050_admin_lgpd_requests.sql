-- Solicitações LGPD gerenciadas pelo painel admin (FR-070..072).
-- Prazo legal (created_at + 15 dias) calculado em runtime, não persistido.

CREATE TYPE "lgpd_request_type" AS ENUM ('export', 'delete', 'rectify', 'portability');
CREATE TYPE "lgpd_request_status" AS ENUM ('pending', 'processing', 'completed', 'rejected');

CREATE TABLE "lgpd_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "lgpd_request_type" NOT NULL,
  "status" "lgpd_request_status" NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "decided_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "lgpd_requests_status_created_at_idx" ON "lgpd_requests" ("status", "created_at");
CREATE INDEX "lgpd_requests_user_id_idx" ON "lgpd_requests" ("user_id");
