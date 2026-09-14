-- Migration: 051_prevent_stops_beyond_loaded_quantity.sql
-- Add a trigger function that prevents inserting a stop if the cumulative
-- offloaded quantity (including the new stop) would exceed loaded_quantity.
-- This prevents race conditions from network delays causing duplicate submissions
-- that result in negative "Bags remaining" values.
-- Uses SELECT FOR UPDATE to serialize concurrent stop inserts for the same trip.

CREATE OR REPLACE FUNCTION prevent_stop_beyond_loaded()
RETURNS TRIGGER AS $$
DECLARE
  v_loaded_quantity INT;
  v_total_offloaded INT;
  v_total_shortage INT;
  v_total_caked INT;
BEGIN
  -- Get the loaded quantity with row-level lock to serialize concurrent inserts
  IF EXISTS (SELECT 1 FROM "Trips" WHERE trip_id = NEW.trip_id) THEN
    SELECT loaded_quantity INTO v_loaded_quantity
    FROM "Trips" WHERE trip_id = NEW.trip_id FOR UPDATE;
  ELSIF EXISTS (SELECT 1 FROM dd_trips WHERE dd_trip_id = NEW.trip_id) THEN
    SELECT loaded_quantity INTO v_loaded_quantity
    FROM dd_trips WHERE dd_trip_id = NEW.trip_id FOR UPDATE;
  ELSE
    -- Trip not found, allow the insert (will fail on FK anyway)
    RETURN NEW;
  END IF;

  -- Sum existing offloaded quantities for this trip
  SELECT COALESCE(SUM(quantity_offloaded), 0) INTO v_total_offloaded
  FROM "Stops"
  WHERE trip_id = NEW.trip_id;

  -- Sum existing discrepancies (shortage + caked) for this trip
  SELECT
    COALESCE(SUM(shortage), 0),
    COALESCE(SUM(caked_bags), 0)
  INTO v_total_shortage, v_total_caked
  FROM trip_discrepancies
  WHERE trip_id = NEW.trip_id;

  -- Check if the new stop would exceed loaded quantity
  IF (v_total_offloaded + v_total_shortage + v_total_caked + NEW.quantity_offloaded) > v_loaded_quantity THEN
    RAISE EXCEPTION 'Cannot log stop: total offloaded (%) would exceed loaded quantity (%). Only % bags remaining.',
      v_total_offloaded + v_total_shortage + v_total_caked + NEW.quantity_offloaded,
      v_loaded_quantity,
      v_loaded_quantity - (v_total_offloaded + v_total_shortage + v_total_caked);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_prevent_stop_beyond_loaded ON "Stops";

-- Create the trigger
CREATE TRIGGER trg_prevent_stop_beyond_loaded
  BEFORE INSERT ON "Stops"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_stop_beyond_loaded();
