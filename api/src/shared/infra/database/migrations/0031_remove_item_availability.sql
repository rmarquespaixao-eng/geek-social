-- Remover colunas de disponibilidade dos itens (migradas para listings)
ALTER TABLE items
  DROP COLUMN IF EXISTS availability,
  DROP COLUMN IF EXISTS asking_price;
