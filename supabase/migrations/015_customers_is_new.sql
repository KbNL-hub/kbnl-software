-- Add is_new column to Customers table
ALTER TABLE "Customers" ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT true;

-- Mark existing customers as not new (they're already known)
UPDATE "Customers" SET is_new = false WHERE customer_id IS NOT NULL AND customer_id != '';

-- Fix only customers with empty/null IDs by assigning sequential CUST-XXXX IDs
DO $$
DECLARE
  max_num INTEGER;
  rec RECORD;
BEGIN
  SELECT COALESCE(
    (SELECT MAX(SUBSTRING(customer_id FROM 6)::INTEGER)
     FROM "Customers"
     WHERE customer_id ~ '^CUST-\d+$'),
    0
  ) INTO max_num;

  FOR rec IN
    SELECT ctid FROM "Customers"
    WHERE customer_id IS NULL OR customer_id = ''
    ORDER BY created_at
  LOOP
    max_num := max_num + 1;
    UPDATE "Customers"
    SET customer_id = 'CUST-' || LPAD(max_num::TEXT, 4, '0'),
        is_new = false
    WHERE ctid = rec.ctid;
  END LOOP;
END $$;
