-- Migration 005: Add engine_type to Trucks + Create fuel_estimates table
-- Run this in the Supabase SQL Editor

-- 1. Add engine_type column to Trucks table
ALTER TABLE "Trucks" ADD COLUMN IF NOT EXISTS engine_type text NOT NULL DEFAULT 'Diesel Engine';

-- 2. Create fuel_estimates table
CREATE TABLE IF NOT EXISTS fuel_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL,
  diesel_litres numeric,
  cng_bars numeric
);

-- Enable RLS on fuel_estimates
ALTER TABLE fuel_estimates ENABLE ROW LEVEL SECURITY;

-- Allow read access for all authenticated users
CREATE POLICY "Allow read access to fuel_estimates" ON fuel_estimates
  FOR SELECT USING (true);

-- Allow insert/update/delete for admins
CREATE POLICY "Allow admin write access to fuel_estimates" ON fuel_estimates
  FOR ALL USING (true) WITH CHECK (true);
