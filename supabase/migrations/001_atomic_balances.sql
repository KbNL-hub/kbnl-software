-- 001_atomic_balances.sql
-- Atomic RPC functions for truck-system
-- Already applied (first 4): validate_maintenance_report, confirm_fuel_receipt, confirm_fuel_deposit, invalidate_atf
-- To run (last 4): decline_fuel_deposit, dispense_fuel, deduct_maintenance_balance, add_maintenance_deposit

-- ================================================================
-- validate_maintenance_report (already applied)
-- ================================================================
CREATE OR REPLACE FUNCTION validate_maintenance_report(
  p_report_id uuid,
  p_admin_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_report maintenance_reports%ROWTYPE;
  v_balance numeric;
BEGIN
  SELECT * INTO v_report FROM maintenance_reports WHERE report_id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;
  IF v_report.status != 'Pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report is not Pending');
  END IF;

  UPDATE maintenance_reports
  SET status = 'Validated', validated_at = now(), validated_by = COALESCE(p_admin_id, v_report.reported_by)
  WHERE report_id = p_report_id;

  SELECT current_balance INTO v_balance FROM maintenance_balance WHERE id = 1 FOR UPDATE;
  v_balance := GREATEST(0, v_balance - v_report.amount);
  UPDATE maintenance_balance SET current_balance = v_balance, updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'new_balance', v_balance);
END;
$$;

-- ================================================================
-- confirm_fuel_receipt (already applied)
-- ================================================================
CREATE OR REPLACE FUNCTION confirm_fuel_receipt(
  p_request_id uuid,
  p_driver_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request fuel_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM fuel_requests WHERE request_id = p_request_id AND atf_status = 'Dispensed' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ATF not found or not in Dispensed status');
  END IF;

  UPDATE fuel_requests
  SET atf_status = 'Confirmed', confirmed_at = now(), confirmed_by = p_driver_id
  WHERE request_id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ================================================================
-- confirm_fuel_deposit (already applied)
-- ================================================================
CREATE OR REPLACE FUNCTION confirm_fuel_deposit(
  p_deposit_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit fuel_deposits%ROWTYPE;
BEGIN
  SELECT * INTO v_deposit FROM fuel_deposits WHERE deposit_id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit not found');
  END IF;
  IF v_deposit.status != 'Pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit is not Pending');
  END IF;

  UPDATE fuel_deposits SET status = 'Confirmed', confirmed_at = now() WHERE deposit_id = p_deposit_id;

  UPDATE fuel_companies
  SET current_balance = current_balance + v_deposit.amount
  WHERE company_id = v_deposit.company_id;

  RETURN jsonb_build_object('success', true, 'amount', v_deposit.amount);
END;
$$;

-- ================================================================
-- invalidate_atf (already applied)
-- ================================================================
CREATE OR REPLACE FUNCTION invalidate_atf(
  p_request_id uuid,
  p_reason text,
  p_status_filter text DEFAULT 'Authorised'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request fuel_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM fuel_requests WHERE request_id = p_request_id AND (p_status_filter IS NULL OR atf_status = p_status_filter) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ATF not found or cannot be invalidated');
  END IF;

  UPDATE fuel_requests
  SET atf_status = 'Invalidated', invalidation_reason = p_reason, invalidated_at = now()
  WHERE request_id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ================================================================
-- decline_fuel_deposit (RUN THIS)
-- ================================================================
CREATE OR REPLACE FUNCTION decline_fuel_deposit(
  p_deposit_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit fuel_deposits%ROWTYPE;
BEGIN
  SELECT * INTO v_deposit FROM fuel_deposits WHERE deposit_id = p_deposit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit not found');
  END IF;
  IF v_deposit.status != 'Pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deposit is not Pending');
  END IF;

  UPDATE fuel_deposits SET status = 'Declined', declined_at = now() WHERE deposit_id = p_deposit_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ================================================================
-- dispense_fuel (RUN THIS)
-- ================================================================
CREATE OR REPLACE FUNCTION dispense_fuel(
  p_request_id uuid,
  p_rate numeric,
  p_total numeric,
  p_plate_number text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request fuel_requests%ROWTYPE;
  v_company_current_balance numeric;
BEGIN
  SELECT * INTO v_request FROM fuel_requests WHERE request_id = p_request_id AND atf_status = 'Authorised' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ATF not found or not Authorised');
  END IF;

  SELECT current_balance INTO v_company_current_balance
  FROM fuel_companies WHERE company_id = v_request.company_id FOR UPDATE;
  IF v_company_current_balance < p_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient company balance');
  END IF;

  UPDATE fuel_requests
  SET atf_status = 'Dispensed', rate_per_litre = p_rate, total_amount = p_total, dispensed_at = now()
  WHERE request_id = p_request_id;

  UPDATE fuel_companies
  SET current_balance = current_balance - p_total
  WHERE company_id = v_request.company_id;

  IF p_plate_number IS NOT NULL THEN
    UPDATE "Trucks" SET fuel_balance = fuel_balance + v_request.litres WHERE plate_number = p_plate_number;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_company_current_balance - p_total,
    'litres', v_request.litres
  );
END;
$$;

-- ================================================================
-- deduct_maintenance_balance (RUN THIS)
-- ================================================================
CREATE OR REPLACE FUNCTION deduct_maintenance_balance(
  p_amount numeric,
  p_item_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric;
  v_procurement_id uuid;
BEGIN
  v_procurement_id := gen_random_uuid();

  INSERT INTO bulk_procurement (procurement_id, item_name, total_amount, notes, logged_by)
  VALUES (v_procurement_id, p_item_name, p_amount, p_notes, p_admin_id);

  UPDATE maintenance_balance
  SET current_balance = GREATEST(0, current_balance - p_amount), updated_at = now()
  WHERE id = 1
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object('success', true, 'procurement_id', v_procurement_id, 'new_balance', v_new_balance);
END;
$$;

-- ================================================================
-- add_maintenance_deposit (RUN THIS)
-- ================================================================
CREATE OR REPLACE FUNCTION add_maintenance_deposit(
  p_amount numeric,
  p_note text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit_id uuid;
  v_new_balance numeric;
BEGIN
  v_deposit_id := gen_random_uuid();

  INSERT INTO maintenance_deposits (deposit_id, amount, note, deposited_by)
  VALUES (v_deposit_id, p_amount, p_note, p_admin_id);

  UPDATE maintenance_balance
  SET current_balance = current_balance + p_amount, updated_at = now()
  WHERE id = 1
  RETURNING current_balance INTO v_new_balance;

  RETURN jsonb_build_object('success', true, 'deposit_id', v_deposit_id, 'new_balance', v_new_balance);
END;
$$;
