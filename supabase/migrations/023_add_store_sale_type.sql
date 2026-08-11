-- Add sale_type to store_sales: 'direct' | 'broker' | 'truck_load_out'
-- 'truck_load_out' = dispatch of goods onto a KBNL truck for a trip/dispatch
-- (not attributed to any broker, not confirmed by broker, no store revenue counted)

ALTER TABLE store_sales
  ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'direct';

-- Label existing broker-linked sales consistently
UPDATE store_sales SET sale_type = 'broker' WHERE broker_id IS NOT NULL AND sale_type = 'direct';
