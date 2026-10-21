-- 064_restore_stock_on_rejected_sales.sql
--
-- One-off correction of the residue left by the bug fixed in migration 063.
--
-- Four sales were rejected while rejecting a sale only flipped a status
-- column. Their stock was deducted when they were logged and never returned,
-- so those shelves have been short by the quantities below ever since. Put
-- the bags back so the balances agree with the rule the trigger now enforces:
--
--     A sale holds stock  <=>  its status is not 'Rejected'
--
-- The four sales are listed explicitly rather than picked up by a blanket
-- query, so this correction cannot pick up a sale that was rejected and
-- already restocked. The rows are also required to still be rejected and are
-- locked while they are processed, so a sale that was resubmitted in the
-- meantime is left alone.
--
-- This is a one-off repair and is applied once: running it twice would return
-- the same bags to the shelf twice.
--
--   Urua Ekpa Outlet  Supaset  x48   direct   rejected 2026-09-17
--   Uyo Depot         Classic  x20   broker   rejected 2026-09-24
--   E1 Outlet         Classic  x5    broker   rejected 2026-09-24
--   Brooks Outlet     Classic  x10   direct   rejected 2026-10-17

DO $$
DECLARE
  v_sale    record;
  v_item    jsonb;
  v_product text;
  v_qty     int;
BEGIN
  FOR v_sale IN
    SELECT sale_id, store_name, items
    FROM store_sales
    WHERE sale_id IN (
      '33f6b545-9f4c-4ed7-b5be-012fcc56107a',  -- Urua Ekpa Outlet, Supaset x48
      '6149adbe-6559-4a61-b407-1cbed786083a',  -- Uyo Depot, Classic x20
      'cb522106-5d71-416d-adef-02252cb831a8',  -- E1 Outlet, Classic x5
      '87d353e7-3c92-4093-a75d-d537d538e483'   -- Brooks Outlet, Classic x10
    )
      AND status = 'Rejected'
    FOR UPDATE
  LOOP
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_sale.items) LOOP
      v_product := v_item->>'product';
      v_qty := COALESCE((v_item->>'quantity')::int, 0);
      IF v_product IS NOT NULL AND v_qty > 0 THEN
        PERFORM adjust_store_stock(v_sale.store_name, v_product, v_qty);
        RAISE NOTICE 'restored % x % for sale %', v_qty, v_product, v_sale.sale_id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
