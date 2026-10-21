-- 063_store_sales_stock_sync_trigger.sql
--
-- A rejected store sale is void: the goods did not leave the store. But
-- rejecting a sale only flipped a status column. The bags that were deducted
-- when the sale was logged were never returned to the shelf, so the store
-- balance stayed understated forever.
--
-- This migration makes the stock ledger follow the sale status:
--
--     A sale holds stock  <=>  its status is not 'Rejected'
--
-- and enforces it with a trigger, so every write path is covered -- the admin
-- reject, the broker reject, the resubmit, the store officer's edit, the price
-- adjustment flows, and any path added later. There is no way to change a
-- sale's status or its basket without the stock moving with it.
--
-- The rules, for a sale moving from OLD to NEW:
--
--     held -> held          release OLD basket, take NEW basket   (an edit)
--     held -> not held      release OLD basket                   (a rejection)
--     not held -> held      take NEW basket                      (a resubmit)
--     not held -> not held  nothing                              (no claim either way)
--
-- Rejecting an already rejected sale only edits the reason, so it is a
-- no-op for stock: the second rejection cannot return the same bags twice.
--
-- The trigger is deliberately the only place that moves stock for a sale that
-- already exists. log_store_sale (migration 061) owns the deduction when a
-- sale is first recorded, and update_store_sale (migration 062) deliberately
-- does not touch balances -- otherwise the two would both move the stock.

CREATE OR REPLACE FUNCTION public.store_sales_stock_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_held_before boolean;
  v_held_after  boolean;
  v_product     text;
  v_delta       int;
  v_needed      int;
  v_available   int;
  v_row         record;
BEGIN
  -- Moving a sale between stores would split its claim across two shelves.
  IF OLD.store_name IS DISTINCT FROM NEW.store_name THEN
    RAISE EXCEPTION 'a sale cannot be moved between stores';
  END IF;

  -- A sale holds stock exactly while it is not rejected.
  v_held_before := (OLD.status IS DISTINCT FROM 'Rejected');
  v_held_after  := (NEW.status IS DISTINCT FROM 'Rejected');

  -- Nothing to do when neither the claim nor the basket changed. This is the
  -- path taken by posting a sale, stamping posted_by, denying a price and so
  -- on, so it has to stay cheap.
  IF v_held_before = v_held_after
     AND OLD.items IS NOT DISTINCT FROM NEW.items THEN
    RETURN NEW;
  END IF;

  -- Work out the net movement per product, then apply it in a deterministic
  -- product order so two sales touching the same store cannot deadlock.
  FOR v_row IN
    WITH old_items AS (
      SELECT item->>'product' AS product,
             SUM(COALESCE((item->>'quantity')::int, 0)) AS qty
      FROM jsonb_array_elements(COALESCE(OLD.items, '[]'::jsonb)) item
      GROUP BY 1
    ),
    new_items AS (
      SELECT item->>'product' AS product,
             SUM(COALESCE((item->>'quantity')::int, 0)) AS qty
      FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb)) item
      GROUP BY 1
    ),
    merged AS (
      SELECT COALESCE(o.product, n.product) AS product,
             COALESCE(o.qty, 0) AS old_qty,
             COALESCE(n.qty, 0) AS new_qty
      FROM old_items o FULL OUTER JOIN new_items n ON o.product = n.product
    )
    SELECT product,
           CASE
             WHEN v_held_before AND v_held_after     THEN old_qty - new_qty
             WHEN v_held_before AND NOT v_held_after THEN old_qty
             WHEN NOT v_held_before AND v_held_after THEN -new_qty
             ELSE 0
           END AS delta
    FROM merged
    WHERE product IS NOT NULL
    ORDER BY product
  LOOP
    v_delta := v_row.delta;
    CONTINUE WHEN v_delta = 0;

    -- Taking more bags out than the shelf holds has to fail loudly, and it
    -- has to fail before anything is written.
    IF v_delta < 0 THEN
      SELECT balance INTO v_available
        FROM store_stock
        WHERE store_name = NEW.store_name AND product = v_row.product;
      v_needed := -v_delta;
      IF v_available IS NULL OR v_available < v_needed THEN
        RAISE EXCEPTION 'insufficient_stock: not enough % stock (have %, need %)',
          v_row.product, COALESCE(v_available, 0), v_needed;
      END IF;
    END IF;

    PERFORM adjust_store_stock(NEW.store_name, v_row.product, v_delta);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_sales_stock_sync ON store_sales;
CREATE TRIGGER trg_store_sales_stock_sync
  BEFORE UPDATE ON store_sales
  FOR EACH ROW
  EXECUTE FUNCTION store_sales_stock_sync();

-- The trigger function moves stock, so it is server side only. A trigger
-- function cannot be called directly, but there is no reason to leave it
-- executable by the browser keys.
REVOKE ALL ON FUNCTION public.store_sales_stock_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_sales_stock_sync() TO service_role;
