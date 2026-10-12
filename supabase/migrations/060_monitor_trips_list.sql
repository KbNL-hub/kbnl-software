-- Migration 060: server-side filter and pagination for the Monitor Trips list
--
-- MonitorTrips used to pull every trip, every Stops row and every
-- Stop_Confirmations row, then filter and paginate in the browser. At 232 trips
-- / 661 stops that was ~677KB on every 120s poll, and it grew without bound.
--
-- This function returns one page of trip summaries with the stop counters
-- already aggregated in Postgres, so the list transfers only what it renders.
-- Stops, prices, customers and confirmations are loaded on demand for a single
-- trip when the user opens it.
--
-- The returned envelope is:
--   { total, items: [...], stats: { pending_record, disputed_trip }, plates: [...] }
-- "total" counts the rows matching the filters (for pagination), while stats
-- and plates are unfiltered because the status pills and the plate picker are
-- always shown against the whole dataset.
--
-- SECURITY INVOKER (the default) is deliberate: the caller's RLS policies on
-- Trips, dd_trips, Drivers, Stops, trip_discrepancies and trip_load_more all
-- still apply, exactly as they did when the browser issued the queries. Do not
-- change this to SECURITY DEFINER without adding an authorisation check, or
-- every authenticated role would be able to read every trip.

CREATE OR REPLACE FUNCTION public.list_monitor_trips(
  p_status    TEXT    DEFAULT 'All',
  p_search    TEXT    DEFAULT NULL,
  p_plate     TEXT    DEFAULT NULL,
  p_date_from DATE    DEFAULT NULL,
  p_date_to   DATE    DEFAULT NULL,
  p_limit     INTEGER DEFAULT 100,
  p_offset    INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_result JSONB;
BEGIN
  WITH dd AS (
    -- Side trips. driver_name/phone live on the row itself.
    SELECT d.dd_trip_id          AS trip_id,
           d.plate_number::TEXT  AS plate_number,
           TRUE                  AS is_dd,
           NULL::UUID            AS driver_id,
           d.driver_name::TEXT   AS driver_name,
           d.driver_phone::TEXT  AS driver_phone,
           NULL::TEXT            AS driver_status,
           d.product::TEXT        AS product,
           d.loading_point::TEXT  AS material_centre,
           d.loaded_quantity::NUMERIC AS loaded_quantity,
           d.trip_status::TEXT    AS trip_status,
           d.atc::TEXT            AS atc,
           d.order_no::TEXT       AS order_no,
           d.child_order_no::TEXT AS child_order_no,
           NULL::NUMERIC          AS amount_charged,
           NULL::TEXT             AS payment_mode,
           d.created_at           AS created_at,
           d.posted_at            AS updated_at,
           d.recorded             AS recorded,
           d.posted               AS posted,
           d.route_points::TEXT[] AS route_points
      FROM public.dd_trips d
  ),
  sc AS (
    -- Self-collect / MDD trips. "ATC" is numeric and trip_status,
    -- material_centre and product are enums, so everything is cast to text to
    -- line up with the dd_trips branch for the UNION.
    SELECT t.trip_id,
           t.plate_number::TEXT  AS plate_number,
           FALSE                 AS is_dd,
           t.driver_id,
           NULL::TEXT            AS driver_name,
           NULL::TEXT            AS driver_phone,
           NULL::TEXT            AS driver_status,
           t.product::TEXT        AS product,
           t.material_centre::TEXT AS material_centre,
           t.loaded_quantity::NUMERIC AS loaded_quantity,
           t.trip_status::TEXT    AS trip_status,
           t."ATC"::TEXT          AS atc,
           t.order_no::TEXT       AS order_no,
           t.child_order_no::TEXT AS child_order_no,
           t.amount_charged::NUMERIC AS amount_charged,
           t.payment_mode::TEXT   AS payment_mode,
           t.created_at           AS created_at,
           t.updated_at::TIMESTAMPTZ AS updated_at,
           t.recorded             AS recorded,
           t.posted               AS posted,
           t.route_points::TEXT[] AS route_points
      FROM public."Trips" t
  ),
  merged AS (
    -- Every DD trip also gets a mirror row in "Trips" so that Stops.trip_id
    -- can resolve (see migration 059). Keep the dd_trips row and drop the
    -- mirror, which is what the client did in JS.
    SELECT * FROM dd
    UNION ALL
    SELECT * FROM sc s
     WHERE NOT EXISTS (SELECT 1 FROM dd d WHERE d.trip_id = s.trip_id)
  ),
  filtered AS (
    SELECT m.*
      FROM merged m
     WHERE (
             p_status IS NULL
             OR p_status = 'All'
             OR (p_status = 'Active'   AND m.trip_status IN ('In transit', 'On hold'))
             OR (p_status = 'Pending'  AND NOT COALESCE(m.recorded, FALSE))
             OR (p_status = 'Posted'   AND COALESCE(m.recorded, FALSE))
             OR (p_status = 'Disputed' AND EXISTS (
                   SELECT 1 FROM public."Stops" s
                    WHERE s.trip_id = m.trip_id
                      AND COALESCE(s.disputed, FALSE)))
           )
       AND (
             NULLIF(BTRIM(COALESCE(p_search, '')), '') IS NULL
             OR COALESCE(LOWER(m.atc), '') LIKE '%' || LOWER(BTRIM(p_search)) || '%'
             OR COALESCE(LOWER(m.child_order_no), '') LIKE '%' || LOWER(BTRIM(p_search)) || '%'
           )
       AND (
             NULLIF(BTRIM(COALESCE(p_plate, '')), '') IS NULL
             OR COALESCE(LOWER(m.plate_number), '') LIKE '%' || LOWER(BTRIM(p_plate)) || '%'
           )
       -- created_at is timestamptz; the browser compared the UTC date, so
       -- convert explicitly rather than inheriting the session timezone.
       AND (p_date_from IS NULL OR (m.created_at AT TIME ZONE 'UTC')::DATE >= p_date_from)
       AND (p_date_to   IS NULL OR (m.created_at AT TIME ZONE 'UTC')::DATE <= p_date_to)
  ),
  page AS (
    -- Paged before the LATERAL joins so the per-trip aggregates only run for
    -- the rows actually being returned.
    SELECT * FROM filtered
     ORDER BY created_at DESC, trip_id DESC
     LIMIT GREATEST(COALESCE(p_limit, 100), 0)
     OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ),
  enriched AS (
    SELECT f.trip_id,
           f.plate_number,
           f.is_dd,
           f.driver_id,
           CASE WHEN f.is_dd THEN COALESCE(f.driver_name, 'DD Driver')
                ELSE COALESCE(dr.full_name, 'Unknown') END AS driver_name,
           -- ASCII placeholder rather than an em dash so the literal cannot be
           -- mangled by whatever copies this file into the SQL editor.
           CASE WHEN f.is_dd THEN COALESCE(f.driver_phone, '-')
                ELSE COALESCE(dr.phone_number::TEXT, '-') END AS driver_phone,
           CASE WHEN f.is_dd THEN 'Active'
                ELSE COALESCE(dr.status, '-') END AS driver_status,
           f.product,
           f.material_centre,
           f.loaded_quantity,
           (f.loaded_quantity
             - COALESCE(sa.total_offloaded, 0)
             - COALESCE(da.shortage, 0)
             - COALESCE(da.caked, 0))::INTEGER AS remaining,
           f.trip_status,
           f.atc,
           f.order_no,
           f.child_order_no,
           f.amount_charged,
           f.payment_mode,
           f.created_at,
           CASE WHEN f.trip_status = 'Completed' THEN f.updated_at END AS completed_at,
           COALESCE(f.recorded, FALSE) AS recorded,
           COALESCE(f.posted, FALSE) AS posted,
           f.route_points,
           COALESCE(sa.stop_count, 0) AS stop_count,
           jsonb_build_object(
             'total',           COALESCE(sa.stop_count, 0),
             'confirmed',       COALESCE(sa.confirmed_count, 0),
             'pending',         COALESCE(sa.pending_count, 0),
             'disputed',        COALESCE(sa.disputed_count, 0),
             'awaiting_review', COALESCE(sa.awaiting_review_count, 0),
             'returned',        COALESCE(sa.returned_count, 0)
           ) AS stop_summary,
           COALESCE(lm.entries, '[]'::JSONB) AS load_more,
           COALESCE(lm.total_quantity, 0) AS load_more_total,
           f.created_at AS sort_at,
           f.trip_id    AS sort_id
      FROM page f
      LEFT JOIN public."Drivers" dr ON dr.driver_id = f.driver_id
      LEFT JOIN LATERAL (
            SELECT COUNT(*)::INTEGER AS stop_count,
                   COALESCE(SUM(s.quantity_offloaded), 0)::INTEGER AS total_offloaded,
                   (COUNT(*) FILTER (
                     WHERE COALESCE(s.confirmed, FALSE)
                       AND COALESCE(s.discount_status, 'none') NOT IN ('pending', 'returned')
                   ))::INTEGER AS confirmed_count,
                   (COUNT(*) FILTER (
                     WHERE NOT COALESCE(s.confirmed, FALSE)
                       AND NOT COALESCE(s.disputed, FALSE)
                       AND COALESCE(s.discount_status, 'none') NOT IN ('pending', 'returned')
                   ))::INTEGER AS pending_count,
                   (COUNT(*) FILTER (
                     WHERE COALESCE(s.disputed, FALSE)
                   ))::INTEGER AS disputed_count,
                   (COUNT(*) FILTER (
                     WHERE s.discount_status = 'pending'
                   ))::INTEGER AS awaiting_review_count,
                   (COUNT(*) FILTER (
                     WHERE s.discount_status = 'returned'
                   ))::INTEGER AS returned_count
              FROM public."Stops" s
             WHERE s.trip_id = f.trip_id
      ) sa ON TRUE
      LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(d.shortage), 0)::INTEGER AS shortage,
                   COALESCE(SUM(d.caked_bags), 0)::INTEGER AS caked
              FROM public.trip_discrepancies d
             WHERE d.trip_id = f.trip_id
      ) da ON TRUE
      LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(l.quantity), 0)::INTEGER AS total_quantity,
                   COALESCE(jsonb_agg(jsonb_build_object(
                     'id', l.id,
                     'quantity', l.quantity,
                     'loading_point_type', l.loading_point_type,
                     'loading_point_name', l.loading_point_name,
                     'product', l.product,
                     'created_at', l.created_at
                   ) ORDER BY l.created_at DESC), '[]'::JSONB) AS entries
              FROM public.trip_load_more l
             WHERE l.trip_id = f.trip_id
      ) lm ON TRUE
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*)::INTEGER FROM filtered),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'trip_id',          e.trip_id,
        'plate_number',     e.plate_number,
        'is_dd',            e.is_dd,
        'driver_id',        e.driver_id,
        'driver_name',      e.driver_name,
        'driver_phone',     e.driver_phone,
        'driver_status',    e.driver_status,
        'product',          e.product,
        'material_centre',  e.material_centre,
        'loaded_quantity',  e.loaded_quantity,
        'remaining',        e.remaining,
        'trip_status',      e.trip_status,
        'atc',              e.atc,
        'order_no',         e.order_no,
        'child_order_no',   e.child_order_no,
        'amount_charged',   e.amount_charged,
        'payment_mode',     e.payment_mode,
        'created_at',       e.created_at,
        'completed_at',     e.completed_at,
        'recorded',         e.recorded,
        'posted',           e.posted,
        'route_points',     e.route_points,
        'stop_count',       e.stop_count,
        'stop_summary',     e.stop_summary,
        'load_more',        e.load_more,
        'load_more_total',  e.load_more_total
      ) ORDER BY e.sort_at DESC, e.sort_id DESC)
        FROM enriched e
    ), '[]'::JSONB),
    'stats', jsonb_build_object(
      'pending_record', (
        SELECT COUNT(*)::INTEGER FROM merged WHERE NOT COALESCE(recorded, FALSE)
      ),
      'disputed_trip', (
        SELECT COUNT(DISTINCT m.trip_id)::INTEGER
          FROM merged m
          JOIN public."Stops" s ON s.trip_id = m.trip_id AND COALESCE(s.disputed, FALSE)
      )
    ),
    'plates', (
      SELECT COALESCE(jsonb_agg(DISTINCT plate_number ORDER BY plate_number), '[]'::JSONB)
        FROM merged
       WHERE plate_number IS NOT NULL
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_monitor_trips(TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_monitor_trips(TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) TO authenticated;

-- PostgREST caches its schema, so a newly created function is invisible until
-- the cache is reloaded. Without this the first call from the app returns
-- PGRST202 ("function not found") even though the function exists.
NOTIFY pgrst, 'reload schema';
