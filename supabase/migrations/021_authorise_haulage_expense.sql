-- ================================================================
-- authorise_cash_expense: Haulage expenses deduct from the
-- maintenance fund (maintenance_balance), all other offices deduct
-- from cash_offices.current_balance. Atomic balance check + update.
-- ================================================================
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
  v_is_maintenance boolean;
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

  v_is_maintenance := (v_expense.office_name = 'Haulage');

  IF v_is_maintenance THEN
    SELECT current_balance INTO v_current_balance
    FROM maintenance_balance WHERE id = 1 FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Maintenance fund not found');
    END IF;
    IF v_current_balance < v_expense.total_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient maintenance fund balance');
    END IF;

    v_new_balance := GREATEST(0, v_current_balance - v_expense.total_amount);
    UPDATE maintenance_balance SET current_balance = v_new_balance, updated_at = now() WHERE id = 1;
  ELSE
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
  END IF;

  UPDATE cash_expenses
  SET status = 'Authorised', authorised_by = p_admin_id, resolved_at = now(), approval_notes = p_notes
  WHERE expense_id = p_expense_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;
