DROP FUNCTION IF EXISTS get_active_mdd_trucks_remaining(integer, text[]);
CREATE OR REPLACE FUNCTION get_active_mdd_trucks_remaining(p_limit int DEFAULT 50, p_plates text[] DEFAULT NULL)
RETURNS json LANGUAGE sql STABLE AS $$
  WITH relevant AS (
    SELECT
      tr.trip_id,
      tr.plate_number,
      tr.loaded_quantity,
      tr.trip_status,
      tr.driver_id,
      tr.route_points,
      tr.created_at,
      d.full_name AS driver_name,
      d.phone_number AS driver_phone,
      tk.kbnl_truck_no
    FROM "Trips" tr
    LEFT JOIN "Drivers" d ON d.driver_id = tr.driver_id
    LEFT JOIN "Trucks" tk ON tk.plate_number = tr.plate_number
    WHERE tr.trip_status IN ('In transit', 'On hold')
      AND tr.driver_id IS NOT NULL
      AND tr.trip_id NOT IN (SELECT dd_trip_id FROM dd_trips)
      AND (p_plates IS NULL OR tr.plate_number = ANY (p_plates))
  ),
  stop_agg AS (
    SELECT trip_id, COALESCE(SUM(quantity_offloaded), 0) AS total_offloaded
    FROM "Stops"
    WHERE trip_id IN (SELECT trip_id FROM relevant)
    GROUP BY trip_id
  ),
  disc_agg AS (
    SELECT trip_id,
      COALESCE(SUM(shortage), 0) AS total_shortage,
      COALESCE(SUM(caked_bags), 0) AS total_caked
    FROM trip_discrepancies
    WHERE trip_id IN (SELECT trip_id FROM relevant)
    GROUP BY trip_id
  )
  SELECT COALESCE(json_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::json)
  FROM (
    SELECT
      r.trip_id,
      r.plate_number,
      r.kbnl_truck_no,
      r.loaded_quantity,
      r.trip_status,
      r.driver_name,
      r.driver_phone,
      r.route_points,
      r.created_at,
      r.loaded_quantity - COALESCE(s.total_offloaded, 0) - COALESCE(d.total_shortage, 0) - COALESCE(d.total_caked, 0) AS remaining,
      COALESCE(s.total_offloaded, 0) AS total_offloaded,
      COALESCE(d.total_shortage, 0) AS total_shortage,
      COALESCE(d.total_caked, 0) AS total_caked
    FROM relevant r
    LEFT JOIN stop_agg s USING (trip_id)
    LEFT JOIN disc_agg d USING (trip_id)
    ORDER BY r.created_at DESC
    LIMIT p_limit
  ) t;
$$;
