-- Migrar itens com availability != 'none' para listings ativos
INSERT INTO listings (item_id, owner_id, availability, asking_price, payment_methods, status, disclaimer_accepted_at)
SELECT
  i.id,
  c.user_id,
  i.availability::text::item_availability,
  i.asking_price,
  '{}',
  'active',
  now()
FROM items i
JOIN collections c ON c.id = i.collection_id
WHERE i.availability != 'none';
