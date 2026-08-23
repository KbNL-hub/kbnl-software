-- Migration 034: Fix diesel expense approval — atomic logging and rejection with balance revert
-- 033 created reject_fuel_expense without reverting the truck fuel balance.
-- This migration recreates it with balance revert, and adds log_fuel_expense.

-- 1. Recreate reject_fuel_expense: atomically reverts truck fuel balance + marks rejected
CREATE OR REPLACE FUNCTION reject_fuel_expense(
  p_expense_id uuid,
  p_admin_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense truck_fuel_expenses%ROWTYPE;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_expense FROM truck_fuel_expenses WHERE expense_id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expense not found');
  END IF;
  IF v_expense.status != 'Pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expense is not Pending');
  END IF;

  -- Revert the truck fuel balance (add back the litres)
  IF v_expense.plate_number IS NOT NULL THEN
    UPDATE "Trucks"
    SET fuel_balance = fuel_balance + v_expense.litres
    WHERE plate_number = v_expense.plate_number
    RETURNING fuel_balance INTO v_new_balance;
  END IF;

  -- Mark expense as rejected
  UPDATE truck_fuel_expenses
  SET status = 'Rejected', rejection_reason = p_reason, approved_by = p_admin_id, approved_at = now()
  WHERE expense_id = p_expense_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- 2. Create RPC: log_fuel_expense (atomic: insert expense + deduct truck balance)
CREATE OR REPLACE FUNCTION log_fuel_expense(
  p_manager_id uuid,
  p_plate_number text,
  p_trip_id uuid,
  p_litres numeric,
  p_notes text DEFAULT NULL,
  p_location text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense_id uuid;
  v_fuel_balance numeric;
BEGIN
  -- Check truck fuel balance
  SELECT fuel_balance INTO v_fuel_balance
  FROM "Trucks" WHERE plate_number = p_plate_number FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Truck not found');
  END IF;

  IF v_fuel_balance < p_litres THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient fuel balance');
  END IF;

  -- Deduct balance
  UPDATE "Trucks"
  SET fuel_balance = fuel_balance - p_litres
  WHERE plate_number = p_plate_number;

  -- Insert expense
  v_expense_id := gen_random_uuid();
  INSERT INTO truck_fuel_expenses (expense_id, manager_id, plate_number, trip_id, litres, notes, location, status)
  VALUES (v_expense_id, p_manager_id, p_plate_number, p_trip_id, p_litres, p_notes, p_location, 'Pending');

  RETURN jsonb_build_object('success', true, 'expense_id', v_expense_id, 'fuel_balance', v_fuel_balance - p_litres);
END;
$$;
