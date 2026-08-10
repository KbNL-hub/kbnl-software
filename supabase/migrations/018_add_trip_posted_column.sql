-- Add posted boolean + tracking columns to Trips
ALTER TABLE "Trips"
  ADD COLUMN posted boolean NOT NULL DEFAULT false,
  ADD COLUMN posted_by uuid REFERENCES auth.users(id),
  ADD COLUMN posted_at timestamptz;

-- Set existing trips to posted = false (old transactions)
UPDATE "Trips" SET posted = false;
