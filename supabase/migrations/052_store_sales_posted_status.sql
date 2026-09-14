-- Migration: 052_store_sales_posted_status.sql
-- Add posted_by and posted_at columns to store_sales for the "Posted" status workflow,
-- mirroring how customer_payments handles posting.

-- Add posted_by and posted_at columns
ALTER TABLE store_sales ADD COLUMN IF NOT EXISTS posted_by UUID REFERENCES truck_admins(admin_id);
ALTER TABLE store_sales ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
