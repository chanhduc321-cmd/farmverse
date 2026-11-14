ALTER TABLE farm_trade_demo_runs
  ADD COLUMN IF NOT EXISTS seller_visit_at timestamptz,
  ADD COLUMN IF NOT EXISTS buyer_visit_at timestamptz;
