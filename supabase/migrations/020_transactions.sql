-- ================================================================
-- Transactions: central hub for topping up balances.
-- Creates a unified record of every transfer from a source account
-- (bank) into a destination (cash office or Haulage / maintenance).
-- ================================================================

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account TEXT NOT NULL,
  to_account TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_to_account
  ON transactions (to_account);

-- ================================================================
-- create_transaction: record the transfer and atomically credit the
-- destination balance. Haulage maps to the maintenance balance fund,
-- the cash offices map to cash_offices.current_balance.
-- ================================================================
CREATE OR REPLACE FUNCTION create_transaction(
  p_from_account text,
  p_to_account text,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
  v_new_balance numeric;
  v_is_maintenance boolean;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  v_is_maintenance := (p_to_account = 'Haulage');

  IF NOT v_is_maintenance THEN
    PERFORM 1 FROM cash_offices WHERE office_name = p_to_account FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Destination office not found');
    END IF;
  END IF;

  v_transaction_id := gen_random_uuid();

  INSERT INTO transactions (transaction_id, from_account, to_account, amount, description, created_by)
  VALUES (v_transaction_id, p_from_account, p_to_account, p_amount, p_description, p_created_by);

  IF v_is_maintenance THEN
    UPDATE maintenance_balance
    SET current_balance = current_balance + p_amount, updated_at = now()
    WHERE id = 1
    RETURNING current_balance INTO v_new_balance;
  ELSE
    UPDATE cash_offices
    SET current_balance = current_balance + p_amount
    WHERE office_name = p_to_account
    RETURNING current_balance INTO v_new_balance;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'to_account', p_to_account,
    'amount', p_amount,
    'new_balance', v_new_balance
  );
END;
$$;
