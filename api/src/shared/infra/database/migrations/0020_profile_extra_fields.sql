-- Campos biográficos adicionais editáveis pelo perfil
ALTER TABLE "users"
  ADD COLUMN "birthday" date,
  ADD COLUMN "interests" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "pronouns" varchar(50),
  ADD COLUMN "location" varchar(120),
  ADD COLUMN "website" varchar(255);
