-- Migration 006: Add updated_at to broker_credits with auto-update trigger

ALTER TABLE broker_credits ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION update_broker_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS broker_credits_updated_at ON broker_credits;
CREATE TRIGGER broker_credits_updated_at
  BEFORE UPDATE ON broker_credits
  FOR EACH ROW
  EXECUTE FUNCTION update_broker_credits_updated_at();
