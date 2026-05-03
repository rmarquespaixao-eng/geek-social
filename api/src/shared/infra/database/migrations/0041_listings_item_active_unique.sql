-- Garante no nível do banco que nunca existem dois listings ativos para o mesmo item.
-- Índice parcial cobre apenas status = 'active', sem penalizar paused/closed.
CREATE UNIQUE INDEX listings_item_active_unique
  ON listings(item_id)
  WHERE status = 'active';
