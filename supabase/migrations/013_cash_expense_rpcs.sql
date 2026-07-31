-- Atomic RPCs for cash office balances.
-- add_cash_deposit: insert deposit record + increment office balance atomically.
-- authorise_cash_expense: check balance, deduct, and mark expense Authorised atomically.

CREATE OR REPLACE FUNCTION add_cash_deposit(
  p_office_name text,
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_deposited_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit_id uuid;
  v_new_balance numeric;
BEGIN
  v_deposit_id := gen_random_uuid();

  INSERT INTO cash_deposits (deposit_id, office_name, amount, note, deposited_by)
  VALUES (v_deposit_id, p_office_name, p_amount, p_note, p_deposited_by);

  UPDATE cash_offices
  SET current_balance = current_balance + p_amount
  WHERE office_name = p_office_name
  RETURNING current_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Office "%" not found', p_office_name;
  END IF;

  RETURN jsonb_build_object('success', true, 'deposit_id', v_deposit_id, 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION authorise_cash_expense(
  p_expense_id uuid,
  p_admin_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense cash_expenses%ROWTYPE;
  v_current_balance numeric;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_expense FROM cash_expenses WHERE expense_id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expense not found');
  END IF;
  IF v_expense.status != 'Pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expense is not Pending');
  END IF;

  SELECT current_balance INTO v_current_balance
  FROM cash_offices WHERE office_name = v_expense.office_name FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Office not found');
  END IF;
  IF v_current_balance < v_expense.total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient office balance');
  END IF;

  v_new_balance := v_current_balance - v_expense.total_amount;
  UPDATE cash_offices SET current_balance = v_new_balance WHERE office_name = v_expense.office_name;
  UPDATE cash_expenses
  SET status = 'Authorised', authorised_by = p_admin_id, resolved_at = now(), approval_notes = p_notes
  WHERE expense_id = p_expense_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
