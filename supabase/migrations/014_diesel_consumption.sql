-- Migration 014: Diesel consumption section (truck admin)
-- Run this in the Supabase SQL Editor

-- 1. Add location column to truck_fuel_expenses (records where fuel was consumed)
ALTER TABLE truck_fuel_expenses ADD COLUMN IF NOT EXISTS location text;

-- 2. Ensure all authenticated users can read truck_fuel_expenses
--    (truck officers read their own; truck admin reads all in the Diesel Consumption section)
CREATE POLICY IF NOT EXISTS "Authenticated users can read truck_fuel_expenses"
  ON truck_fuel_expenses FOR SELECT USING (true);
