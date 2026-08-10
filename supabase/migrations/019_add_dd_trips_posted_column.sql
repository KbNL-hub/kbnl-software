-- Add posted boolean + tracking columns to dd_trips (same as Trips table)
ALTER TABLE "dd_trips"
  ADD COLUMN posted boolean NOT NULL DEFAULT false,
  ADD COLUMN posted_by uuid REFERENCES auth.users(id),
  ADD COLUMN posted_at timestamptz;

-- Set existing dd_trips to posted = false
UPDATE "dd_trips" SET posted = false;
