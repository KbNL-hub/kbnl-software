-- 057_haulage_fund_ledger.sql
-- The Haulage fund (maintenance_balance) becomes the single cash account for
-- everything that costs the company money on its trucks: ATF fuel, validated
-- maintenance and bulk procurement.
--
-- Previously the fuel deduction came out of fuel_companies.current_balance
-- (the station) inside confirm_fuel_receipt. Stations keep their own balance as
-- a float, but refills no longer touch it.
--
-- haulage_transactions is the money trail for the fund. It does NOT replace
-- fuel_requests / maintenance_reports / bulk_procurement -- those keep their own
-- tables and their own screens. source_id links a ledger row back to the record
-- it came from.
--
-- Every debit is funnelled through post_haulage_debit so the fund is only ever
-- debited in one place. The balance is allowed to go negative: the TruckAdmin
-- sees the true figure and the UI flags it, rather than the RPC silently
-- clamping to zero and losing the overspend.

-- ================================================================
-- haulage_transactions
-- ================================================================
CREATE TABLE IF NOT EXISTS haulage_transactions (
  entry_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type   TEXT NOT NULL CHECK (entry_type IN ('TopUp','Deposit','ATF','Maintenance','Procurement')),
  direction    TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  description  TEXT,
  source_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_haulage_transactions_created_at
  ON haulage_transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_haulage_transactions_entry_type
  ON haulage_transactions (entry_type);

CREATE INDEX IF NOT EXISTS idx_haulage_transactions_source
  ON haulage_transactions (source_id);

-- RLS: read only. All writes happen inside the SECURITY DEFINER RPCs below.
ALTER TABLE haulage_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Select_all" ON haulage_transactions;
CREATE POLICY "Select_all"
  ON haulage_transactions FOR SELECT TO authenticated USING (true);

-- ================================================================
-- post_haulage_debit: the single point where money leaves the fund.
-- Locks the balance, applies the debit (no clamp, no insufficiency guard) and
-- writes the matching ledger row atomically.
-- ================================================================
CREATE OR REPLACE FUNCTION post_haulage_debit(
  p_entry_type text,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_new_balance numeric;
BEGIN
  IF p_entry_type NOT IN ('ATF', 'Maintenance', 'Procurement') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid haulage entry type');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid amount is required');
  END IF;

  SELECT current_balance INTO v_new_balance
  FROM maintenance_balance WHERE id = 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Haulage fund not found');
  END IF;

  v_new_balance := v_new_balance - p_amount;

  UPDATE maintenance_balance
  SET current_balance = v_new_balance, updated_at = now()
  WHERE id = 1;

  v_entry_id := gen_random_uuid();

  INSERT INTO haulage_transactions (entry_id, entry_type, direction, amount, description, source_id, created_by)
  VALUES (v_entry_id, p_entry_type, 'debit', p_amount, p_description, p_source_id, p_created_by);

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_entry_id,
    'entry_type', p_entry_type,
    'amount', p_amount,
    'new_balance', v_new_balance
  );
END;
$$;

-- ================================================================
-- confirm_fuel_receipt
-- The fuel cost now comes out of the Haulage fund instead of the station.
-- The station balance is left untouched. fuel_requests.total_amount is still
-- written, so every fuel cost figure in Reports.tsx is unaffected.
-- ================================================================
CREATE OR REPLACE FUNCTION confirm_fuel_receipt(
  p_request_id uuid,
  p_driver_id uuid,
  p_rate numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request fuel_requests%ROWTYPE;
  v_total numeric;
  v_debit jsonb;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_request FROM fuel_requests WHERE request_id = p_request_id AND atf_status = 'Authorised' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ATF not found or not in Authorised status');
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid rate per litre is required');
  END IF;

  v_total := v_request.litres * p_rate;

  v_debit := post_haulage_debit(
    'ATF',
    v_total,
    'Fuel for ' || v_request.plate_number || ' (' || v_request.litres || 'L @ ' || p_rate || '/L)',
    p_request_id,
    p_driver_id
  );

  IF (v_debit ->> 'success') IS DISTINCT FROM 'true' THEN
    RETURN v_debit;
  END IF;

  v_new_balance := (v_debit ->> 'new_balance')::numeric;

  UPDATE fuel_requests
  SET atf_status = 'Confirmed', rate_per_litre = p_rate, total_amount = v_total, confirmed_at = now(), confirmed_by = p_driver_id
  WHERE request_id = p_request_id;

  UPDATE "Trucks"
  SET fuel_balance = fuel_balance + v_request.litres
  WHERE plate_number = v_request.plate_number;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'haulage_balance', v_new_balance,
    'haulage_entry_id', v_debit -> 'entry_id',
    'total', v_total,
    'litres', v_request.litres
  );
END;
$$;

-- ================================================================
-- validate_maintenance_report
-- Validating a report is what spends the money, so this now posts a debit
-- against the Haulage fund and records it. No more silent clamp to zero.
-- ================================================================
CREATE OR REPLACE FUNCTION validate_maintenance_report(
  p_report_id uuid,
  p_admin_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report maintenance_reports%ROWTYPE;
  v_debit jsonb;
BEGIN
  SELECT * INTO v_report FROM maintenance_reports WHERE report_id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;
  IF v_report.status != 'Pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report is not Pending');
  END IF;

  v_debit := post_haulage_debit(
    'Maintenance',
    v_report.amount,
    v_report.maintenance_type || ' - ' || v_report.plate_number,
    p_report_id,
    COALESCE(p_admin_id, v_report.manager_id)
  );

  IF (v_debit ->> 'success') IS DISTINCT FROM 'true' THEN
    RETURN v_debit;
  END IF;

  UPDATE maintenance_reports
  SET status = 'Validated', validated_at = now(), validated_by = COALESCE(p_admin_id, v_report.manager_id)
  WHERE report_id = p_report_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', (v_debit ->> 'new_balance')::numeric,
    'haulage_entry_id', v_debit -> 'entry_id'
  );
END;
$$;

-- ================================================================
-- deduct_maintenance_balance (bulk procurement)
-- ================================================================
CREATE OR REPLACE FUNCTION deduct_maintenance_balance(
  p_amount numeric,
  p_item_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
  v_procurement_id uuid;
  v_debit jsonb;
BEGIN
  -- Validate before inserting, so a rejected procurement never leaves an orphan
  -- bulk_procurement row behind.
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid amount is required');
  END IF;

  v_procurement_id := gen_random_uuid();

  INSERT INTO bulk_procurement (procurement_id, item_name, total_amount, notes, logged_by)
  VALUES (v_procurement_id, p_item_name, p_amount, p_notes, p_admin_id);

  v_debit := post_haulage_debit('Procurement', p_amount, p_item_name, v_procurement_id, p_admin_id);

  IF (v_debit ->> 'success') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION '%', COALESCE(v_debit ->> 'error', 'Haulage debit failed');
  END IF;

  v_new_balance := (v_debit ->> 'new_balance')::numeric;

  RETURN jsonb_build_object(
    'success', true,
    'procurement_id', v_procurement_id,
    'entry_id', v_debit -> 'entry_id',
    'new_balance', v_new_balance
  );
END;
$$;

-- ================================================================
-- create_transaction
-- When the destination is Haulage, the top-up is mirrored into the ledger so
-- the fund's money trail is complete in one place.
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
SET search_path = public
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
    SELECT current_balance INTO v_new_balance
    FROM maintenance_balance WHERE id = 1 FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Haulage fund not found';
    END IF;

    v_new_balance := v_new_balance + p_amount;

    UPDATE maintenance_balance
    SET current_balance = v_new_balance, updated_at = now()
    WHERE id = 1;

    INSERT INTO haulage_transactions (entry_type, direction, amount, description, source_id, created_by)
    VALUES ('TopUp', 'credit', p_amount,
            COALESCE(p_description, 'Top-up from ' || p_from_account),
            v_transaction_id, p_created_by);
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

-- ================================================================
-- add_maintenance_deposit
-- Credits the fund directly rather than through a bank top-up. Mirrored into
-- the ledger so the trail stays complete if this is ever wired up to a screen.
-- ================================================================
CREATE OR REPLACE FUNCTION add_maintenance_deposit(
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deposit_id uuid;
  v_new_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid amount is required');
  END IF;

  v_deposit_id := gen_random_uuid();

  INSERT INTO maintenance_deposits (deposit_id, amount, note, deposited_by)
  VALUES (v_deposit_id, p_amount, p_note, p_admin_id);

  UPDATE maintenance_balance
  SET current_balance = current_balance + p_amount, updated_at = now()
  WHERE id = 1
  RETURNING current_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Haulage fund not found';
  END IF;

  INSERT INTO haulage_transactions (entry_type, direction, amount, description, source_id, created_by)
  VALUES ('Deposit', 'credit', p_amount, COALESCE(p_note, 'Maintenance deposit'), v_deposit_id, p_admin_id);

  RETURN jsonb_build_object('success', true, 'deposit_id', v_deposit_id, 'new_balance', v_new_balance);
END;
$$;

-- ================================================================
-- authorise_cash_expense
-- Haulage is no longer an office, so nothing should ever be routed here for it.
-- Kept office-only to make that explicit rather than silently dual-writing.
-- ================================================================
CREATE OR REPLACE FUNCTION authorise_cash_expense(
  p_expense_id uuid,
  p_admin_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF v_expense.office_name = 'Haulage' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Haulage is not an office. Use maintenance, procurement or ATF instead.');
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

-- ================================================================
-- Cleanup: Haulage was used as a pseudo-office while it was really a fund, so
-- the rows in there are meaningless test data. Remove them.
-- ================================================================
DELETE FROM cash_expense_items
WHERE expense_id IN (SELECT expense_id FROM cash_expenses WHERE office_name = 'Haulage');

DELETE FROM cash_expenses WHERE office_name = 'Haulage';
DELETE FROM cash_deposits WHERE office_name = 'Haulage';

REVOKE ALL ON FUNCTION post_haulage_debit(text, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION confirm_fuel_receipt(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION validate_maintenance_report(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION deduct_maintenance_balance(numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_transaction(text, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION add_maintenance_deposit(numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION authorise_cash_expense(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION post_haulage_debit(text, numeric, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION confirm_fuel_receipt(uuid, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION validate_maintenance_report(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION deduct_maintenance_balance(numeric, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_transaction(text, text, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION add_maintenance_deposit(numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION authorise_cash_expense(uuid, uuid, text) TO service_role;
