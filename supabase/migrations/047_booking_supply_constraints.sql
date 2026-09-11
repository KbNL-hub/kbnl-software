-- Fix bags_supplied: backfill for 'supplied' rows and add constraints
-- 044 set bags_supplied to 0 for all rows; supplied bookings should equal number_of_bags.

-- Backfill: supplied bookings that still have bags_supplied = 0
UPDATE new_bookings
SET bags_supplied = number_of_bags
WHERE status = 'supplied' AND (bags_supplied IS NULL OR bags_supplied = 0);

-- Constraint: bags_supplied must be within valid range
ALTER TABLE new_bookings
  ADD CONSTRAINT new_bookings_bags_supplied_range
  CHECK (bags_supplied >= 0 AND bags_supplied <= number_of_bags);

-- Constraint: partial bookings must have 0 < bags_supplied < number_of_bags;
-- all other statuses must have bags_supplied = 0
ALTER TABLE new_bookings
  ADD CONSTRAINT new_bookings_partial_supply_check
  CHECK (
    (status = 'partial' AND bags_supplied > 0 AND bags_supplied < number_of_bags)
    OR (status = 'supplied' AND bags_supplied = number_of_bags)
    OR (status NOT IN ('partial', 'supplied') AND bags_supplied = 0)
  );

-- Drop the old supplied-only constraint since it is now covered above
ALTER TABLE new_bookings
  DROP CONSTRAINT IF EXISTS new_bookings_supplied_supply_check;
