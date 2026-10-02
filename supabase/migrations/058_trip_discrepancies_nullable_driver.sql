-- DD (direct delivery) trips have no registered driver: their mirror "Trips" row
-- carries either no driver_id or a uuid that is not present in "Drivers".
-- trip_discrepancies.driver_id is NOT NULL with an FK to "Drivers"(driver_id), so
-- logging a discrepancy on those trips fails with trip_discrepancies_driver_id_fkey.
-- Allow NULL so a discrepancy can be recorded when no registered driver exists.
ALTER TABLE trip_discrepancies ALTER COLUMN driver_id DROP NOT NULL;
