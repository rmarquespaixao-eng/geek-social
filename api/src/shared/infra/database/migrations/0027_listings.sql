-- listing_status enum
CREATE TYPE listing_status AS ENUM ('active', 'paused', 'closed');

-- listings: um anúncio por item (max 1 ativo via unique index condicional)
CREATE TABLE listings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id               UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  owner_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  availability          item_availability NOT NULL,         -- sale | trade | both (nunca 'none')
  asking_price          NUMERIC(10, 2),                    -- null para trade puro
  payment_methods       TEXT[] NOT NULL DEFAULT '{}',      -- pix | money | transfer | card | negotiate
  status                listing_status NOT NULL DEFAULT 'active',
  disclaimer_accepted_at TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX listings_item_active_uniq
  ON listings(item_id)
  WHERE status = 'active';

CREATE INDEX listings_owner_status_idx ON listings(owner_id, status, created_at DESC);
CREATE INDEX listings_active_updated_idx ON listings(updated_at DESC) WHERE status = 'active';
