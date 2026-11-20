-- Keep store supply confirmation, stock reversal, and store destination
-- validation safe for databases that have already applied migrations 056-066.

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
    CASE WHEN p_confirmed_by_role = 'StoreOfficer' THEN p_confirmed_by ELSE NULL END,
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
  v_store text;
BEGIN
  SELECT store_name
  INTO v_store
  FROM store_supply_confirmations
  WHERE confirmation_id = OLD.confirmation_id;

  IF NOT FOUND OR NULLIF(btrim(v_store), '') IS NULL THEN
    RAISE EXCEPTION 'supply_confirmation_missing';
  END IF;

  PERFORM adjust_store_stock(v_store, OLD.product, -OLD.quantity);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverse_deleted_store_supply_line ON store_supply_lines;
CREATE TRIGGER trg_reverse_deleted_store_supply_line
  BEFORE DELETE ON store_supply_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.reverse_deleted_store_supply_line();

CREATE OR REPLACE FUNCTION public.delete_store_supply_lines_before_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM store_supply_lines
  WHERE confirmation_id = OLD.confirmation_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_store_supply_lines_before_confirmation ON store_supply_confirmations;
CREATE TRIGGER trg_delete_store_supply_lines_before_confirmation
  BEFORE DELETE ON store_supply_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_store_supply_lines_before_confirmation();

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
       OR COALESCE(NULLIF(btrim(OLD.store_name), ''), NULLIF(btrim(OLD.stop_location), ''))
          IS DISTINCT FROM
          COALESCE(NULLIF(btrim(NEW.store_name), ''), NULLIF(btrim(NEW.stop_location), ''))
     ) THEN
    DELETE FROM store_supply_lines
    WHERE confirmation_id IN (
      SELECT confirmation_id
      FROM store_supply_confirmations
      WHERE stop_id = OLD.stop_id
    );

    DELETE FROM store_supply_confirmations
    WHERE stop_id = OLD.stop_id;

    IF NEW.stop_type = 'store' THEN
      NEW.confirmed := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_changed_store_supply_confirmation ON "Stops";
CREATE TRIGGER trg_clear_changed_store_supply_confirmation
  BEFORE UPDATE OF stop_type, quantity_offloaded, store_name, stop_location ON "Stops"
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_changed_store_supply_confirmation();

CREATE OR REPLACE FUNCTION public.validate_store_stop_destination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_store text;
  v_supported_store text;
BEGIN
  IF NEW.stop_type IS DISTINCT FROM 'store' THEN
    RETURN NEW;
  END IF;

  v_requested_store := COALESCE(
    NULLIF(btrim(NEW.store_name), ''),
    NULLIF(btrim(NEW.stop_location), '')
  );
  IF v_requested_store IS NULL THEN
    RAISE EXCEPTION 'store_required';
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

  IF v_supported_store IS NULL THEN
    RAISE EXCEPTION 'invalid_store_destination';
  END IF;

  NEW.store_name := v_supported_store;
  NEW.stop_location := v_supported_store;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_store_stop_destination ON "Stops";
CREATE TRIGGER trg_validate_store_stop_destination
  BEFORE INSERT OR UPDATE OF stop_type, store_name, stop_location ON "Stops"
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_store_stop_destination();

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

    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'store_supply_confirmation_required';
    ELSIF OLD.confirmed IS DISTINCT FROM TRUE THEN
      IF current_setting('app.store_supply_confirmation_stop', true)
         IS DISTINCT FROM NEW.stop_id::text THEN
        RAISE EXCEPTION 'store_supply_confirmation_required';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unatomic_store_stop_confirmation ON "Stops";
CREATE TRIGGER trg_prevent_unatomic_store_stop_confirmation
  BEFORE INSERT OR UPDATE OF confirmed, stop_type ON "Stops"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unatomic_store_stop_confirmation();

NOTIFY pgrst, 'reload schema';
