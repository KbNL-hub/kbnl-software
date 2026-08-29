CREATE TABLE IF NOT EXISTS customer_charts (
  chart_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     VARCHAR REFERENCES Customers(customer_id),
  customer_name   VARCHAR NOT NULL,
  broker_id       UUID REFERENCES Brokers(broker_id),
  record_type     VARCHAR NOT NULL CHECK (record_type IN ('Credit', 'Sales')),
  record_date     DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Bank details
  bank_name       TEXT,
  teller_no       TEXT,

  amount          NUMERIC NOT NULL DEFAULT 0,

  -- Sales details (only for record_type = 'Sales')
  location        TEXT,
  product         TEXT,
  trip_ref        UUID REFERENCES Trips(trip_id),
  quantity        NUMERIC,
  rate            NUMERIC,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_customer_charts_customer ON customer_charts(customer_id);
CREATE INDEX idx_customer_charts_broker ON customer_charts(broker_id);
CREATE INDEX idx_customer_charts_date ON customer_charts(record_date);

CREATE OR REPLACE FUNCTION update_customer_charts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_charts_updated_at
  BEFORE UPDATE ON customer_charts
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_charts_updated_at();

ALTER TABLE customer_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_charts_select_all" ON customer_charts;
CREATE POLICY "customer_charts_select_all" ON customer_charts
  FOR SELECT USING (true);
