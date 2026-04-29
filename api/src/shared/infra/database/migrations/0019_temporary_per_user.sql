-- Cada usuário tem sua própria visão das mensagens temporárias.
-- Ao "sair" da DM, o user é adicionado a hidden_for_user_ids (mensagem some pra ele).
-- Hard delete (DB + S3) só acontece quando todos os membros da DM estão na lista.
ALTER TABLE "messages"
  ADD COLUMN "hidden_for_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
