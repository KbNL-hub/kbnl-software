-- Add bags_supplied column to track cumulative supply
-- NOTE: Backfill for 'supplied' rows and constraints are added in migration 047.
ALTER TABLE new_bookings ADD COLUMN IF NOT EXISTS bags_supplied integer NOT NULL DEFAULT 0;

-- Update status check constraint to include 'partial'
ALTER TABLE new_bookings DROP CONSTRAINT IF EXISTS new_bookings_status_check;
ALTER TABLE new_bookings ADD CONSTRAINT new_bookings_status_check
  CHECK (status IN ('pending', 'awaiting_review', 'rejected', 'supplied', 'partial'));

-- Create supply events history table
CREATE TABLE IF NOT EXISTS booking_supply_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES new_bookings(id) ON DELETE CASCADE,
  bags_supplied integer NOT NULL CHECK (bags_supplied > 0),
  supply_date date NOT NULL,
  supplied_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_supply_events_booking_id ON booking_supply_events(booking_id);

ALTER TABLE booking_supply_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read booking_supply_events"
  ON booking_supply_events FOR SELECT
  TO authenticated
  USING (true);
