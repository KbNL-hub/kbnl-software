-- Add actual_location column to trip_payments
-- This allows ATC officers to record the real location visited,
-- separate from the estimated location used for cost calculation.
ALTER TABLE trip_payments ADD COLUMN IF NOT EXISTS actual_location text;
