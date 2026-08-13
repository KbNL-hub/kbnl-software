-- Add location/area dimension to company_prices and company_price_history.
-- Prices are now per (area, product) instead of per product alone.

-- 1. Drop existing PK on product (must happen before backfill inserts)
ALTER TABLE "company_prices" DROP CONSTRAINT IF EXISTS "company_prices_pkey";
ALTER TABLE "company_prices" DROP CONSTRAINT IF EXISTS "company_prices_product_key";

-- 2. Add area column (nullable initially for backfill)
ALTER TABLE "company_prices" ADD COLUMN area text;

-- 3. Backfill existing rows into 4 areas (copy current price to each area)
--    First: assign existing rows to 'Calabar to Obubra'
UPDATE "company_prices" SET area = 'Calabar to Obubra';

--    Then: insert copies for the other 3 areas
INSERT INTO "company_prices" (product, price, updated_at, updated_by, area)
SELECT product, price, updated_at, updated_by, 'Ikom to Obudu'
FROM "company_prices"
WHERE area = 'Calabar to Obubra';

INSERT INTO "company_prices" (product, price, updated_at, updated_by, area)
SELECT product, price, updated_at, updated_by, 'Akwa-Ibom'
FROM "company_prices"
WHERE area = 'Calabar to Obubra';

INSERT INTO "company_prices" (product, price, updated_at, updated_by, area)
SELECT product, price, updated_at, updated_by, 'East'
FROM "company_prices"
WHERE area = 'Calabar to Obubra';

-- 4. Enforce NOT NULL + composite unique constraint
ALTER TABLE "company_prices" ALTER COLUMN area SET NOT NULL;
ALTER TABLE "company_prices" ALTER COLUMN area SET DEFAULT 'Calabar to Obubra';
ALTER TABLE "company_prices" ADD CONSTRAINT "company_prices_area_product_unique" UNIQUE (area, product);

-- 5. Add area column to company_price_history
ALTER TABLE "company_price_history" ADD COLUMN area text NOT NULL DEFAULT '';
