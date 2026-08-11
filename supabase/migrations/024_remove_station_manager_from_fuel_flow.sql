-- 024_remove_station_manager_from_fuel_flow.sql
-- Station manager is removed from the fuel flow.
-- New flow: Truck Officer initiates -> Truck Admin authorises -> Driver confirms receipt (enters rate).
-- The driver's confirmation now also handles pricing + balance deduction that dispense_fuel used to do.

-- ================================================================
-- confirm_fuel_receipt (rewritten for the new flow)
-- Moves an ATF directly from Authorised to Confirmed, computes the
-- total from the driver-entered rate, deducts from the fuel company
-- balance and credits the truck's fuel balance.
-- ================================================================
CREATE OR REPLACE FUNCTION confirm_fuel_receipt(
  p_request_id uuid,
  p_driver_id uuid,
  p_rate numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request fuel_requests%ROWTYPE;
  v_company_current_balance numeric;
  v_total numeric;
BEGIN
  SELECT * INTO v_request FROM fuel_requests WHERE request_id = p_request_id AND atf_status = 'Authorised' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ATF not found or not in Authorised status');
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid rate per litre is required');
  END IF;

  v_total := v_request.litres * p_rate;

  SELECT current_balance INTO v_company_current_balance
  FROM fuel_companies WHERE company_id = v_request.company_id FOR UPDATE;
  IF v_company_current_balance < v_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient company balance');
  END IF;

  UPDATE fuel_requests
  SET atf_status = 'Confirmed', rate_per_litre = p_rate, total_amount = v_total, confirmed_at = now(), confirmed_by = p_driver_id
  WHERE request_id = p_request_id;

  UPDATE fuel_companies
  SET current_balance = current_balance - v_total
  WHERE company_id = v_request.company_id;

  UPDATE "Trucks"
  SET fuel_balance = fuel_balance + v_request.litres
  WHERE plate_number = v_request.plate_number;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_company_current_balance - v_total,
    'total', v_total,
    'litres', v_request.litres
  );
END;
$$;

-- ================================================================
-- add_fuel_deposit (replaces the confirm/decline deposit flow)
-- Top-ups now credit the fuel company balance immediately. A deposit
-- record is kept with status 'Confirmed' for the audit trail.
-- ================================================================
CREATE OR REPLACE FUNCTION add_fuel_deposit(
  p_company_id uuid,
  p_amount numeric,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deposit_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid amount is required');
  END IF;

  v_deposit_id := gen_random_uuid();

  INSERT INTO fuel_deposits (deposit_id, company_id, amount, note, status, confirmed_at)
  VALUES (v_deposit_id, p_company_id, p_amount, p_note, 'Confirmed', now());

  UPDATE fuel_companies
  SET current_balance = current_balance + p_amount
  WHERE company_id = p_company_id;

  RETURN jsonb_build_object('success', true, 'deposit_id', v_deposit_id, 'amount', p_amount);
END;
$$;
