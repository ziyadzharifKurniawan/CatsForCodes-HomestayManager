CREATE TABLE IF NOT EXISTS homestay_bookings (
  id SERIAL PRIMARY KEY,
  booking_no INTEGER,
  invoice_no TEXT,
  property TEXT,
  payment_method TEXT,
  guest_name TEXT NOT NULL,
  persons INTEGER,
  check_in_date DATE,
  month TEXT,
  stay_dates TEXT,
  nights TEXT,
  revenue_total NUMERIC,
  cost_plan_total NUMERIC,
  actual_cost_total NUMERIC,
  result_rp NUMERIC,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_line_items (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES homestay_bookings(id) ON DELETE CASCADE,
  detail_type TEXT NOT NULL,
  rev_satuan NUMERIC,
  rev_total NUMERIC,
  cost_qty NUMERIC,
  cost_plan_rp NUMERIC,
  actual_cost NUMERIC,
  owner_pct NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_booking_line_items_booking_id
  ON booking_line_items(booking_id);
