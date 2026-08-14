-- Add group_id for grouping related store sale price_adjustments.
-- Add unique constraint on (source_type, source_id) to prevent duplicates.

-- 1. Add group_id to store_sales
ALTER TABLE store_sales ADD COLUMN group_id TEXT;

-- 2. Add group_id to price_adjustments
ALTER TABLE price_adjustments ADD COLUMN group_id TEXT;

-- 3. Prevent duplicate price_adjustments for the same source
ALTER TABLE price_adjustments ADD CONSTRAINT unique_price_adjustment_source UNIQUE (source_type, source_id);
