-- Store Supervisor role tables

-- 1. Store Supervisors table (supports multi-store assignment via text array)
create table if not exists store_supervisors (
  supervisor_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone_number text,
  store_names text[] not null default '{}',
  profile_picture_url text,
  created_at timestamptz not null default now()
);

alter table store_supervisors enable row level security;

create policy "Allow read access to store_supervisors"
  on store_supervisors for select
  using (true);

-- 2. Stock Verifications table
create table if not exists stock_verifications (
  verification_id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null,
  product text not null,
  system_balance integer not null,
  physical_count integer not null,
  discrepancy integer generated always as (physical_count - system_balance) stored,
  notes text,
  verified_at timestamptz not null default now()
);

alter table stock_verifications enable row level security;

create policy "Allow read access to stock_verifications"
  on stock_verifications for select
  using (true);

-- Index for fast lookups by store + product + date
create index if not exists idx_stock_verifications_store_product
  on stock_verifications (store_name, product, verified_at desc);
