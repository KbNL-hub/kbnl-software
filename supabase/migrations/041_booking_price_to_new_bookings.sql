-- Add company_price column to new_bookings
ALTER TABLE new_bookings ADD COLUMN IF NOT EXISTS company_price numeric;

-- Backfill company_price from company_prices table
UPDATE new_bookings nb
SET company_price = cp.price
FROM company_prices cp
WHERE nb.area = cp.area AND nb.product = cp.product AND nb.company_price IS NULL;

-- Delete all new_booking records from price_adjustments (they don't belong there)
DELETE FROM price_adjustments WHERE source_type = 'new_booking';
