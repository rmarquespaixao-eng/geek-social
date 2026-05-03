-- Migração atômica: converte o pgEnum collection_type em tabela collection_types.
-- Toda esta migration executa dentro de uma única transação — qualquer falha
-- reverte tudo (não usa statement-breakpoint).

BEGIN;

-- 1. Cria a tabela de tipos de coleção
CREATE TABLE "collection_types" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR(40) UNIQUE NOT NULL,
  "name" VARCHAR(80),
  "description" TEXT,
  "icon" VARCHAR(20),
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Seed: insere as 5 chaves do enum antigo como tipos do sistema
INSERT INTO "collection_types" ("key", "name", "is_system", "active") VALUES
  ('games',      'Games',       true, true),
  ('books',      'Livros',      true, true),
  ('cardgames',  'Card Games',  true, true),
  ('boardgames', 'Board Games', true, true),
  ('custom',     'Personalizado', true, true);

-- 3. Adiciona colunas FK em field_definitions e collections
ALTER TABLE "field_definitions" ADD COLUMN "collection_type_id" UUID REFERENCES "collection_types"("id");
ALTER TABLE "collections" ADD COLUMN "collection_type_id" UUID REFERENCES "collection_types"("id");

-- 4. Backfill field_definitions
UPDATE "field_definitions"
SET "collection_type_id" = (
  SELECT "id" FROM "collection_types" WHERE "key" = "field_definitions"."collection_type"::text
)
WHERE "collection_type" IS NOT NULL;

-- 5. Backfill collections
UPDATE "collections"
SET "collection_type_id" = (
  SELECT "id" FROM "collection_types" WHERE "key" = "collections"."type"::text
)
WHERE "type" IS NOT NULL;

-- 6. Remove as colunas antigas
ALTER TABLE "field_definitions" DROP COLUMN "collection_type";
ALTER TABLE "collections" DROP COLUMN "type";

-- 7. Remove o tipo enum (agora sem referências)
DROP TYPE "collection_type";

COMMIT;
