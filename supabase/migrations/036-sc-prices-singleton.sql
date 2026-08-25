-- Migration 036: Enforce singleton sc_prices + store applied rate per trip
--
-- Idempotent: safe to run regardless of whether 035 was applied.

-- 1. Ensure sc_prices table exists (covers fresh installs where 035 hasn't run)
CREATE TABLE IF NOT EXISTS sc_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_per_bag numeric NOT NULL DEFAULT 600 CHECK (rate_per_bag > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed exactly one row if the table is empty
INSERT INTO sc_prices (rate_per_bag)
SELECT 600 WHERE NOT EXISTS (SELECT 1 FROM sc_prices);

-- 3. Singleton constraint: unique index on a constant ensures at most one row
CREATE UNIQUE INDEX IF NOT EXISTS sc_prices_singleton_idx ON sc_prices ((true));

-- 4. RLS
ALTER TABLE sc_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read on sc_prices" ON sc_prices;
CREATE POLICY "Allow authenticated read on sc_prices"
  ON sc_prices FOR SELECT TO authenticated USING (true);

-- 5. Store the applied SC rate on each trip_payments row so the UI never
--    mislabels a historical value with the current rate.
ALTER TABLE trip_payments ADD COLUMN IF NOT EXISTS sc_rate numeric;

-- 6. Backfill existing SC trips (all were created at the original ₦600 rate)
UPDATE trip_payments SET sc_rate = 600 WHERE trip_type = 'SC' AND sc_rate IS NULL;
