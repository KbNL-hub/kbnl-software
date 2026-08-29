-- Create junction table for cash authorizer <-> office many-to-many relationship
CREATE TABLE IF NOT EXISTS cash_authorizer_offices (
  authorizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  office_name TEXT NOT NULL,
  PRIMARY KEY (authorizer_id, office_name)
);

-- Migrate existing data from the single assigned_office column
INSERT INTO cash_authorizer_offices (authorizer_id, office_name)
SELECT authorizer_id, assigned_office
FROM cash_authorizers
WHERE assigned_office IS NOT NULL
ON CONFLICT DO NOTHING;

-- Drop the old single-office column
ALTER TABLE cash_authorizers DROP COLUMN IF EXISTS assigned_office;

-- RLS: Select_all only — all writes go through the mutation API
ALTER TABLE cash_authorizer_offices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Select_all" ON cash_authorizer_offices;
CREATE POLICY "Select_all"
  ON cash_authorizer_offices FOR SELECT TO authenticated USING (true);
