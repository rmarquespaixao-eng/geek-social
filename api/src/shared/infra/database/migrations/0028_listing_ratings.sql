CREATE TABLE listing_ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id   UUID NOT NULL REFERENCES item_offers(id) ON DELETE CASCADE,
  rater_id   UUID NOT NULL REFERENCES users(id),
  ratee_id   UUID NOT NULL REFERENCES users(id),
  score      SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (offer_id, rater_id)
);
--> statement-breakpoint
CREATE INDEX listing_ratings_ratee_idx ON listing_ratings(ratee_id);
--> statement-breakpoint
CREATE INDEX listing_ratings_offer_idx ON listing_ratings(offer_id);
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'rating_received';
