-- 002_atomic_roles_stock.sql
-- Atomic RPC functions for role reassignment and stock decrement
-- Run this in the Supabase SQL editor

-- ================================================================
-- reassign_user_roles: atomically delete, insert, and update profile
-- ================================================================
CREATE OR REPLACE FUNCTION reassign_user_roles(
  p_user_id uuid,
  p_roles text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
BEGIN
  DELETE FROM "UserRoles" WHERE user_id = p_user_id;

  FOREACH v_role IN ARRAY p_roles
  LOOP
    INSERT INTO "UserRoles" (user_id, role) VALUES (p_user_id, v_role);
  END LOOP;

  UPDATE "Profiles" SET role = p_roles[1] WHERE user_id = p_user_id;
END;
$$;

-- ================================================================
-- decrement_store_stock: atomically check and decrement balance
-- ================================================================
CREATE OR REPLACE FUNCTION decrement_store_stock(
  p_store text,
  p_product text,
  p_qty int
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance int;
BEGIN
  SELECT balance INTO current_balance FROM store_stock
    WHERE store_name = p_store AND product = p_product FOR UPDATE;
  IF current_balance IS NULL OR current_balance < p_qty THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;
  UPDATE store_stock SET balance = current_balance - p_qty, updated_at = now()
    WHERE store_name = p_store AND product = p_product;
END;
$$;
