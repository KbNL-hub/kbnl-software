-- Add 'To Plant' to the truck status enum
-- This allows truck officers to declare trucks going to the plant

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'trucks_status' AND e.enumlabel = 'To Plant'
  ) THEN
    ALTER TYPE trucks_status ADD VALUE 'To Plant';
  END IF;
END
$$;
