-- Add order_no and child_order_no columns for HBM Mfamosing trips
-- Existing ATC column is preserved for backwards compatibility

ALTER TABLE "Trips" ADD COLUMN IF NOT EXISTS order_no text;
ALTER TABLE "Trips" ADD COLUMN IF NOT EXISTS child_order_no text;

ALTER TABLE dd_trips ADD COLUMN IF NOT EXISTS order_no text;
ALTER TABLE dd_trips ADD COLUMN IF NOT EXISTS child_order_no text;
