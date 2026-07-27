-- Add verification_session_id to stock_verifications for grouping products verified together

-- 1. Add the column (nullable initially for backfill)
ALTER TABLE stock_verifications ADD COLUMN verification_session_id uuid;

-- 2. Backfill existing rows: group by verified_at proximity (within 2s = same session)
--    Use a window function to assign session IDs based on time gaps
WITH ranked AS (
  SELECT verification_id,
         verified_at,
         LAG(verified_at) OVER (ORDER BY verified_at) AS prev_at
  FROM stock_verifications
),
sessions AS (
  SELECT verification_id,
         CASE
           WHEN prev_at IS NULL OR verified_at - prev_at > INTERVAL '2 seconds'
           THEN gen_random_uuid()
         END AS new_session_id
  FROM ranked
),
filled AS (
  SELECT verification_id,
         new_session_id,
         SUM(CASE WHEN new_session_id IS NOT NULL THEN 1 ELSE 0 END)
           OVER (ORDER BY (SELECT 0) ROWS UNBOUNDED PRECEDING) AS grp
  FROM sessions
)
UPDATE stock_verifications sv
SET verification_session_id = f.new_session_id
FROM filled f
WHERE sv.verification_id = f.verification_id AND f.new_session_id IS NOT NULL;

-- Propagate session IDs to rows that follow within the same gap window
WITH ordered AS (
  SELECT verification_id, verified_at,
         verification_session_id,
         LAG(verification_session_id) OVER (ORDER BY verified_at) AS prev_session
  FROM stock_verifications
)
UPDATE stock_verifications sv
SET verification_session_id = o.prev_session
FROM ordered o
WHERE sv.verification_id = o.verification_id
  AND sv.verification_session_id IS NULL
  AND o.prev_session IS NOT NULL;

-- 3. Now make the column NOT NULL
ALTER TABLE stock_verifications ALTER COLUMN verification_session_id SET NOT NULL;

-- 4. Add an index for fast lookups by session
CREATE INDEX IF NOT EXISTS idx_stock_verifications_session
  ON stock_verifications (verification_session_id);
