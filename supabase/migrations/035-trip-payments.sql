-- Migration 035: Trip Payment feature -- SC and MDD trip payment tracking
--
-- Repairs and supersedes the original (malformed) version of this file.
-- Fully idempotent: safe to re-run regardless of how much of the broken
-- version previously applied.

-- 1. Add trip_type column to Trips table ('SC' = Self Collect, 'MDD' = Modified Direct Delivery)
--    Existing trips are backfilled to 'SC' via the NOT NULL DEFAULT.
ALTER TABLE "Trips" ADD COLUMN IF NOT EXISTS trip_type text NOT NULL DEFAULT 'SC';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"Trips"'::regclass AND conname = 'trips_trip_type_check'
  ) THEN
    ALTER TABLE "Trips" ADD CONSTRAINT trips_trip_type_check CHECK (trip_type IN ('SC', 'MDD'));
  END IF;
END $$;

-- 2. Locations table for MDD payment destinations.
--    Managed entirely by admins via the Trip Payment section -- no seed data.
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL UNIQUE,
  cost_per_ton numeric NOT NULL DEFAULT 0 CHECK (cost_per_ton >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Payment record per trip, created automatically when a trip starts.
--    SC: value = SC_RATE_PER_BAG * quantity_loaded (computed at insert).
--    MDD: value is null until an admin selects a location, which sets
--    payment_expected = (quantity_loaded / 20) * locations.cost_per_ton.
CREATE TABLE IF NOT EXISTS trip_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL UNIQUE REFERENCES "Trips"(trip_id) ON DELETE CASCADE,
  trip_type text NOT NULL CHECK (trip_type IN ('SC', 'MDD')),
  plate_number text NOT NULL,
  tonnage numeric NOT NULL DEFAULT 0,
  quantity_loaded integer NOT NULL DEFAULT 0,
  value numeric,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  payment_expected numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Indexes for frequent lookups
CREATE INDEX IF NOT EXISTS idx_trip_payments_trip_type ON trip_payments (trip_type);
CREATE INDEX IF NOT EXISTS idx_trip_payments_location_id ON trip_payments (location_id);
CREATE INDEX IF NOT EXISTS idx_locations_location ON locations (location);

-- 5. RLS: authenticated users may read; writes go through service-role API routes.
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read on locations" ON locations;
CREATE POLICY "Allow authenticated read on locations"
  ON locations FOR SELECT TO authenticated USING (true);

ALTER TABLE trip_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read on trip_payments" ON trip_payments;
CREATE POLICY "Allow authenticated read on trip_payments"
  ON trip_payments FOR SELECT TO authenticated USING (true);

-- 6. SC price per bag — single-row config table.
--    Defaults to 600; admins update this via the "Update Price" CTA.
CREATE TABLE IF NOT EXISTS sc_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_per_bag numeric NOT NULL DEFAULT 600 CHECK (rate_per_bag > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sc_prices (rate_per_bag) VALUES (600);

ALTER TABLE sc_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read on sc_prices" ON sc_prices;
CREATE POLICY "Allow authenticated read on sc_prices"
  ON sc_prices FOR SELECT TO authenticated USING (true);
