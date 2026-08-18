-- Add missing constraints to credit approval tables (created in 031).

-- 1. Deduplicate: keep only the earliest credit approval per source row
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY source_type, source_id ORDER BY created_at, id
  ) AS rn
  FROM credit_approvals
)
DELETE FROM credit_approvals WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- 2. Null out orphaned references before adding FKs
UPDATE "Stops"
SET credit_approval_id = NULL
WHERE credit_approval_id IS NOT NULL
  AND credit_approval_id NOT IN (SELECT id FROM credit_approvals);

UPDATE "store_sales"
SET credit_approval_id = NULL
WHERE credit_approval_id IS NOT NULL
  AND credit_approval_id NOT IN (SELECT id FROM credit_approvals);

-- 3. Unique constraint: one credit approval per source row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'credit_approvals_source_unique'
      AND conrelid = 'credit_approvals'::regclass
  ) THEN
    ALTER TABLE credit_approvals
      ADD CONSTRAINT credit_approvals_source_unique
      UNIQUE (source_type, source_id);
  END IF;
END $$;

-- 4. Foreign keys from source tables to credit_approvals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_stops_credit_approval'
      AND conrelid = '"Stops"'::regclass
  ) THEN
    ALTER TABLE "Stops"
      ADD CONSTRAINT fk_stops_credit_approval
      FOREIGN KEY (credit_approval_id)
      REFERENCES credit_approvals(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_store_sales_credit_approval'
      AND conrelid = 'store_sales'::regclass
  ) THEN
    ALTER TABLE "store_sales"
      ADD CONSTRAINT fk_store_sales_credit_approval
      FOREIGN KEY (credit_approval_id)
      REFERENCES credit_approvals(id)
      ON DELETE SET NULL;
  END IF;
END $$;
