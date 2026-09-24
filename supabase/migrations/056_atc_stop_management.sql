WITH ranked AS (
  SELECT confirmation_id,
         ROW_NUMBER() OVER (
           PARTITION BY stop_id
           ORDER BY confirmed_at DESC NULLS LAST, confirmation_id DESC
         ) AS rn
  FROM "Stop_Confirmations"
  WHERE stop_id IS NOT NULL
)
DELETE FROM "Stop_Confirmations" sc
USING ranked r
WHERE sc.confirmation_id = r.confirmation_id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stop_confirmations_stop_unique'
      AND conrelid = '"Stop_Confirmations"'::regclass
  ) THEN
    ALTER TABLE "Stop_Confirmations"
      ADD CONSTRAINT stop_confirmations_stop_unique
      UNIQUE (stop_id);
  END IF;
END $$;

DROP FUNCTION IF EXISTS save_atc_stop(UUID, UUID, UUID, TEXT, UUID, UUID, TEXT, INTEGER, TEXT, TIMESTAMPTZ, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION save_atc_stop(
  p_stop_id UUID,
  p_trip_id UUID,
  p_updated_by UUID,
  p_stop_type TEXT,
  p_broker_id UUID,
  p_customer_id TEXT,
  p_store_name TEXT,
  p_quantity_offloaded INTEGER,
  p_stop_location TEXT,
  p_stop_time TIMESTAMPTZ,
  p_area TEXT,
  p_price_per_bag NUMERIC,
  p_price_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_product TEXT;
  v_loaded_quantity INTEGER;
  v_recorded BOOLEAN;
  v_posted BOOLEAN;
  v_stop_id UUID;
  v_old_stop "Stops"%ROWTYPE;
  v_confirmation "Stop_Confirmations"%ROWTYPE;
  v_credit_approval credit_approvals%ROWTYPE;
  v_company_price NUMERIC;
  v_final_price NUMERIC;
  v_has_difference BOOLEAN := FALSE;
  v_area TEXT;
  v_credit_linked BOOLEAN := FALSE;
  v_financial_changed BOOLEAN := FALSE;
  v_other_offloaded INTEGER;
  v_shortage INTEGER;
  v_caked INTEGER;
  v_confirmed BOOLEAN := FALSE;
  v_discount_status TEXT := 'none';
  v_on_credit BOOLEAN := FALSE;
  v_credit_approval_id UUID;
  v_credit_status TEXT;
  v_store_supply_changed BOOLEAN := FALSE;
  v_stop_result JSONB;
  v_confirmation_result JSONB;
BEGIN
  SELECT product, loaded_quantity, recorded, posted
  INTO v_product, v_loaded_quantity, v_recorded, v_posted
  FROM "Trips"
  WHERE trip_id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT product, loaded_quantity, recorded, posted
    INTO v_product, v_loaded_quantity, v_recorded, v_posted
    FROM dd_trips
    WHERE dd_trip_id = p_trip_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF COALESCE(v_recorded, FALSE) OR COALESCE(v_posted, FALSE) THEN
    RAISE EXCEPTION 'Recorded trips cannot be edited';
  END IF;

  IF p_stop_type NOT IN ('customer', 'store') THEN
    RAISE EXCEPTION 'Invalid stop type';
  END IF;

  IF p_quantity_offloaded IS NULL OR p_quantity_offloaded <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  IF p_stop_id IS NOT NULL THEN
    SELECT * INTO v_old_stop
    FROM "Stops"
    WHERE stop_id = p_stop_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stop not found';
    END IF;

    IF v_old_stop.trip_id <> p_trip_id THEN
      RAISE EXCEPTION 'Stop does not belong to this trip';
    END IF;
  END IF;

  SELECT COALESCE(SUM(quantity_offloaded), 0)
  INTO v_other_offloaded
  FROM "Stops"
  WHERE trip_id = p_trip_id
    AND (p_stop_id IS NULL OR stop_id <> p_stop_id);

  SELECT
    COALESCE(SUM(shortage), 0),
    COALESCE(SUM(caked_bags), 0)
  INTO v_shortage, v_caked
  FROM trip_discrepancies
  WHERE trip_id = p_trip_id;

  IF v_other_offloaded + v_shortage + v_caked + p_quantity_offloaded > v_loaded_quantity THEN
    RAISE EXCEPTION 'Stop quantity exceeds the loaded quantity';
  END IF;

  v_stop_id := p_stop_id;
  v_credit_linked := COALESCE(v_old_stop.on_credit, FALSE)
    OR EXISTS (
      SELECT 1 FROM credit_approvals
      WHERE source_type = 'stop' AND source_id = v_stop_id
    );

  IF p_stop_type = 'customer' THEN
    IF p_broker_id IS NULL THEN
      RAISE EXCEPTION 'A broker is required';
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_stop_location, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A stop location is required';
    END IF;

    IF v_credit_linked AND p_stop_id IS NOT NULL THEN
      SELECT * INTO v_confirmation
      FROM "Stop_Confirmations"
      WHERE stop_id = v_stop_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Credit stop pricing is missing';
      END IF;

      v_area := COALESCE(NULLIF(BTRIM(p_area), ''), v_confirmation.area);
      v_company_price := v_confirmation.company_price;
      v_final_price := v_confirmation.price_per_bag;
      v_financial_changed := v_old_stop.stop_type IS DISTINCT FROM 'customer'
        OR v_old_stop.broker_id IS DISTINCT FROM p_broker_id
        OR v_old_stop.customer_id IS DISTINCT FROM p_customer_id
        OR v_old_stop.quantity_offloaded IS DISTINCT FROM p_quantity_offloaded;

      SELECT * INTO v_credit_approval
      FROM credit_approvals
      WHERE source_type = 'stop' AND source_id = v_stop_id
      FOR UPDATE;

      v_credit_approval_id := v_credit_approval.id;
      v_credit_status := v_credit_approval.status;
      v_on_credit := TRUE;
      v_has_difference := v_company_price IS NOT NULL
        AND v_company_price > 0
        AND v_final_price IS DISTINCT FROM v_company_price;
      v_discount_status := CASE WHEN v_has_difference THEN 'pending' ELSE v_old_stop.discount_status END;
      v_confirmed := CASE
        WHEN v_financial_changed THEN FALSE
        ELSE COALESCE(v_old_stop.confirmed, FALSE)
      END;
    ELSE
      IF NULLIF(BTRIM(COALESCE(p_area, '')), '') IS NULL THEN
        RAISE EXCEPTION 'An area is required';
      END IF;

      SELECT price INTO v_company_price
      FROM company_prices
      WHERE area = BTRIM(p_area)
        AND product = v_product;

      IF v_company_price IS NULL OR v_company_price <= 0 THEN
        RAISE EXCEPTION 'No company price exists for the selected area and product';
      END IF;

      v_area := BTRIM(p_area);
      v_final_price := p_price_per_bag;
      IF v_final_price IS NULL OR v_final_price <= 0 THEN
        RAISE EXCEPTION 'Price per bag must be greater than 0';
      END IF;

      v_has_difference := v_final_price <> v_company_price;
      IF v_has_difference AND NULLIF(BTRIM(COALESCE(p_price_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'A reason is required for a different price';
      END IF;

      v_confirmed := NOT v_has_difference;
      v_discount_status := CASE WHEN v_has_difference THEN 'pending' ELSE 'none' END;
      v_on_credit := FALSE;
      v_credit_approval_id := NULL;
      v_credit_status := NULL;

      DELETE FROM credit_approvals
      WHERE source_type = 'stop' AND source_id = v_stop_id;

      DELETE FROM price_adjustments
      WHERE source_type = 'stop' AND source_id = v_stop_id;
    END IF;

    IF p_stop_id IS NULL THEN
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
        p_trip_id,
        'customer',
        p_broker_id,
        p_customer_id,
        p_quantity_offloaded,
        BTRIM(p_stop_location),
        p_stop_time,
        NULL,
        v_confirmed,
        FALSE,
        v_discount_status,
        v_on_credit,
        v_credit_approval_id,
        p_updated_by
      )
      RETURNING stop_id INTO v_stop_id;
    ELSE
      UPDATE "Stops"
      SET stop_type = 'customer',
          broker_id = p_broker_id,
          customer_id = p_customer_id,
          quantity_offloaded = p_quantity_offloaded,
          stop_location = BTRIM(p_stop_location),
          stop_time = p_stop_time,
          store_name = NULL,
          confirmed = v_confirmed,
          disputed = FALSE,
          dispute_reason = NULL,
          discount_status = v_discount_status,
          on_credit = v_on_credit,
          credit_approval_id = v_credit_approval_id,
          updated_by = p_updated_by
      WHERE stop_id = v_stop_id;
    END IF;

    INSERT INTO "Stop_Confirmations" (
      stop_id,
      broker_id,
      customer_id,
      price_per_bag,
      area,
      company_price,
      price_reason,
      confirmed_at
    ) VALUES (
      v_stop_id,
      p_broker_id,
      p_customer_id,
      v_final_price,
      v_area,
      v_company_price,
      CASE WHEN v_has_difference THEN NULLIF(BTRIM(p_price_reason), '') ELSE NULL END,
      NOW()
    )
    ON CONFLICT (stop_id) DO UPDATE
    SET broker_id = EXCLUDED.broker_id,
        customer_id = EXCLUDED.customer_id,
        price_per_bag = EXCLUDED.price_per_bag,
        area = EXCLUDED.area,
        company_price = EXCLUDED.company_price,
        price_reason = EXCLUDED.price_reason,
        confirmed_at = EXCLUDED.confirmed_at;

    IF v_on_credit AND v_financial_changed THEN
      UPDATE credit_approvals
      SET broker_id = p_broker_id,
          area = v_area,
          product = v_product,
          quantity = p_quantity_offloaded,
          company_price = v_company_price,
          adjusted_price = CASE WHEN v_has_difference THEN v_final_price ELSE NULL END,
          status = 'Pending',
          rejection_reason = NULL,
          reviewed_by = NULL,
          reviewed_at = NULL
      WHERE id = v_credit_approval_id;
      v_credit_status := 'Pending';
      v_confirmed := FALSE;
      v_discount_status := CASE WHEN v_has_difference THEN 'pending' ELSE v_discount_status END;

      UPDATE "Stops"
      SET confirmed = FALSE,
          discount_status = v_discount_status
      WHERE stop_id = v_stop_id;
    END IF;

    IF NOT v_on_credit AND v_has_difference THEN
      INSERT INTO price_adjustments (
        source_type,
        source_id,
        broker_id,
        area,
        product,
        company_price,
        adjusted_price,
        price_reason,
        status,
        credit_status,
        denial_reason,
        reviewed_by,
        reviewed_at
      ) VALUES (
        'stop',
        v_stop_id,
        p_broker_id,
        v_area,
        v_product,
        v_company_price,
        v_final_price,
        BTRIM(p_price_reason),
        'Pending',
        'none',
        NULL,
        NULL,
        NULL
      )
      ON CONFLICT (source_type, source_id, product) DO UPDATE
      SET broker_id = EXCLUDED.broker_id,
          area = EXCLUDED.area,
          company_price = EXCLUDED.company_price,
          adjusted_price = EXCLUDED.adjusted_price,
          price_reason = EXCLUDED.price_reason,
          status = 'Pending',
          credit_status = 'none',
          denial_reason = NULL,
          reviewed_by = NULL,
          reviewed_at = NULL;
    END IF;
  ELSE
    IF NULLIF(BTRIM(COALESCE(p_store_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A store is required';
    END IF;

    DELETE FROM "Stop_Confirmations"
    WHERE stop_id = v_stop_id;

    DELETE FROM price_adjustments
    WHERE source_type = 'stop' AND source_id = v_stop_id;

    DELETE FROM credit_approvals
    WHERE source_type = 'stop' AND source_id = v_stop_id;

    v_store_supply_changed := p_stop_id IS NULL
      OR v_old_stop.stop_type IS DISTINCT FROM 'store'
      OR v_old_stop.quantity_offloaded IS DISTINCT FROM p_quantity_offloaded
      OR v_old_stop.store_name IS DISTINCT FROM p_store_name
      OR v_old_stop.stop_location IS DISTINCT FROM p_store_name;

    IF v_store_supply_changed AND p_stop_id IS NOT NULL THEN
      DELETE FROM store_supply_lines
      WHERE confirmation_id IN (
        SELECT confirmation_id
        FROM store_supply_confirmations
        WHERE stop_id = v_stop_id
      );

      DELETE FROM store_supply_confirmations
      WHERE stop_id = v_stop_id;
    END IF;

    IF p_stop_id IS NULL THEN
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
        p_trip_id,
        'store',
        NULL,
        NULL,
        p_quantity_offloaded,
        BTRIM(p_store_name),
        p_stop_time,
        BTRIM(p_store_name),
        FALSE,
        FALSE,
        'none',
        FALSE,
        NULL,
        p_updated_by
      )
      RETURNING stop_id INTO v_stop_id;
    ELSE
      UPDATE "Stops"
      SET stop_type = 'store',
          broker_id = NULL,
          customer_id = NULL,
          quantity_offloaded = p_quantity_offloaded,
          stop_location = BTRIM(p_store_name),
          stop_time = p_stop_time,
          store_name = BTRIM(p_store_name),
          confirmed = CASE WHEN v_store_supply_changed THEN FALSE ELSE COALESCE(v_old_stop.confirmed, FALSE) END,
          disputed = FALSE,
          dispute_reason = NULL,
          discount_status = 'none',
          on_credit = FALSE,
          credit_approval_id = NULL,
          updated_by = p_updated_by
      WHERE stop_id = v_stop_id;
    END IF;
  END IF;

  SELECT to_jsonb(s) INTO v_stop_result
  FROM "Stops" s
  WHERE s.stop_id = v_stop_id;

  SELECT to_jsonb(sc) INTO v_confirmation_result
  FROM "Stop_Confirmations" sc
  WHERE sc.stop_id = v_stop_id;

  RETURN jsonb_build_object(
    'stop', v_stop_result,
    'confirmation', v_confirmation_result,
    'credit_status', v_credit_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION delete_stop_with_dependencies(p_stop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_stop "Stops"%ROWTYPE;
  v_trip_id UUID;
  v_recorded BOOLEAN;
  v_posted BOOLEAN;
  v_supply_confirmations INTEGER;
  v_supply_lines INTEGER;
  v_confirmations INTEGER;
  v_adjustments INTEGER;
  v_credit_approvals INTEGER;
BEGIN
  SELECT * INTO v_stop
  FROM "Stops"
  WHERE stop_id = p_stop_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stop not found';
  END IF;

  v_trip_id := v_stop.trip_id;

  SELECT recorded, posted INTO v_recorded, v_posted
  FROM "Trips"
  WHERE trip_id = v_trip_id;

  IF NOT FOUND THEN
    SELECT recorded, posted INTO v_recorded, v_posted
    FROM dd_trips
    WHERE dd_trip_id = v_trip_id;
  END IF;

  IF COALESCE(v_recorded, FALSE) OR COALESCE(v_posted, FALSE) THEN
    RAISE EXCEPTION 'Recorded trips cannot be edited';
  END IF;

  DELETE FROM store_supply_lines
  WHERE confirmation_id IN (
    SELECT confirmation_id
    FROM store_supply_confirmations
    WHERE stop_id = p_stop_id
  );
  GET DIAGNOSTICS v_supply_lines = ROW_COUNT;

  DELETE FROM store_supply_confirmations
  WHERE stop_id = p_stop_id;
  GET DIAGNOSTICS v_supply_confirmations = ROW_COUNT;

  DELETE FROM "Stop_Confirmations"
  WHERE stop_id = p_stop_id;
  GET DIAGNOSTICS v_confirmations = ROW_COUNT;

  DELETE FROM price_adjustments
  WHERE source_type = 'stop'
    AND source_id = p_stop_id;
  GET DIAGNOSTICS v_adjustments = ROW_COUNT;

  DELETE FROM credit_approvals
  WHERE source_type = 'stop'
    AND source_id = p_stop_id;
  GET DIAGNOSTICS v_credit_approvals = ROW_COUNT;

  DELETE FROM "Stops"
  WHERE stop_id = p_stop_id;

  RETURN jsonb_build_object(
    'stop_id', p_stop_id,
    'trip_id', v_trip_id,
    'deleted', jsonb_build_object(
      'store_supply_lines', v_supply_lines,
      'store_supply_confirmations', v_supply_confirmations,
      'stop_confirmations', v_confirmations,
      'price_adjustments', v_adjustments,
      'credit_approvals', v_credit_approvals,
      'stops', 1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION save_atc_stop(UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT, TIMESTAMPTZ, TEXT, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_stop_with_dependencies(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_atc_stop(UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT, TIMESTAMPTZ, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION delete_stop_with_dependencies(UUID) TO service_role;
