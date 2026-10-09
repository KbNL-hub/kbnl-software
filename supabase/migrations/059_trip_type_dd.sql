-- Migration 059: Recognise DD trips in the Trips table
--
-- Problem: every DD trip also gets a "mirror" row in "Trips" (see
-- components/admin/MonitorTrucks.tsx) so that Stops.trip_id can resolve,
-- because Stops.trip_id has an FK to "Trips".trip_id.
--
-- The mirror insert omitted trip_type, so the column default from
-- migration 035 applied and the row landed as trip_type = 'SC'. That made
-- every DD trip indistinguishable from a Self Collect trip and, worse,
-- app/api/mutations/trips/route.ts created a trip_payments row for each
-- one at SC rate -- inflating the SC tab of the Trip Payment screen.
--
-- This migration:
--   1. Widens trips_trip_type_check to allow 'DD'.
--   2. Backfills trip_type = 'DD' on every mirror row.
--   3. Deletes the bogus trip_payments rows created for those trips.
--
-- trip_payments.trip_type keeps its ('SC','MDD') constraint on purpose:
-- DD trips carry no payment, so the constraint should keep rejecting them.

-- 1. Allow 'DD' as a Trips.trip_type
ALTER TABLE public."Trips" DROP CONSTRAINT IF EXISTS trips_trip_type_check;
ALTER TABLE public."Trips"
  ADD CONSTRAINT trips_trip_type_check CHECK (trip_type IN ('SC', 'MDD', 'DD'));

-- 2. Mark DD mirror rows as 'DD'.
--    Primary signal: the trip has a parent row in dd_trips.
--    Orphan signal: a mirror row whose parent id no longer resolves. These
--    are matched on positive evidence of DD origin rather than on the
--    absence of driver_id -- the mirror insert copies plate_number,
--    material_centre, ATC, order_no and child_order_no verbatim from the
--    dd_trips row, so an orphan still matches a real DD record on plate,
--    loading point and dispatch reference. An SC/MDD trip can only match
--    here by sharing its plate, loading point AND the exact same ATC or
--    child order number as a DD trip, which the unique constraints added
--    in migration 055 already treat as a duplicate.
UPDATE public."Trips" t
   SET trip_type = 'DD'
 WHERE t.trip_id IN (SELECT d.dd_trip_id FROM public.dd_trips d)
    OR EXISTS (
         SELECT 1
           FROM public.dd_trips d
          WHERE d.plate_number = t.plate_number
            AND d.loading_point = t.material_centre
            AND (
                  (d.atc IS NOT NULL AND t."ATC" = d.atc)
               OR (d.child_order_no IS NOT NULL AND t.child_order_no = d.child_order_no)
            )
       );

-- 3. Remove the payment rows those mirror trips created.
--    Runs after the backfill so orphans are matched via their Trips row.
DELETE FROM public.trip_payments p
 WHERE p.trip_id IN (SELECT d.dd_trip_id FROM public.dd_trips d)
    OR EXISTS (
         SELECT 1 FROM public."Trips" t
          WHERE t.trip_id = p.trip_id
            AND t.trip_type = 'DD'
       );