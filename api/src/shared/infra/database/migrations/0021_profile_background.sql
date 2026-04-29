-- Imagem de fundo customizada do perfil (renderizada com overlay para legibilidade)
ALTER TABLE "users"
  ADD COLUMN "profile_background_url" varchar;
