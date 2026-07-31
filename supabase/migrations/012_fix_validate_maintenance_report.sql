-- Fix validate_maintenance_report: maintenance_reports has no reported_by column;
-- the reporter is stored in manager_id.
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
  SET status = 'Validated', validated_at = now(), validated_by = COALESCE(p_admin_id, v_report.manager_id)
  WHERE report_id = p_report_id;

  SELECT current_balance INTO v_balance FROM maintenance_balance WHERE id = 1 FOR UPDATE;
  v_balance := GREATEST(0, v_balance - v_report.amount);
  UPDATE maintenance_balance SET current_balance = v_balance, updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'new_balance', v_balance);
END;
$$;
