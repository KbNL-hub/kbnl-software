-- Atomic RPC: supply_booking
-- Locks the booking row, validates remaining quantity, updates cumulative total,
-- and inserts the supply event in one transaction.
-- Supports idempotency via p_idempotency_key to prevent double-supply on replays.

-- Add idempotency key column to supply events table
ALTER TABLE booking_supply_events
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_supply_events_idempotency_key
  ON booking_supply_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION supply_booking(
  p_booking_id uuid,
  p_bags integer,
  p_supply_date date,
  p_supplied_by uuid,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_booking new_bookings%ROWTYPE;
  v_new_total integer;
  v_new_status text;
  v_existing record;
BEGIN
  -- Idempotency: serialize concurrent requests sharing the same key
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key::text));

    SELECT
      bse.bags_supplied,
      bse.supply_date,
      bse.supplied_by,
      nb.bags_supplied AS total_bags_supplied,
      nb.status
    INTO v_existing
    FROM booking_supply_events bse
    JOIN new_bookings nb ON nb.id = bse.booking_id
    WHERE bse.idempotency_key = p_idempotency_key
      AND bse.booking_id = p_booking_id;

    IF FOUND THEN
      IF v_existing.bags_supplied != p_bags
        OR v_existing.supply_date != p_supply_date
        OR v_existing.supplied_by IS DISTINCT FROM p_supplied_by
      THEN
        RAISE EXCEPTION 'Idempotency key already used with different parameters';
      END IF;
      RETURN json_build_object(
        'id', p_booking_id,
        'bags_supplied', v_existing.total_bags_supplied,
        'status', v_existing.status,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- Lock the row to prevent race conditions
  SELECT * INTO v_booking
  FROM new_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status NOT IN ('pending', 'partial') THEN
    RAISE EXCEPTION 'Booking cannot be supplied in current status: %', v_booking.status;
  END IF;

  IF p_bags IS NULL OR p_bags <= 0 THEN
    RAISE EXCEPTION 'Bags to supply must be a positive integer';
  END IF;

  v_new_total := COALESCE(v_booking.bags_supplied, 0) + p_bags;

  IF v_new_total > v_booking.number_of_bags THEN
    RAISE EXCEPTION 'Cannot supply % bags: only % remaining (already supplied % of %)',
      p_bags, v_booking.number_of_bags - COALESCE(v_booking.bags_supplied, 0),
      COALESCE(v_booking.bags_supplied, 0), v_booking.number_of_bags;
  END IF;

  IF v_new_total >= v_booking.number_of_bags THEN
    v_new_status := 'supplied';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE new_bookings
  SET bags_supplied = v_new_total,
      status = v_new_status,
      supply_date = p_supply_date,
      supplied_by = p_supplied_by,
      updated_at = now()
  WHERE id = p_booking_id;

  INSERT INTO booking_supply_events (booking_id, bags_supplied, supply_date, supplied_by, idempotency_key)
  VALUES (p_booking_id, p_bags, p_supply_date, p_supplied_by, p_idempotency_key);

  RETURN json_build_object(
    'id', v_booking.id,
    'bags_supplied', v_new_total,
    'status', v_new_status
  );
END;
$$;
