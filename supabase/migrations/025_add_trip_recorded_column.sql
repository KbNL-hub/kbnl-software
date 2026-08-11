-- Add recorded boolean + tracking columns to Trips
ALTER TABLE "Trips"
  ADD COLUMN recorded boolean NOT NULL DEFAULT false,
  ADD COLUMN recorded_by uuid REFERENCES auth.users(id),
  ADD COLUMN recorded_at timestamptz;

-- Add recorded boolean + tracking columns to dd_trips
ALTER TABLE "dd_trips"
  ADD COLUMN recorded boolean NOT NULL DEFAULT false,
  ADD COLUMN recorded_by uuid REFERENCES auth.users(id),
  ADD COLUMN recorded_at timestamptz;

-- Mark previously posted trips as recorded (they were recorded by ATC officers).
-- Reset posted to false so desk officers can still post them.
UPDATE "Trips" SET recorded = true, recorded_by = posted_by, recorded_at = posted_at WHERE posted = true;
UPDATE "Trips" SET posted = false, posted_by = NULL, posted_at = NULL WHERE recorded = true;

UPDATE "dd_trips" SET recorded = true, recorded_by = posted_by, recorded_at = posted_at WHERE posted = true;
UPDATE "dd_trips" SET posted = false, posted_by = NULL, posted_at = NULL WHERE recorded = true;
