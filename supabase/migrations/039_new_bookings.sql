-- Migration 039: New Bookings feature
-- Brokers create bookings; ATC officers supply them.
-- Status lifecycle: pending -> supplied
--   or: pending -> awaiting_review -> pending -> supplied
--   or: pending -> awaiting_review -> rejected (editable, resubmittable)

CREATE TABLE IF NOT EXISTS new_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES auth.users(id),
  customer_id UUID REFERENCES "Customers"(customer_id),
  customer_name text,
  area text NOT NULL,
  product text NOT NULL,
  location text NOT NULL,
  number_of_bags integer NOT NULL CHECK (number_of_bags > 0),
  rate_per_bag numeric NOT NULL CHECK (rate_per_bag >= 0),
  total_amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awaiting_review', 'rejected', 'supplied')),
  price_reason text,
  supply_date date,
  supplied_by UUID REFERENCES auth.users(id),
  rejection_reason text,
  reviewed_by UUID,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_new_bookings_broker_id ON new_bookings (broker_id);
CREATE INDEX IF NOT EXISTS idx_new_bookings_status ON new_bookings (status);
CREATE INDEX IF NOT EXISTS idx_new_bookings_payment_date ON new_bookings (payment_date);
CREATE INDEX IF NOT EXISTS idx_new_bookings_created_at ON new_bookings (created_at);

-- RLS: authenticated users may read; writes go through service-role API routes.
ALTER TABLE new_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read on new_bookings" ON new_bookings;
CREATE POLICY "Allow authenticated read on new_bookings"
  ON new_bookings FOR SELECT TO authenticated USING (true);
