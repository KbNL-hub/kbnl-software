-- One row per role on push_subscriptions.
-- Requires an existing push_subscriptions table with columns:
--   id, endpoint, p256dh, auth, user_id, device_id, role, is_active, updated_at

-- Dedupe existing rows, keeping the newest per (endpoint, role)
delete from push_subscriptions a
using push_subscriptions b
where a.endpoint = b.endpoint
  and a.role is not distinct from b.role
  and (a.updated_at, a.id) < (b.updated_at, b.id);

-- Unique index on (endpoint, role) — makes upsert race-safe
-- nulls not distinct (PG 15+) ensures at most one null-role row per endpoint
create unique index if not exists push_subscriptions_endpoint_role_key
  on push_subscriptions (endpoint, role)
  nulls not distinct;
