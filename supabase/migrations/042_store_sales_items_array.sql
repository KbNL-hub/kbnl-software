-- Refactor store_sales from per-product rows to one row per sale with
-- a JSONB items array.  Each sale becomes a single atomic record.
--
-- Idempotent: safe to re-run if partially applied.

-- ============================================================
-- PHASE 1: Add new columns (nullable for now)
-- ============================================================

-- items column
DO $$ BEGIN
  ALTER TABLE store_sales ADD COLUMN items JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- total_amount: drop if generated, re-add as regular column
DO $$ BEGIN
  ALTER TABLE store_sales DROP COLUMN total_amount;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE store_sales ADD COLUMN total_amount NUMERIC DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- total_quantity
DO $$ BEGIN
  ALTER TABLE store_sales ADD COLUMN total_quantity INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- PHASE 2: Migrate existing data into items array
-- ============================================================

-- 2a. For rows that belong to a group (group_id IS NOT NULL),
-- consolidate into one row per group with a multi-item array.
-- We keep the row with the earliest created_at as the "base" and
-- fold the rest into its items array.

-- Only run if items is still empty (migration hasn't run yet)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM store_sales WHERE items = '[]'::jsonb LIMIT 1) THEN

    -- Consolidate grouped rows
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
        SUM(COALESCE(quantity * price_per_bag, 0)) AS sum_amount,
        (ARRAY_AGG(sale_id ORDER BY created_at))[1] AS keep_sale_id
      FROM store_sales
      WHERE group_id IS NOT NULL
        AND items = '[]'::jsonb
      GROUP BY group_id
    ),
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
    DELETE FROM store_sales ss
    USING grouped g
    WHERE ss.group_id = g.group_id
      AND ss.sale_id != g.keep_sale_id;

    -- Convert ungrouped rows to single-item arrays
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
    WHERE group_id IS NULL
      AND items = '[]'::jsonb;

  END IF;
END $$;

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

DROP TRIGGER IF EXISTS trg_store_sales_items_totals ON store_sales;
CREATE TRIGGER trg_store_sales_items_totals
  BEFORE INSERT OR UPDATE OF items ON store_sales
  FOR EACH ROW
  EXECUTE FUNCTION store_sales_items_totals();

-- ============================================================
-- PHASE 4: Drop legacy per-row columns (data now in items array)
-- ============================================================

-- Drop product, quantity, price_per_bag, company_price, price_reason
-- All data is now in the items JSONB array.
DO $$ BEGIN
  ALTER TABLE store_sales DROP COLUMN product;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE store_sales DROP COLUMN quantity;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE store_sales DROP COLUMN price_per_bag;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE store_sales DROP COLUMN company_price;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE store_sales DROP COLUMN price_reason;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- ============================================================
-- PHASE 5: Update price_adjustments unique constraint
-- ============================================================

-- Drop the old constraint that only allows one adjustment per source
ALTER TABLE price_adjustments
  DROP CONSTRAINT IF EXISTS unique_price_adjustment_source;

-- New constraint: one adjustment per (source_type, source_id, product)
DO $$ BEGIN
  ALTER TABLE price_adjustments
    ADD CONSTRAINT unique_price_adjustment_source_product
    UNIQUE (source_type, source_id, product);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL;
END $$;
