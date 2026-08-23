-- Migration 033: Diesel expense approval workflow
-- Adds status tracking and rejection reasons for fuel expenses

-- 1. Add status, rejection_reason, approved_by, approved_at, approval_notes columns
ALTER TABLE truck_fuel_expenses
ADD COLUMN IF NOT EXISTS status text
DEFAULT 'Pending'
CHECK (status IN ('Pending', 'Approved', 'Rejected'));

ALTER TABLE truck_fuel_expenses
ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE truck_fuel_expenses
ADD COLUMN IF NOT EXISTS approved_by uuid;

ALTER TABLE truck_fuel_expenses
ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE truck_fuel_expenses
ADD COLUMN IF NOT EXISTS approval_notes text;

-- 2. Create RPC: approve_fuel_expense
CREATE OR REPLACE FUNCTION approve_fuel_expense(
  p_expense_id uuid,
  p_admin_id uuid,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense truck_fuel_expenses%ROWTYPE;
BEGIN
  SELECT * INTO v_expense FROM truck_fuel_expenses WHERE expense_id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expense not found');
  END IF;
  IF v_expense.status != 'Pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expense is not Pending');
  END IF;

  UPDATE truck_fuel_expenses
  SET status = 'Approved', approved_by = p_admin_id, approved_at = now(), approval_notes = p_notes
  WHERE expense_id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Create RPC: reject_fuel_expense
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
BEGIN
  SELECT * INTO v_expense FROM truck_fuel_expenses WHERE expense_id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expense not found');
  END IF;
  IF v_expense.status != 'Pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expense is not Pending');
  END IF;

  UPDATE truck_fuel_expenses
  SET status = 'Rejected', rejection_reason = p_reason, approved_by = p_admin_id, approved_at = now()
  WHERE expense_id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
