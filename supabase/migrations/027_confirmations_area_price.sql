-- Add area, company_price, and price_reason to Stop_Confirmations;
-- Add area and price_reason to store_sales.
-- Both stop confirmation and store-sale confirmation now persist the
-- broker-selected area, and require a reason whenever the confirmed
-- price differs from the company price.

-- 1. Stop_Confirmations
ALTER TABLE "Stop_Confirmations"
  ADD COLUMN area text,
  ADD COLUMN company_price numeric,
  ADD COLUMN price_reason text;

-- 2. Store sales
ALTER TABLE "store_sales"
  ADD COLUMN area text,
  ADD COLUMN price_reason text;
