-- Price adjustment / discount review workflow.
-- When a broker confirms a sale at a price that differs from the company
-- price, the sale enters a "Pending" review queue instead of being
-- immediately confirmed.  Admins approve or deny from the Discounts section.

-- 1. New table: price_adjustments
CREATE TABLE price_adjustments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type   TEXT NOT NULL CHECK (source_type IN ('stop', 'store_sale')),
  source_id     UUID NOT NULL,
  broker_id     UUID NOT NULL,
  area          TEXT NOT NULL,
  product       TEXT NOT NULL,
  company_price NUMERIC NOT NULL,
  adjusted_price NUMERIC NOT NULL,
  price_reason  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending', 'Approved', 'Denied')),
  denial_reason TEXT,
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_price_adjustments_status ON price_adjustments (status);
CREATE INDEX idx_price_adjustments_source ON price_adjustments (source_type, source_id);

-- 2. Track discount lifecycle on source rows
ALTER TABLE "Stops"
  ADD COLUMN discount_status TEXT DEFAULT 'none';

ALTER TABLE "store_sales"
  ADD COLUMN discount_status TEXT DEFAULT 'none';

-- 3. Store company_price on store_sales (already on Stop_Confirmations)
ALTER TABLE "store_sales"
  ADD COLUMN company_price NUMERIC;
