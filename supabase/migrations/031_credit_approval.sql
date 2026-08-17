-- Credit approval workflow.
-- When a broker confirms a stop or store sale on credit, a credit_approvals
-- record is created and linked to the source. The designated credit manager
-- reviews and approves/rejects before the transaction can be confirmed.

-- 1. credit_managers table (role-specific profile for CreditManager role)
CREATE TABLE credit_managers (
  manager_id   UUID PRIMARY KEY,
  full_name    TEXT NOT NULL,
  phone_number TEXT
);

ALTER TABLE credit_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_managers_select_all" ON credit_managers;
CREATE POLICY "credit_managers_select_all" ON credit_managers
  FOR SELECT USING (true);

-- 2. credit_approvals table
CREATE TABLE credit_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type       TEXT NOT NULL CHECK (source_type IN ('stop', 'store_sale')),
  source_id         UUID NOT NULL,
  broker_id         UUID NOT NULL,
  credit_manager_id UUID NOT NULL REFERENCES credit_managers(manager_id),
  area              TEXT NOT NULL,
  product           TEXT NOT NULL,
  quantity          INTEGER,
  company_price     NUMERIC,
  adjusted_price    NUMERIC,
  status            TEXT NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  rejection_reason  TEXT,
  reviewed_by       UUID,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_credit_approvals_status ON credit_approvals (status);
CREATE INDEX idx_credit_approvals_manager ON credit_approvals (credit_manager_id);
CREATE INDEX idx_credit_approvals_source ON credit_approvals (source_type, source_id);

ALTER TABLE credit_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_approvals_select_all" ON credit_approvals;
CREATE POLICY "credit_approvals_select_all" ON credit_approvals
  FOR SELECT USING (true);

-- 3. Track credit lifecycle on source rows
ALTER TABLE "Stops"
  ADD COLUMN on_credit BOOLEAN DEFAULT false,
  ADD COLUMN credit_approval_id UUID;

ALTER TABLE "store_sales"
  ADD COLUMN on_credit BOOLEAN DEFAULT false,
  ADD COLUMN credit_approval_id UUID;

-- 4. Add credit_status to price_adjustments for combined discount+credit flow
ALTER TABLE price_adjustments
  ADD COLUMN credit_status TEXT DEFAULT 'none'
      CHECK (credit_status IN ('none', 'pending', 'approved', 'rejected'));
