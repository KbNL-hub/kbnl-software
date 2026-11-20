-- Share the authoritative store-name lookup between dispute resolution and
-- Stops validation, including the supported fallback when the catalog is empty.

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

  v_supported_store := public.resolve_supported_store_name(v_requested_store);
  IF v_supported_store IS NULL THEN
    RAISE EXCEPTION 'invalid_store_destination';
  END IF;

  NEW.store_name := v_supported_store;
  NEW.stop_location := v_supported_store;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_store_stop_destination ON public."Stops";
CREATE TRIGGER trg_validate_store_stop_destination
  BEFORE INSERT OR UPDATE OF stop_type, store_name, stop_location ON public."Stops"
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_store_stop_destination();

DO $migration$
DECLARE
  v_definition text;
  v_old_lookup constant text := $old$
      v_requested_store := v_store_name;
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
      v_store_name := v_supported_store;
$old$;
  v_new_lookup constant text := $new$
      v_supported_store := public.resolve_supported_store_name(v_store_name);
      IF v_supported_store IS NULL THEN
        RAISE EXCEPTION 'invalid_store_destination';
      END IF;
      v_store_name := v_supported_store;
$new$;
BEGIN
  v_definition := pg_get_functiondef(
    'public.resolve_stop_dispute(uuid,uuid,jsonb)'::regprocedure
  );

  IF position(v_old_lookup IN v_definition) = 0
     AND position('public.resolve_supported_store_name(v_store_name)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'resolve_stop_dispute store lookup did not match expected migration definition';
  END IF;

  IF position(v_old_lookup IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old_lookup, v_new_lookup);
    v_definition := replace(v_definition, '  v_requested_store     text;' || E'\n', '');
    EXECUTE v_definition;
  END IF;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
