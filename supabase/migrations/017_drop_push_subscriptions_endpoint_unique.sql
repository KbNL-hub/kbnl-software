-- Drop the endpoint-only unique constraint.
-- Migration 016 added a (endpoint, role) unique index for the
-- one-row-per-role design. The original endpoint-only UNIQUE
-- constraint conflicts with that and causes 500s when a user
-- has more than one role (second insert violates the constraint).

alter table push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_key;
