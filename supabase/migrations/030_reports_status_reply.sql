-- Add status, admin_reply columns to reports table
-- Status flow: Open → In Progress → Resolved

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Open',
  ADD COLUMN IF NOT EXISTS admin_reply TEXT,
  ADD COLUMN IF NOT EXISTS admin_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_reply_by UUID REFERENCES "Profiles"(user_id);

-- Backfill: resolved=true → status='Resolved'
UPDATE reports SET status = 'Resolved' WHERE resolved = true;
