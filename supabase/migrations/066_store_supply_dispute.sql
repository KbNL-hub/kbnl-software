-- 066_store_supply_dispute.sql
--
-- Lets a store officer dispute a pending store supply, and lets an ATC
-- officer, Admin, or SuperAdmin resolve that dispute with one atomic
-- reassignment.
--
-- WHY
-- ---
-- Store officers can confirm a supply but cannot reject one. When a driver
-- delivers to the wrong store or customer the officer has no safe action:
-- confirming moves stock into the wrong place, and leaving the stop pending
-- blocks trip recording.
--
-- The Stops table already carries disputed, dispute_reason, and disputed_by.
-- Brokers use those fields, and Monitor Trips already has a Disputed filter
-- and a resolve screen. This migration keeps that model, adds an audit name,
-- and moves the two write paths into transactional functions.
--
-- THE FIX
-- -------
-- dispute_store_supply() checks the officer, the store, and the stop state
-- under a row lock, then writes the dispute.
--
-- resolve_stop_dispute() checks the full destination set, reassigns the
-- original stop, inserts any split stops, and clears the active dispute in
-- one transaction. A short or broken destination set changes nothing.

-- ================================================================
-- Audit column: the name of the person who disputed the stop
-- ================================================================
ALTER TABLE public."Stops"
  ADD COLUMN IF NOT EXISTS disputed_by_name text;

-- Existing broker disputes predate the column. Copy the profile name so the
-- Monitor Trips screen can show a person instead of looking up a raw id.
UPDATE public."Stops" s
SET disputed_by_name = btrim(p.full_name)
FROM public."Profiles" p
WHERE s.disputed_by = p.user_id
  AND s.disputed_by_name IS NULL
  AND p.full_name IS NOT NULL
  AND btrim(p.full_name) <> '';

-- ================================================================
-- dispute_store_supply: one atomic store officer dispute
-- ================================================================
CREATE OR REPLACE FUNCTION public.dispute_store_supply(
  p_stop_id            uuid,
  p_disputed_by        uuid,
  p_disputed_by_name   text,
  p_reason             text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stop       "Stops"%ROWTYPE;
  v_store      text;
  v_officer    record;
  v_reason     text;
  v_trip_id    uuid;
  v_recorded   boolean;
  v_posted     boolean;
  v_plate      text;
BEGIN
  IF p_disputed_by IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  -- Lock the stop first. A confirmation, a second dispute, or a resolution
  -- racing on this row waits here and then sees the committed state.
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
  IF COALESCE(v_stop.confirmed, false) THEN
    RAISE EXCEPTION 'already_confirmed';
  END IF;
  IF COALESCE(v_stop.disputed, false) THEN
    RAISE EXCEPTION 'already_disputed';
  END IF;

  v_store := COALESCE(
    NULLIF(btrim(v_stop.store_name), ''),
    NULLIF(btrim(v_stop.stop_location), '')
  );
  IF v_store IS NULL THEN
    RAISE EXCEPTION 'store_required';
  END IF;

  -- One lookup proves both facts: the actor is an Active officer, and that
  -- officer is assigned to this stop's store. Names compare trimmed and case
  -- insensitive, matching the confirmation eligibility check.
  SELECT officer_id, full_name, store_name
  INTO v_officer
  FROM store_officers
  WHERE officer_id = p_disputed_by
    AND status = 'Active'
    AND lower(btrim(store_name)) = lower(v_store)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_assigned_officer';
  END IF;

  IF p_disputed_by_name IS NULL OR btrim(p_disputed_by_name) = '' THEN
    IF v_officer.full_name IS NULL OR btrim(v_officer.full_name) = '' THEN
      RAISE EXCEPTION 'actor_name_required';
    END IF;
    p_disputed_by_name := v_officer.full_name;
  END IF;

  -- A recorded or posted trip must never move backwards. Normal trips live in
  -- Trips; DD trips live in dd_trips with the same id carried on the stop.
  v_trip_id := v_stop.trip_id;
  IF v_trip_id IS NOT NULL THEN
    SELECT recorded, posted INTO v_recorded, v_posted
    FROM "Trips"
    WHERE trip_id = v_trip_id;
    IF FOUND AND (COALESCE(v_recorded, false) OR COALESCE(v_posted, false)) THEN
      RAISE EXCEPTION 'trip_locked';
    END IF;

    SELECT recorded, posted INTO v_recorded, v_posted
    FROM dd_trips
    WHERE dd_trip_id = v_trip_id;
    IF FOUND AND (COALESCE(v_recorded, false) OR COALESCE(v_posted, false)) THEN
      RAISE EXCEPTION 'trip_locked';
    END IF;
  END IF;

  -- A supply confirmation on an unconfirmed stop is a half saved legacy write.
  -- Refuse it rather than leave stock and a dispute pointing at each other.
  IF EXISTS (
    SELECT 1 FROM store_supply_confirmations WHERE stop_id = p_stop_id
  ) THEN
    RAISE EXCEPTION 'supply_confirmation_exists';
  END IF;

  UPDATE "Stops"
  SET disputed = true,
      dispute_reason = v_reason,
      disputed_by = p_disputed_by,
      disputed_by_name = btrim(p_disputed_by_name),
      updated_by = p_disputed_by
  WHERE stop_id = p_stop_id;

  IF v_trip_id IS NOT NULL THEN
    SELECT plate_number INTO v_plate
    FROM "Trips"
    WHERE trip_id = v_trip_id;
    IF v_plate IS NULL THEN
      SELECT plate_number INTO v_plate
      FROM dd_trips
      WHERE dd_trip_id = v_trip_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'stop_id', p_stop_id,
    'trip_id', v_trip_id,
    'store_name', v_store,
    'plate_number', COALESCE(v_plate, ''),
    'reason', v_reason,
    'disputed_by', p_disputed_by,
    'disputed_by_name', btrim(p_disputed_by_name),
    'disputed_at', now()
  );
END;
$$;

-- ================================================================
-- resolve_stop_dispute: one atomic reassignment
-- ================================================================
CREATE OR REPLACE FUNCTION public.resolve_supported_store_name(p_store_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_store text := NULLIF(btrim(p_store_name), '');
  v_supported_store text;
BEGIN
  IF v_requested_store IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.stores) THEN
    SELECT store_name
    INTO v_supported_store
    FROM public.stores
    WHERE lower(btrim(store_name)) = lower(v_requested_store)
    LIMIT 1;
  ELSE
    SELECT supported.store_name
    INTO v_supported_store
    FROM unnest(ARRAY[
      'Calabar Mini Depot',
      'Ikom Mini Depot',
      'Ogoja Depot',
      'Uyo Depot',
      'Brooks Outlet',
      'Urua Ekpa Outlet',
      'Urua Nyemeiko Outlet',
      'Reserve Store',
      'E1 Outlet',
      'Ogoja Outlet'
    ]) AS supported(store_name)
    WHERE lower(supported.store_name) = lower(v_requested_store)
    LIMIT 1;
  END IF;

  RETURN v_supported_store;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_supported_store_name(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_supported_store_name(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_stop_dispute(
  p_stop_id     uuid,
  p_resolved_by uuid,
  p_stops       jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stop                "Stops"%ROWTYPE;
  v_item                jsonb;
  v_items               jsonb := '[]'::jsonb;
  v_norm                jsonb;
  v_stop_type           text;
  v_store_name          text;
  v_supported_store     text;
  v_location            text;
  v_customer_id         text;
  v_broker_text         text;
  v_broker_id           uuid;
  v_qty                 int;
  v_qty_text            text;
  v_total               bigint := 0;
  v_original_qty        int;
  v_idx                 int;
  v_id                  uuid;
  v_ids                 uuid[] := '{}';
  v_resolved            jsonb;
  v_trip_id             uuid;
  v_recorded            boolean;
  v_posted              boolean;
  v_destination_changed boolean;
  v_old_stop_type       text;
  v_old_store           text;
  v_old_location        text;
  v_old_customer        text;
  v_old_broker          uuid;
  v_old_qty             int;
  v_previous_broker     uuid;
  v_plate               text;
BEGIN
  IF p_resolved_by IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;

  IF p_stops IS NULL
     OR jsonb_typeof(p_stops) <> 'array'
     OR jsonb_array_length(p_stops) = 0 THEN
    RAISE EXCEPTION 'stops_required';
  END IF;

  SELECT * INTO v_stop
  FROM "Stops"
  WHERE stop_id = p_stop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stop_not_found';
  END IF;
  IF NOT COALESCE(v_stop.disputed, false) THEN
    RAISE EXCEPTION 'not_disputed';
  END IF;

  v_original_qty := COALESCE(v_stop.quantity_offloaded, 0);
  IF v_original_qty <= 0 THEN
    RAISE EXCEPTION 'invalid_original_quantity';
  END IF;

  -- Lock the trip so a record attempt cannot pass its stop check while this
  -- resolution is committing.
  v_trip_id := v_stop.trip_id;
  IF v_trip_id IS NOT NULL THEN
    SELECT recorded, posted INTO v_recorded, v_posted
    FROM "Trips"
    WHERE trip_id = v_trip_id
    FOR UPDATE;
    IF FOUND AND (COALESCE(v_recorded, false) OR COALESCE(v_posted, false)) THEN
      RAISE EXCEPTION 'trip_locked';
    END IF;

    SELECT recorded, posted INTO v_recorded, v_posted
    FROM dd_trips
    WHERE dd_trip_id = v_trip_id
    FOR UPDATE;
    IF FOUND AND (COALESCE(v_recorded, false) OR COALESCE(v_posted, false)) THEN
      RAISE EXCEPTION 'trip_locked';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM store_supply_confirmations WHERE stop_id = p_stop_id
  ) THEN
    RAISE EXCEPTION 'supply_confirmation_exists';
  END IF;

  -- Validate and normalise every destination before writing anything.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    v_stop_type := btrim(COALESCE(v_item->>'stop_type', ''));
    IF v_stop_type NOT IN ('store', 'customer') THEN
      RAISE EXCEPTION 'invalid_stop_type';
    END IF;

    v_qty_text := btrim(COALESCE(v_item->>'quantity_offloaded', ''));
    IF v_qty_text = '' OR v_qty_text !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    -- Keep out of range input a validation error instead of a 500 from the
    -- int cast. 2147483647 is the largest int Postgres accepts.
    IF length(v_qty_text) > 10 OR v_qty_text::bigint > 2147483647 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    v_qty := v_qty_text::int;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    IF v_stop_type = 'store' THEN
      v_store_name := btrim(COALESCE(v_item->>'store_name', ''));
      IF v_store_name = '' THEN
        RAISE EXCEPTION 'store_required';
      END IF;

      v_supported_store := public.resolve_supported_store_name(v_store_name);

      IF v_supported_store IS NULL THEN
        RAISE EXCEPTION 'invalid_store_destination';
      END IF;
      v_store_name := v_supported_store;

      v_norm := jsonb_build_object(
        'stop_type', 'store',
        'quantity_offloaded', v_qty,
        'store_name', v_store_name,
        'broker_id', NULL,
        'customer_id', NULL,
        'stop_location', v_store_name
      );
    ELSE
      v_broker_text := btrim(COALESCE(v_item->>'broker_id', ''));
      IF v_broker_text = '' THEN
        RAISE EXCEPTION 'broker_required';
      END IF;
      IF v_broker_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'invalid_broker';
      END IF;
      v_broker_id := v_broker_text::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM "Brokers" WHERE broker_id = v_broker_id
      ) THEN
        RAISE EXCEPTION 'invalid_broker';
      END IF;

      v_customer_id := NULLIF(btrim(COALESCE(v_item->>'customer_id', '')), '');
      IF v_customer_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "Customers" WHERE customer_id = v_customer_id
         ) THEN
        RAISE EXCEPTION 'invalid_customer';
      END IF;

      v_location := btrim(COALESCE(v_item->>'stop_location', ''));
      IF v_location = '' THEN
        RAISE EXCEPTION 'location_required';
      END IF;

      v_norm := jsonb_build_object(
        'stop_type', 'customer',
        'quantity_offloaded', v_qty,
        'store_name', NULL,
        'broker_id', v_broker_id,
        'customer_id', v_customer_id,
        'stop_location', v_location
      );
    END IF;

    v_items := v_items || jsonb_build_array(v_norm);
    v_total := v_total + v_qty;
  END LOOP;

  -- The engineer chose the full quantity rule. A short delivery is recorded
  -- through the supply confirmation discrepancy note instead.
  IF v_total <> v_original_qty THEN
    RAISE EXCEPTION 'quantity_mismatch';
  END IF;

  -- The first destination replaces the original stop. The rest are new rows.
  v_old_stop_type := v_stop.stop_type;
  v_old_store := v_stop.store_name;
  v_old_location := v_stop.stop_location;
  v_old_customer := v_stop.customer_id;
  v_old_broker := v_stop.broker_id;
  v_old_qty := v_stop.quantity_offloaded;

  v_item := v_items->0;
  v_stop_type := v_item->>'stop_type';
  v_qty := (v_item->>'quantity_offloaded')::int;
  v_store_name := NULLIF(v_item->>'store_name', '');
  v_location := v_item->>'stop_location';
  v_customer_id := NULLIF(v_item->>'customer_id', '');
  v_broker_text := NULLIF(v_item->>'broker_id', '');
  v_broker_id := CASE WHEN v_broker_text IS NULL THEN NULL ELSE v_broker_text::uuid END;

  v_destination_changed :=
    v_old_stop_type IS DISTINCT FROM v_stop_type
    OR v_old_store IS DISTINCT FROM v_store_name
    OR v_old_location IS DISTINCT FROM v_location
    OR v_old_customer IS DISTINCT FROM v_customer_id
    OR v_old_broker IS DISTINCT FROM v_broker_id
    OR v_old_qty IS DISTINCT FROM v_qty;

  -- Keep disputed_by and disputed_by_name as the record of who disputed. Only
  -- the active dispute fields clear.
  UPDATE "Stops"
  SET stop_type = v_stop_type,
      broker_id = v_broker_id,
      customer_id = v_customer_id,
      quantity_offloaded = v_qty,
      stop_location = v_location,
      store_name = v_store_name,
      confirmed = false,
      disputed = false,
      dispute_reason = NULL,
      discount_status = 'none',
      on_credit = false,
      credit_approval_id = NULL,
      latitude = CASE WHEN v_destination_changed THEN NULL ELSE latitude END,
      longitude = CASE WHEN v_destination_changed THEN NULL ELSE longitude END,
      updated_by = p_resolved_by
  WHERE stop_id = p_stop_id;

  v_ids := array_append(v_ids, p_stop_id);

  -- A changed destination or quantity cannot keep the old customer price or
  -- credit link. Leaving them would price the new destination from stale data.
  IF v_destination_changed THEN
    DELETE FROM "Stop_Confirmations" WHERE stop_id = p_stop_id;
    DELETE FROM price_adjustments
    WHERE source_type = 'stop' AND source_id = p_stop_id;
    DELETE FROM credit_approvals
    WHERE source_type = 'stop' AND source_id = p_stop_id;
  END IF;

  FOR v_idx IN 1 .. jsonb_array_length(v_items) - 1 LOOP
    v_item := v_items->v_idx;

    INSERT INTO "Stops" (
      trip_id,
      stop_type,
      broker_id,
      customer_id,
      quantity_offloaded,
      stop_location,
      stop_time,
      store_name,
      confirmed,
      disputed,
      discount_status,
      on_credit,
      credit_approval_id,
      updated_by
    ) VALUES (
      v_stop.trip_id,
      v_item->>'stop_type',
      CASE WHEN v_item->>'broker_id' IS NULL THEN NULL ELSE (v_item->>'broker_id')::uuid END,
      NULLIF(v_item->>'customer_id', ''),
      (v_item->>'quantity_offloaded')::int,
      v_item->>'stop_location',
      v_stop.stop_time,
      NULLIF(v_item->>'store_name', ''),
      false,
      false,
      'none',
      false,
      NULL,
      p_resolved_by
    )
    RETURNING stop_id INTO v_id;

    v_ids := array_append(v_ids, v_id);
  END LOOP;

  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.order_of_stops)
  INTO v_resolved
  FROM "Stops" s
  WHERE s.stop_id = ANY(v_ids);

  -- A customer dispute is still resolved through this same action, so keep the
  -- broker informed. Store disputes leave this null.
  v_previous_broker := v_stop.broker_id;

  IF v_trip_id IS NOT NULL THEN
    SELECT plate_number INTO v_plate
    FROM "Trips"
    WHERE trip_id = v_trip_id;
    IF v_plate IS NULL THEN
      SELECT plate_number INTO v_plate
      FROM dd_trips
      WHERE dd_trip_id = v_trip_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'original_stop_id', p_stop_id,
    'trip_id', v_trip_id,
    'total_quantity', v_total,
    'previous_broker_id', v_previous_broker,
    'plate_number', COALESCE(v_plate, ''),
    'resolved_stops', COALESCE(v_resolved, '[]'::jsonb)
  );
END;
$$;

-- Server side only. The trips route checks the role and then calls these with
-- the service role. The browser must not call them directly.
REVOKE ALL ON FUNCTION public.dispute_store_supply(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispute_store_supply(uuid, uuid, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.resolve_stop_dispute(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_stop_dispute(uuid, uuid, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
