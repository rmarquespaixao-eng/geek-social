-- Item 7: marketplace de trocas/vendas (sem sistema de pagamento integrado)
-- Owner sinaliza item disponível; outros user fazem oferta (compra ou troca);
-- aceitação seguida de dupla confirmação destrava transferência do item.

CREATE TYPE "item_availability" AS ENUM ('none', 'sale', 'trade', 'both');
--> statement-breakpoint
CREATE TYPE "offer_type" AS ENUM ('buy', 'trade');
--> statement-breakpoint
CREATE TYPE "offer_status" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled', 'completed');
--> statement-breakpoint

ALTER TABLE "items"
  ADD COLUMN "availability" "item_availability" NOT NULL DEFAULT 'none',
  ADD COLUMN "asking_price" numeric(12, 2);
--> statement-breakpoint

CREATE INDEX "items_availability_idx" ON "items" ("availability") WHERE "availability" <> 'none';
--> statement-breakpoint

CREATE TABLE "item_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" "offer_type" NOT NULL,
  "item_id" uuid NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "offerer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "offered_item_id" uuid REFERENCES "items"("id") ON DELETE SET NULL,
  "offered_price" numeric(12, 2),
  "message" text,
  "status" "offer_status" NOT NULL DEFAULT 'pending',
  "offerer_confirmed_at" timestamp with time zone,
  "owner_confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "offer_buy_has_price" CHECK ("type" <> 'buy' OR "offered_price" IS NOT NULL),
  CONSTRAINT "offer_trade_has_item" CHECK ("type" <> 'trade' OR "offered_item_id" IS NOT NULL),
  CONSTRAINT "offer_owner_neq_offerer" CHECK ("owner_id" <> "offerer_id")
);
--> statement-breakpoint

-- Uma oferta pendente por par (item, offerer) — anti-spam
CREATE UNIQUE INDEX "item_offers_pending_unique" ON "item_offers" ("item_id", "offerer_id") WHERE "status" = 'pending';
--> statement-breakpoint

-- Listagem de "ofertas recebidas" do owner
CREATE INDEX "item_offers_owner_status_idx" ON "item_offers" ("owner_id", "status", "created_at" DESC);
--> statement-breakpoint

-- Listagem de "ofertas enviadas" pelo offerer
CREATE INDEX "item_offers_offerer_status_idx" ON "item_offers" ("offerer_id", "status", "created_at" DESC);
