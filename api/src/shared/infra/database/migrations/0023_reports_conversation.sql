-- Estende o enum de target_type do reports para permitir denunciar conversas inteiras
-- (DMs ou grupos). Postgres exige IF NOT EXISTS pra ser idempotente.
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'conversation';
