-- Adiciona papel administrativo na plataforma (platform_role).
-- Índice parcial exclui 'user' (maioria) para listar admins/mods rapidamente.

CREATE TYPE "platform_role" AS ENUM ('user', 'moderator', 'admin');

ALTER TABLE "users" ADD COLUMN "platform_role" "platform_role" NOT NULL DEFAULT 'user';

CREATE INDEX "users_platform_role_idx" ON "users" ("platform_role") WHERE platform_role <> 'user';
