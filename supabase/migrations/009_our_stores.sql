-- Create stores table to replace hardcoded STORE_LOCATIONS array
create table if not exists stores (
  store_id uuid primary key default gen_random_uuid(),
  store_name text not null unique,
  created_at timestamptz not null default now()
);

-- Seed with existing hardcoded locations
insert into stores (store_name) values
  ('Calabar Mini Depot'),
  ('Ikom Mini Depot'),
  ('Ogoja Depot'),
  ('Uyo Depot'),
  ('Brooks Outlet'),
  ('Urua Ekpa Outlet'),
  ('Urua Nyemeiko Outlet'),
  ('Reserve Store'),
  ('E1 Outlet'),
  ('Ogoja Outlet')
on conflict (store_name) do nothing;

-- Enable RLS
alter table stores enable row level security;

-- Reads via client, writes via apiMutate (service role key bypasses RLS)
create policy "Authenticated users can read stores"
  on stores for select
  to authenticated
  using (true);
