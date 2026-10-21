-- 062_atomic_store_sale_update.sql
--
-- Editing a logged sale changes how many bags left the store, so the sale row
-- and the stock balances have to move together.
--
-- The dashboard used to read the balance on the client, work out
-- `balance + delta`, and write that absolute value back:
--
--   const { data: stockRow } = await supabase.from("store_stock")
--     .select("balance").eq("store_name", ...).eq("product", ...).single()
--   ...
--   { action: "update", table: "store_stock",
--     data: { balance: stockRow.balance + adj.delta },
--     filters: { store_name, product } }
--
-- That is a read-modify-write across two round trips with no lock. A sale
-- that was deducted between the read and the write had its deduction
-- overwritten and lost, with no error anywhere. The same pattern was used to
-- credit incoming supply.
--
-- update_store_sale recomputes the stock delta server side from the stored
-- sale items -- so the client cannot disagree with the ledger about what was
-- sold -- and applies it together with the sale update in one transaction.
-- A sale is only updated if every stock movement it implies succeeds.

-- The stock movement is applied by the trg_store_sales_stock_sync trigger
-- (migration 063), which owns every stock change that follows a sale being
-- updated: the sale's status decides whether it still holds stock, and the
-- basket decides how much. This function therefore only validates the payload
-- and updates the row -- it must not adjust balances itself, or the trigger
-- and the function would both move the stock.
--
-- A trigger is used rather than code in this function because a sale's status
-- and basket are changed from several places: the store officer's edit, the
-- admin reject and resubmit, the broker reject and confirm, and the price
-- adjustment flows. A trigger covers all of them, including any path added
-- later, so the stock can never drift from the sale.

CREATE OR REPLACE FUNCTION public.update_store_sale(
  p_sale_id uuid,
  p_sale    jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row       store_sales%ROWTYPE;
  v_new_items jsonb;
  v_item      jsonb;
  v_product   text;
  v_status    text;
BEGIN
  IF p_sale_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'sale_id_required');
  END IF;

  SELECT * INTO v_row FROM store_sales WHERE sale_id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'sale_not_found');
  END IF;

  -- This endpoint is the Edit & Resubmit flow: a rejected sale is corrected
  -- and put back into the queue. A sale that is still live is edited through
  -- the normal flow, so it must not be resubmitted from here.
  IF v_row.status IS DISTINCT FROM 'Rejected' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'only_rejected_sales_can_be_resubmitted',
      'status', v_row.status
    );
  END IF;

  -- The resubmitted sale goes back into the queue as Pending (a broker sale
  -- awaiting confirmation) or Confirmed. Nothing else is a resubmission.
  v_status := p_sale->>'status';
  IF v_status IS NULL OR v_status NOT IN ('Pending', 'Confirmed') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'invalid_status', 'status', v_status
    );
  END IF;

  v_new_items := p_sale->'items';
  IF v_new_items IS NULL OR jsonb_typeof(v_new_items) <> 'array' OR jsonb_array_length(v_new_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'items_required');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_new_items) LOOP
    v_product := v_item->>'product';
    IF v_product IS NULL OR btrim(v_product) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'product_required');
    END IF;
    IF COALESCE((v_item->>'quantity')::int, 0) <= 0 THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'invalid_quantity',
        'product', v_product
      );
    END IF;
  END LOOP;

  -- Optional columns are only overwritten when the key is actually present in
  -- the payload, so an omitted key leaves the column alone while an explicit
  -- null still clears it.
  --
  -- The trigger fires on this statement and applies the stock movement the
  -- change implies. If the shelf cannot cover it the statement is rejected
  -- and nothing is written.
  UPDATE store_sales SET
    items            = v_new_items,
    customer_name    = CASE WHEN p_sale ? 'customer_name' THEN p_sale->>'customer_name' ELSE v_row.customer_name END,
    payment_mode     = COALESCE(p_sale->>'payment_mode', v_row.payment_mode),
    delivery_mode    = COALESCE(p_sale->>'delivery_mode', v_row.delivery_mode),
    tricycle_id      = CASE WHEN p_sale ? 'tricycle_id' THEN nullif(p_sale->>'tricycle_id', '')::uuid ELSE v_row.tricycle_id END,
    truck_plate      = CASE WHEN p_sale ? 'truck_plate' THEN p_sale->>'truck_plate' ELSE v_row.truck_plate END,
    bank_name        = CASE WHEN p_sale ? 'bank_name' THEN p_sale->>'bank_name' ELSE v_row.bank_name END,
    depositor_name   = CASE WHEN p_sale ? 'depositor_name' THEN p_sale->>'depositor_name' ELSE v_row.depositor_name END,
    driver_name      = CASE WHEN p_sale ? 'driver_name' THEN p_sale->>'driver_name' ELSE v_row.driver_name END,
    sold_at          = COALESCE(nullif(p_sale->>'sold_at', '')::timestamptz, v_row.sold_at),
    status           = v_status,
    rejection_reason = CASE WHEN p_sale ? 'rejection_reason' THEN p_sale->>'rejection_reason' ELSE v_row.rejection_reason END
  WHERE sale_id = p_sale_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_row.sale_id,
    'sale', to_jsonb(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_store_sale(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_store_sale(uuid, jsonb) TO service_role;
