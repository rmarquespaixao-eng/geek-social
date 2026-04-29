CREATE TYPE proposal_status AS ENUM ('pending', 'accepted', 'rejected', 'superseded');
--> statement-breakpoint
CREATE TABLE offer_proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id        UUID NOT NULL REFERENCES item_offers(id) ON DELETE CASCADE,
  proposer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offered_price   NUMERIC(12, 2),
  offered_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  message         TEXT,
  status          proposal_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX offer_proposals_offer_idx ON offer_proposals(offer_id, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX offer_proposals_one_pending_uniq
  ON offer_proposals(offer_id)
  WHERE status = 'pending';
--> statement-breakpoint
INSERT INTO offer_proposals (offer_id, proposer_id, offered_price, offered_item_id, message, status, created_at)
SELECT
  id, offerer_id, offered_price, offered_item_id, message,
  CASE
    WHEN status = 'pending'  THEN 'pending'::proposal_status
    WHEN status = 'accepted' THEN 'accepted'::proposal_status
    ELSE 'superseded'::proposal_status
  END,
  created_at
FROM item_offers;
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'counter_proposal_received';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'proposal_rejected';
