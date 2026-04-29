-- Rastreia qual anúncio originou cada oferta (nullable para retrocompatibilidade)
ALTER TABLE item_offers
  ADD COLUMN listing_id UUID REFERENCES listings(id) ON DELETE SET NULL;

CREATE INDEX item_offers_listing_idx ON item_offers(listing_id);
