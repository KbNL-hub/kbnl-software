-- Refactor store_sales from per-product rows to one row per sale with
-- a JSONB items array.  Each sale becomes a single atomic record.
--
-- Phase 1: Add new columns (items, total_amount, total_quantity)
-- Phase 2: Migrate existing data into items array
-- Phase 3: Create triggers to auto-compute total_amount / total_quantity
-- Phase 4: Update price_adjustments unique constraint

-- ============================================================
-- PHASE 1: Add new columns (nullable for now)
-- ============================================================
ALTER TABLE store_sales ADD COLUMN items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE store_sales ADD COLUMN total_amount NUMERIC DEFAULT 0;
ALTER TABLE store_sales ADD COLUMN total_quantity INTEGER DEFAULT 0;

-- ============================================================
-- PHASE 2: Migrate existing data into items array
-- ============================================================

-- 2a. For rows that belong to a group (group_id IS NOT NULL),
-- consolidate into one row per group with a multi-item array.
-- We keep the row with the earliest created_at as the "base" and
-- fold the rest into its items array.

-- First, build the consolidated items per group_id
WITH grouped AS (
  SELECT
    group_id,
    jsonb_agg(
      jsonb_build_object(
        'product',       product,
        'quantity',      quantity,
        'price_per_bag', price_per_bag,
        'company_price', company_price,
        'price_reason',  price_reason
      ) ORDER BY created_at
    ) AS consolidated_items,
    SUM(quantity)  AS sum_quantity,
    SUM(COALESCE(total_amount, quantity * price_per_bag)) AS sum_amount,
    MIN(sale_id)   AS keep_sale_id
  FROM store_sales
  WHERE group_id IS NOT NULL
  GROUP BY group_id
),
-- Update the kept row with consolidated items
updated AS (
  UPDATE store_sales ss
  SET
    items          = g.consolidated_items,
    total_quantity = g.sum_quantity,
    total_amount   = g.sum_amount
  FROM grouped g
  WHERE ss.sale_id = g.keep_sale_id
  RETURNING ss.sale_id
)
-- Delete the non-kept rows in each group
DELETE FROM store_sales ss
USING grouped g
WHERE ss.group_id = g.group_id
  AND ss.sale_id != g.keep_sale_id;

-- 2b. For rows WITHOUT a group_id (individual sales),
-- convert each to a single-item array.
UPDATE store_sales
SET
  items = jsonb_build_array(
    jsonb_build_object(
      'product',       product,
      'quantity',      quantity,
      'price_per_bag', price_per_bag,
      'company_price', company_price,
      'price_reason',  price_reason
    )
  ),
  total_quantity = quantity,
  total_amount   = COALESCE(quantity, 0) * COALESCE(price_per_bag, 0)
WHERE group_id IS NULL;

-- ============================================================
-- PHASE 3: Triggers to auto-compute total_amount / total_quantity
-- ============================================================

CREATE OR REPLACE FUNCTION store_sales_items_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item JSONB;
  qty  INT;
  price NUMERIC;
BEGIN
  IF NEW.items IS NULL OR jsonb_array_length(NEW.items) = 0 THEN
    NEW.total_quantity := 0;
    NEW.total_amount   := 0;
  ELSE
    NEW.total_quantity := 0;
    NEW.total_amount   := 0;
    FOR item IN SELECT jsonb_array_elements(NEW.items)
    LOOP
      qty   := COALESCE((item->>'quantity')::int, 0);
      price := COALESCE((item->>'price_per_bag')::numeric, 0);
      NEW.total_quantity := NEW.total_quantity + qty;
      NEW.total_amount   := NEW.total_amount + (qty * price);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_store_sales_items_totals
  BEFORE INSERT OR UPDATE ON store_sales
  FOR EACH ROW
  EXECUTE FUNCTION store_sales_items_totals();

-- ============================================================
-- PHASE 4: Update price_adjustments unique constraint
-- ============================================================

-- Drop the old constraint that only allows one adjustment per source
ALTER TABLE price_adjustments
  DROP CONSTRAINT IF EXISTS unique_price_adjustment_source;

-- New constraint: one adjustment per (source_type, source_id, product)
ALTER TABLE price_adjustments
  ADD CONSTRAINT unique_price_adjustment_source_product
  UNIQUE (source_type, source_id, product);

-- Keep a separate unique constraint for stop rows (source_type, source_id only)
-- to allow multiple stops with same source_type+source_id but different products
-- (already handled by the above constraint which includes product)
