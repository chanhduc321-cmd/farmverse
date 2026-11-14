CREATE TABLE IF NOT EXISTS farm_trade_demo_runs (
  id uuid PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  seller_farm_id uuid NOT NULL REFERENCES farm_accounts(farm_id),
  buyer_farm_id uuid NOT NULL REFERENCES farm_accounts(farm_id),
  seller_wallet jsonb NOT NULL,
  buyer_wallet jsonb NOT NULL,
  item_id uuid NOT NULL UNIQUE,
  seller_offer_id uuid NOT NULL UNIQUE,
  buyer_offer_id uuid NOT NULL UNIQUE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  item_owner text NOT NULL DEFAULT 'seller' CHECK (item_owner IN ('seller', 'npc', 'basket')),
  seller_dismissed boolean NOT NULL DEFAULT false,
  buyer_dismissed boolean NOT NULL DEFAULT false,
  badge_awarded_at timestamptz,
  CHECK (seller_farm_id <> buyer_farm_id),
  CHECK (seller_wallet <> buyer_wallet),
  CHECK ((item_owner = 'basket') = (badge_awarded_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS farm_trade_demo_single_active_run ON farm_trade_demo_runs(active) WHERE active;

CREATE TABLE IF NOT EXISTS farm_trade_demo_orders (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES farm_trade_demo_runs(id),
  role text NOT NULL CHECK (role IN ('seller', 'buyer')),
  created_revision integer NOT NULL,
  intent jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('awaiting_approval', 'processing', 'verifying', 'succeeded', 'failed', 'cancelled', 'expired')),
  payment jsonb,
  sponsor_fee_atomic numeric(78, 0) NOT NULL DEFAULT 0 CHECK (sponsor_fee_atomic >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  fulfilled_at timestamptz,
  UNIQUE (run_id, created_revision),
  CHECK ((status = 'succeeded') = (fulfilled_at IS NOT NULL)),
  CHECK (status <> 'succeeded' OR (payment IS NOT NULL AND payment->>'status' = 'confirmed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS farm_trade_demo_one_reserved_order ON farm_trade_demo_orders(run_id)
  WHERE status IN ('awaiting_approval', 'processing', 'verifying');
CREATE UNIQUE INDEX IF NOT EXISTS farm_trade_demo_one_fulfillment ON farm_trade_demo_orders(run_id, role)
  WHERE status = 'succeeded';
CREATE UNIQUE INDEX IF NOT EXISTS farm_trade_demo_one_payment ON farm_trade_demo_orders(
  (payment #>> '{reference,providerId}'), (payment #>> '{reference,network}'), (payment #>> '{reference,paymentId}')
) WHERE payment IS NOT NULL;

CREATE TABLE IF NOT EXISTS farm_trade_demo_requests (
  farm_id uuid NOT NULL REFERENCES farm_accounts(farm_id),
  request_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES farm_trade_demo_runs(id),
  offer_id uuid NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  action text NOT NULL CHECK (action IN ('accept', 'skip')),
  order_id uuid REFERENCES farm_trade_demo_orders(id),
  PRIMARY KEY (farm_id, request_id),
  CHECK ((action = 'accept') = (order_id IS NOT NULL))
);

ALTER TABLE farm_trade_demo_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_trade_demo_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_trade_demo_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON farm_trade_demo_runs, farm_trade_demo_orders, farm_trade_demo_requests FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL ON farm_trade_demo_runs, farm_trade_demo_orders, farm_trade_demo_requests FROM %I', api_role);
  END LOOP;
END $$;
