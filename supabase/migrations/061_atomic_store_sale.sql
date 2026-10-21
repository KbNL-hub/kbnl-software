-- 061_atomic_store_sale.sql
--
-- Makes "log a store sale" a single atomic database transaction and removes the
-- read-modify-write patterns that silently clobbered concurrent deductions.
--
-- THE BUG
-- -------
-- The store officer dashboard logged a sale in two separate HTTP requests:
--   1. POST /api/mutations/finance { action: "insert", table: "store_sales" }
--   2. POST /api/mutations/finance { action: "rpc", function: "decrement_store_stock" }
--      (repeated once per sale line)
-- Those are two or more independent database transactions. The sale row was
-- committed by step 1, so if step 2 failed the sale existed with no stock
-- deduction at all. For a multi-line sale the loop bailed out on the first
-- failure, leaving the earlier lines deducted and the later ones not.
--
-- Step 2 could fail because:
--   - the client-side stock pre-check used a 120s-stale snapshot and passed a
--     sale the database then rejected as insufficient_stock,
--   - the request was dropped / the page was closed mid-flow,
--   - the product had no store_stock row for that store.
--
-- The supply-confirmation and sale-edit paths had the same class of problem in
-- a different shape: they read `balance` on the client and wrote back
-- `balance = <read value> + delta`. A deduction that landed between the read
-- and the write was overwritten, so the deduction was lost with no error.
--
-- THE FIX
-- -------
--   1. log_store_sale()  - inserts the sale AND deducts every line's stock in
--                          one transaction. Either everything happens or
--                          nothing does.
--   2. adjust_store_stock() - atomic signed adjustment. Locks the row, then
--                          applies the delta to the locked value, so a
--                          concurrent deduction is never clobbered.

-- ================================================================
-- adjust_store_stock: atomic signed balance adjustment
-- ================================================================
CREATE OR REPLACE FUNCTION public.adjust_store_stock(
  p_store   text,
  p_product text,
  p_delta   int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance int;
  v_new     int;
BEGIN
  IF p_store IS NULL OR btrim(p_store) = '' THEN
    RAISE EXCEPTION 'store_required';
  END IF;
  IF p_product IS NULL OR btrim(p_product) = '' THEN
    RAISE EXCEPTION 'product_required';
  END IF;

  -- Lock the row so the value we read cannot change under us.
  SELECT balance INTO v_balance
    FROM store_stock
    WHERE store_name = p_store AND product = p_product
    FOR UPDATE;

  IF v_balance IS NULL THEN
    -- No stock row for this store/product yet. Only a positive delta can
    -- create one; a negative delta against a missing row is insufficient.
    IF p_delta < 0 THEN
      RAISE EXCEPTION 'insufficient_stock';
    END IF;
    INSERT INTO store_stock (store_name, product, balance, updated_at)
    VALUES (p_store, p_product, p_delta, now())
    ON CONFLICT (store_name, product)
    DO UPDATE SET balance = store_stock.balance + p_delta, updated_at = now();
    RETURN p_delta;
  END IF;

  v_new := v_balance + p_delta;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;

  UPDATE store_stock SET balance = v_new, updated_at = now()
    WHERE store_name = p_store AND product = p_product;
  RETURN v_new;
END;
$$;

-- ================================================================
-- log_store_sale: insert the sale and deduct stock atomically
--
-- p_sale is the same payload the client used to POST to the generic insert
-- endpoint. Quantity is aggregated per product so a sale that lists the same
-- product on two lines (grouped broker sales) is validated and deducted as a
-- single total rather than line by line.
-- ================================================================
CREATE OR REPLACE FUNCTION public.log_store_sale(
  p_sale jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store    text;
  v_items    jsonb;
  v_item     jsonb;
  v_product  text;
  v_qty      int;
  v_balance  int;
  v_needed   int;
  v_sale_id  uuid;
  v_status   text;
  v_row      store_sales%ROWTYPE;
BEGIN
  IF p_sale IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'sale_payload_required');
  END IF;

  v_store := p_sale->>'store_name';
  v_items := p_sale->'items';

  IF v_store IS NULL OR btrim(v_store) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_required');
  END IF;
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'items_required');
  END IF;

  -- Validate every line up front, before anything is written.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product := v_item->>'product';
    v_qty := COALESCE((v_item->>'quantity')::int, 0);
    IF v_product IS NULL OR btrim(v_product) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'product_required');
    END IF;
    IF v_qty <= 0 THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'invalid_quantity',
        'product', v_product, 'quantity', v_qty
      );
    END IF;
  END LOOP;

  -- A sale is recorded as Pending (a broker sale awaiting confirmation) or
  -- Confirmed. Any other status would break the rule that a sale holds stock
  -- exactly while it is not rejected, so it is refused before anything is
  -- written.
  v_status := COALESCE(p_sale->>'status', 'Confirmed');
  IF v_status NOT IN ('Pending', 'Confirmed') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'invalid_status', 'status', v_status
    );
  END IF;

  -- Lock every affected stock row in a deterministic order so concurrent sales
  -- on the same store cannot deadlock or read a moving target.
  PERFORM 1
    FROM store_stock
    WHERE store_name = v_store
      AND product IN (
        SELECT DISTINCT item->>'product' FROM jsonb_array_elements(v_items) item
      )
    ORDER BY product
    FOR UPDATE;

  -- Check the whole basket before deducting any of it.
  FOR v_product, v_needed IN
    SELECT item->>'product', SUM((item->>'quantity')::int)
    FROM jsonb_array_elements(v_items) item
    GROUP BY item->>'product'
    ORDER BY item->>'product'
  LOOP
    SELECT balance INTO v_balance
      FROM store_stock
      WHERE store_name = v_store AND product = v_product;
    IF v_balance IS NULL OR v_balance < v_needed THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'insufficient_stock',
        'product', v_product,
        'available', COALESCE(v_balance, 0),
        'required', v_needed
      );
    END IF;
  END LOOP;

  -- Deduct. Still inside the same transaction as the insert below.
  FOR v_product, v_needed IN
    SELECT item->>'product', SUM((item->>'quantity')::int)
    FROM jsonb_array_elements(v_items) item
    GROUP BY item->>'product'
    ORDER BY item->>'product'
  LOOP
    UPDATE store_stock
    SET balance = balance - v_needed, updated_at = now()
    WHERE store_name = v_store AND product = v_product;
  END LOOP;

  -- Insert the sale. total_quantity / total_amount are filled in by the
  -- existing BEFORE INSERT trigger (store_sales_items_totals).
  INSERT INTO store_sales (
    officer_id, store_name, items, customer_name, payment_mode, delivery_mode,
    tricycle_id, truck_plate, broker_id, status, sale_type, sold_at,
    bank_name, depositor_name, driver_name
  ) VALUES (
    nullif(p_sale->>'officer_id', '')::uuid,
    v_store,
    v_items,
    nullif(p_sale->>'customer_name', ''),
    COALESCE(p_sale->>'payment_mode', 'Cash'),
    COALESCE(p_sale->>'delivery_mode', 'self'),
    nullif(p_sale->>'tricycle_id', '')::uuid,
    nullif(p_sale->>'truck_plate', ''),
    nullif(p_sale->>'broker_id', '')::uuid,
    v_status,
    COALESCE(p_sale->>'sale_type', 'direct'),    COALESCE(nullif(p_sale->>'sold_at', '')::timestamptz, now()),
    nullif(p_sale->>'bank_name', ''),
    nullif(p_sale->>'depositor_name', ''),
    nullif(p_sale->>'driver_name', '')
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_row.sale_id,
    'sale', to_jsonb(v_row)
  );
END;
$$;

-- ================================================================
-- Grants: these are server-side only (service role), never callable by the
-- browser with the anon/authenticated key.
-- ================================================================
REVOKE ALL ON FUNCTION public.adjust_store_stock(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_store_stock(text, text, int) TO service_role;

REVOKE ALL ON FUNCTION public.log_store_sale(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_store_sale(jsonb) TO service_role;
