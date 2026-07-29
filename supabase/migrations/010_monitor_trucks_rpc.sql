CREATE OR REPLACE FUNCTION get_active_mdd_trucks(p_limit int DEFAULT 50)
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT COALESCE(json_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::json)
  FROM (
    SELECT
      tr.trip_id,
      tr.plate_number,
      tr.loaded_quantity,
      tr.trip_status,
      tr.driver_id,
      tr.route_points,
      d.full_name AS driver_name,
      d.phone_number AS driver_phone,
      tk.kbnl_truck_no
    FROM "Trips" tr
    LEFT JOIN "Drivers" d ON d.driver_id = tr.driver_id
    LEFT JOIN "Trucks" tk ON tk.plate_number = tr.plate_number
    WHERE tr.trip_status IN ('In transit', 'On hold')
      AND tr.driver_id IS NOT NULL
      AND tr.trip_id NOT IN (SELECT dd_trip_id FROM dd_trips)
    ORDER BY tr.created_at DESC
    LIMIT p_limit
  ) t;
$$;
