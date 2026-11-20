-- Upgrade databases that already applied migrations 066 and 067.

ALTER TABLE public.store_supply_confirmations
  ADD COLUMN IF NOT EXISTS stock_credit_state text;

UPDATE public.store_supply_confirmations
SET stock_credit_state = 'unverified'
WHERE stock_credit_state IS NULL;

ALTER TABLE public.store_supply_confirmations
  ALTER COLUMN stock_credit_state SET DEFAULT 'credited',
  ALTER COLUMN stock_credit_state SET NOT NULL;

COMMENT ON COLUMN public.store_supply_confirmations.stock_credit_state IS
  'credited marks atomic stock credits safe to reverse; unverified rows require manual reconciliation before reversal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_supply_confirmations_stock_credit_state_check'
      AND conrelid = 'public.store_supply_confirmations'::regclass
  ) THEN
    ALTER TABLE public.store_supply_confirmations
      ADD CONSTRAINT store_supply_confirmations_stock_credit_state_check
      CHECK (stock_credit_state IN ('credited', 'unverified'));
  END IF;
END;
$$;

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
  v_total            bigint := 0;
  v_discrepancy      bigint;
  v_line             jsonb;
  v_product          text;
  v_product_key      text;
  v_qty              int;
  v_seen             text[] := '{}';
  v_confirmation_id  uuid;
  v_confirmed_at     timestamptz;
  v_recorded         boolean;
  v_posted           boolean;
  v_officer          record;
BEGIN
  IF p_confirmed_by IS NULL THEN
    RAISE EXCEPTION 'actor_required';
  END IF;
  IF p_confirmed_by_role IS NULL
     OR p_confirmed_by_role NOT IN ('ATCOfficer', 'Admin', 'SuperAdmin', 'StoreOfficer') THEN
    RAISE EXCEPTION 'invalid_actor_role';
  END IF;
  IF p_confirmed_by_name IS NULL OR btrim(p_confirmed_by_name) = '' THEN
    RAISE EXCEPTION 'actor_name_required';
  END IF;

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
  IF v_stop.disputed IS TRUE THEN
    RAISE EXCEPTION 'stop_disputed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM store_supply_confirmations WHERE stop_id = p_stop_id
  ) THEN
    RAISE EXCEPTION 'supply_confirmation_exists';
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

  IF p_confirmed_by_role = 'StoreOfficer' THEN
    SELECT officer_id, full_name
    INTO v_officer
    FROM store_officers
    WHERE officer_id = p_confirmed_by
      AND status = 'Active'
      AND lower(btrim(store_name)) = lower(v_store)
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'not_assigned_officer';
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM store_officers o
    WHERE lower(btrim(o.store_name)) = lower(v_store)
      AND o.status = 'Active'
  ) THEN
    RAISE EXCEPTION 'active_officer_exists';
  END IF;

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
    IF length(v_line->>'quantity') > 10
       OR (v_line->>'quantity')::bigint > 2147483647 THEN
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

  IF v_total > 2147483647 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  v_discrepancy := v_total - COALESCE(v_stop.quantity_offloaded, 0)::bigint;
  IF v_discrepancy NOT BETWEEN -2147483648 AND 2147483647 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;
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
    discrepancy_note,
    stock_credit_state
  ) VALUES (
    p_stop_id,
    CASE WHEN p_confirmed_by_role = 'StoreOfficer' THEN p_confirmed_by ELSE NULL END,
    v_store,
    p_confirmed_by,
    btrim(p_confirmed_by_name),
    p_confirmed_by_role,
    v_discrepancy,
    NULLIF(btrim(COALESCE(p_discrepancy_note, '')), ''),
    'credited'
  )
  RETURNING confirmation_id, confirmed_at
  INTO v_confirmation_id, v_confirmed_at;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_product := btrim(v_line->>'product');
    v_qty := (v_line->>'quantity')::int;

    INSERT INTO store_supply_lines (confirmation_id, product, quantity)
    VALUES (v_confirmation_id, v_product, v_qty);

    PERFORM adjust_store_stock(v_store, v_product, v_qty);
  END LOOP;

  PERFORM set_config('app.store_supply_confirmation_stop', p_stop_id::text, true);

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

REVOKE ALL ON FUNCTION public.confirm_store_supply(uuid, uuid, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_store_supply(uuid, uuid, text, text, jsonb, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_deleted_store_supply_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store              text;
  v_stock_credit_state text;
BEGIN
  SELECT store_name, stock_credit_state
  INTO v_store, v_stock_credit_state
  FROM store_supply_confirmations
  WHERE confirmation_id = OLD.confirmation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supply_confirmation_missing';
  END IF;
  IF v_stock_credit_state IS DISTINCT FROM 'credited' THEN
    RAISE EXCEPTION 'supply_credit_unverified';
  END IF;
  IF NULLIF(btrim(v_store), '') IS NULL THEN
    RAISE EXCEPTION 'supply_confirmation_missing';
  END IF;

  PERFORM adjust_store_stock(v_store, OLD.product, -OLD.quantity);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverse_deleted_store_supply_line ON public.store_supply_lines;
CREATE TRIGGER trg_reverse_deleted_store_supply_line
  BEFORE DELETE ON public.store_supply_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.reverse_deleted_store_supply_line();

CREATE OR REPLACE FUNCTION public.clear_changed_store_supply_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stop_type = 'store'
     AND (
       OLD.stop_type IS DISTINCT FROM NEW.stop_type
       OR OLD.quantity_offloaded IS DISTINCT FROM NEW.quantity_offloaded
       OR lower(COALESCE(NULLIF(btrim(OLD.store_name), ''), NULLIF(btrim(OLD.stop_location), '')))
          IS DISTINCT FROM
          lower(COALESCE(NULLIF(btrim(NEW.store_name), ''), NULLIF(btrim(NEW.stop_location), '')))
     ) THEN
    DELETE FROM public.store_supply_lines
    WHERE confirmation_id IN (
      SELECT confirmation_id
      FROM public.store_supply_confirmations
      WHERE stop_id = OLD.stop_id
    );

    DELETE FROM public.store_supply_confirmations
    WHERE stop_id = OLD.stop_id;

    IF NEW.stop_type = 'store' THEN
      NEW.confirmed := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_changed_store_supply_confirmation ON public."Stops";
CREATE TRIGGER trg_clear_changed_store_supply_confirmation
  BEFORE UPDATE OF stop_type, quantity_offloaded, store_name, stop_location ON public."Stops"
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_changed_store_supply_confirmation();

CREATE OR REPLACE FUNCTION public.prevent_unatomic_store_stop_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stop_type = 'store' AND NEW.confirmed IS TRUE THEN
    IF NEW.disputed IS TRUE THEN
      RAISE EXCEPTION 'stop_disputed';
    END IF;

    IF current_setting('app.store_supply_confirmation_stop', true)
       IS DISTINCT FROM NEW.stop_id::text THEN
      IF TG_OP = 'UPDATE' THEN
        IF OLD.stop_type = 'store'
           AND OLD.confirmed IS TRUE
           AND EXISTS (
             SELECT 1
             FROM public.store_supply_confirmations
             WHERE stop_id = NEW.stop_id
           ) THEN
          RETURN NEW;
        END IF;
      END IF;
      RAISE EXCEPTION 'store_supply_confirmation_required';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.stop_type = 'store'
       AND OLD.confirmed IS TRUE
       AND NEW.confirmed IS DISTINCT FROM TRUE
       AND EXISTS (
         SELECT 1
         FROM public.store_supply_confirmations
         WHERE stop_id = OLD.stop_id
       ) THEN
      RAISE EXCEPTION 'store_supply_confirmation_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unatomic_store_stop_confirmation ON public."Stops";
CREATE TRIGGER trg_prevent_unatomic_store_stop_confirmation
  BEFORE INSERT OR UPDATE OF confirmed, stop_type ON public."Stops"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unatomic_store_stop_confirmation();

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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stops) LOOP
    v_stop_type := btrim(COALESCE(v_item->>'stop_type', ''));
    IF v_stop_type NOT IN ('store', 'customer') THEN
      RAISE EXCEPTION 'invalid_stop_type';
    END IF;

    v_qty_text := btrim(COALESCE(v_item->>'quantity_offloaded', ''));
    IF v_qty_text = '' OR v_qty_text !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
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

  IF v_total <> v_original_qty THEN
    RAISE EXCEPTION 'quantity_mismatch';
  END IF;

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

REVOKE ALL ON FUNCTION public.resolve_stop_dispute(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_stop_dispute(uuid, uuid, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
