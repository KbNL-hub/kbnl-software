-- 065_confirm_store_supply.sql
--
-- Lets an ATC officer, Admin, or SuperAdmin confirm a pending store supply for
-- a store that has no active store officer.
--
-- WHY
-- ---
-- A store supply could only be confirmed from the store officer dashboard, and
-- that flow requires an active store officer for the store. Stores without one
-- therefore kept their stops pending forever, and record_trip refuses to record
-- a trip while any stop is unconfirmed.
--
-- The existing store officer flow is also not atomic: it inserts the
-- confirmation, then the lines, then flips the stop, then adjusts stock, each in
-- a separate request. A failure part way leaves a half saved confirmation.
--
-- THE FIX
-- -------
-- confirm_store_supply() does the whole thing in one transaction behind a stop
-- row lock: re-check eligibility, validate the lines, insert the confirmation
-- and lines, mark the stop confirmed, and add the bags to store stock. Either
-- all of it commits or none of it does.

-- ================================================================
-- Audit columns: who confirmed the supply
-- ================================================================
ALTER TABLE store_supply_confirmations
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_by_name text,
  ADD COLUMN IF NOT EXISTS confirmed_by_role text;

-- Existing rows came from the store officer flow. Snapshot the officer's name
-- so Store Sales can show a person instead of a raw id.
UPDATE store_supply_confirmations c
SET confirmed_by = o.officer_id,
    confirmed_by_name = o.full_name,
    confirmed_by_role = 'StoreOfficer'
FROM store_officers o
WHERE c.officer_id = o.officer_id
  AND c.confirmed_by IS NULL
  AND c.officer_id IS NOT NULL;

-- ================================================================
-- confirm_store_supply: one atomic confirmation
-- ================================================================
CREATE OR REPLACE FUNCTION public.confirm_store_supply(
  p_stop_id            uuid,
  p_confirmed_by       uuid,
  p_confirmed_by_name  text,
  p_confirmed_by_role  text,
  p_lines              jsonb,
  p_discrepancy_note   text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stop             "Stops"%ROWTYPE;
  v_store            text;
  v_trip_id          uuid;
  v_total            int := 0;
  v_discrepancy      int;
  v_line             jsonb;
  v_product          text;
  v_product_key      text;
  v_qty              int;
  v_seen             text[] := '{}';
  v_confirmation_id  uuid;
  v_confirmed_at     timestamptz;
  v_recorded         boolean;
  v_posted           boolean;
BEGIN
  -- The route already checked the role, but the function refuses an actor it
  -- was not built for if it is ever called directly.
  IF p_confirmed_by IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;
  IF p_confirmed_by_role IS NULL
     OR p_confirmed_by_role NOT IN ('ATCOfficer', 'Admin', 'SuperAdmin') THEN
    RAISE EXCEPTION 'invalid_actor_role';
  END IF;
  IF p_confirmed_by_name IS NULL OR btrim(p_confirmed_by_name) = '' THEN
    RAISE EXCEPTION 'actor_name_required';
  END IF;

  -- Lock the stop first. A second confirmation for the same stop waits here,
  -- then sees confirmed = true and is rejected instead of double booking stock.
  SELECT * INTO v_stop
    FROM "Stops"
    WHERE stop_id = p_stop_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stop_not_found';
  END IF;
  IF v_stop.stop_type IS DISTINCT FROM 'store' THEN
    RAISE EXCEPTION 'not_store_stop';
  END IF;
  IF v_stop.disputed THEN
    RAISE EXCEPTION 'stop_disputed';
  END IF;
  IF v_stop.confirmed THEN
    RAISE EXCEPTION 'already_confirmed';
  END IF;

  v_store := COALESCE(
    NULLIF(btrim(v_stop.store_name), ''),
    NULLIF(btrim(v_stop.stop_location), '')
  );
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'store_required';
  END IF;

  -- A recorded or posted trip must never move backwards. Normal trips live in
  -- Trips; DD trips live in dd_trips with the same id carried on the stop.
  v_trip_id := v_stop.trip_id;
  IF v_trip_id IS NOT NULL THEN
    SELECT recorded, posted INTO v_recorded, v_posted
      FROM "Trips" WHERE trip_id = v_trip_id;
    IF FOUND AND (COALESCE(v_recorded, false) OR COALESCE(v_posted, false)) THEN
      RAISE EXCEPTION 'trip_locked';
    END IF;

    SELECT recorded, posted INTO v_recorded, v_posted
      FROM dd_trips WHERE dd_trip_id = v_trip_id;
    IF FOUND AND (COALESCE(v_recorded, false) OR COALESCE(v_posted, false)) THEN
      RAISE EXCEPTION 'trip_locked';
    END IF;
  END IF;

  -- Only an Active officer blocks ATC. Invited and Suspended officers do not.
  -- Names are compared trimmed and case insensitive, matching the eligibility
  -- endpoint the browser used to show the action.
  IF EXISTS (
    SELECT 1
      FROM store_officers o
      WHERE lower(btrim(o.store_name)) = lower(v_store)
        AND o.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'active_officer_exists';
  END IF;

  -- Validate every line before writing anything.
  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines_required';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_product := btrim(COALESCE(v_line->>'product', ''));
    v_product_key := lower(v_product);

    IF v_product = '' THEN
      RAISE EXCEPTION 'product_required';
    END IF;
    IF (v_line->>'quantity') IS NULL
       OR (v_line->>'quantity') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    -- Keep out of range input a validation error instead of a 500 from the int
    -- cast. 2147483647 is the largest int Postgres accepts.
    IF length(v_line->>'quantity') > 10 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    IF (v_line->>'quantity')::bigint > 2147483647 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    v_qty := (v_line->>'quantity')::int;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    IF v_product_key = ANY(v_seen) THEN
      RAISE EXCEPTION 'duplicate_product';
    END IF;

    v_seen := array_append(v_seen, v_product_key);
    v_total := v_total + v_qty;
  END LOOP;

  v_discrepancy := v_total - COALESCE(v_stop.quantity_offloaded, 0);
  IF v_discrepancy <> 0
     AND (p_discrepancy_note IS NULL OR btrim(p_discrepancy_note) = '') THEN
    RAISE EXCEPTION 'discrepancy_note_required';
  END IF;

  INSERT INTO store_supply_confirmations (
    stop_id,
    officer_id,
    store_name,
    confirmed_by,
    confirmed_by_name,
    confirmed_by_role,
    discrepancy_quantity,
    discrepancy_note
  ) VALUES (
    p_stop_id,
    NULL,
    v_store,
    p_confirmed_by,
    btrim(p_confirmed_by_name),
    p_confirmed_by_role,
    v_discrepancy,
    NULLIF(btrim(COALESCE(p_discrepancy_note, '')), '')
  )
  RETURNING confirmation_id, confirmed_at
  INTO v_confirmation_id, v_confirmed_at;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_product := btrim(v_line->>'product');
    v_qty := (v_line->>'quantity')::int;

    INSERT INTO store_supply_lines (confirmation_id, product, quantity)
    VALUES (v_confirmation_id, v_product, v_qty);

    -- adjust_store_stock locks the store_stock row and adds the delta, so a
    -- concurrent sale cannot clobber this receipt.
    PERFORM adjust_store_stock(v_store, v_product, v_qty);
  END LOOP;

  UPDATE "Stops"
    SET confirmed = true,
        updated_by = p_confirmed_by
    WHERE stop_id = p_stop_id;

  RETURN jsonb_build_object(
    'success', true,
    'confirmation_id', v_confirmation_id,
    'stop_id', p_stop_id,
    'store_name', v_store,
    'total_quantity', v_total,
    'discrepancy_quantity', v_discrepancy,
    'confirmed_at', v_confirmed_at,
    'confirmed_by_name', btrim(p_confirmed_by_name),
    'confirmed_by_role', p_confirmed_by_role
  );
END;
$$;

-- Server side only. The browser must not call this with the anon or
-- authenticated key; the trips route uses the service role after its own role
-- check.
REVOKE ALL ON FUNCTION public.confirm_store_supply(uuid, uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_store_supply(uuid, uuid, text, text, jsonb, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
