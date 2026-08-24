-- Add 'At Plant' and 'To Refuel' to the truck status enum
-- This allows truck officers to declare trucks arriving at the plant or heading to refuel

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'trucks_status' AND e.enumlabel = 'At Plant'
  ) THEN
    ALTER TYPE trucks_status ADD VALUE 'At Plant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'trucks_status' AND e.enumlabel = 'To Refuel'
  ) THEN
    ALTER TYPE trucks_status ADD VALUE 'To Refuel';
  END IF;
END
$$;
